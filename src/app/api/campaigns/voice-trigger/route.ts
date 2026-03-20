import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { N8N_WEBHOOK_KEY } from '@/lib/config';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import crypto from 'crypto';

/**
 * POST /api/campaigns/voice-trigger
 *
 * Triggers an AI voice call for a lead based on campaign engagement.
 * Called by:
 * 1. process-scheduled when an ai_call step is due
 * 2. Reply processing when a positive reply is detected
 * 3. Warm lead prioritization when a lead hits the voice threshold
 *
 * The voice agent server is a separate PM2 process that handles the actual call.
 * This endpoint queues the call and notifies the voice server via webhook.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: either webhook key or tenant session
    const webhookKey = request.headers.get('x-webhook-key');
    const isWebhook = webhookKey === N8N_WEBHOOK_KEY;

    const body = await request.json();
    const {
      lead_id,
      campaign_template_id,
      campaign_step,
      trigger_reason,
      reply_content,
      angle,
      tier,
      org_id,
    } = body as {
      lead_id: number;
      campaign_template_id?: number;
      campaign_step?: number;
      trigger_reason: 'positive_reply' | 'campaign_step' | 'warm_lead' | 'manual';
      reply_content?: string;
      angle?: string;
      tier?: string;
      org_id?: number;
    };

    if (!lead_id || !trigger_reason) {
      return NextResponse.json({ error: 'lead_id and trigger_reason required' }, { status: 400 });
    }

    // Get lead details
    const leads = await query<{
      lead_id: number;
      contact_name: string | null;
      contact_email: string | null;
      business_name: string | null;
      phone: string | null;
      tier: string | null;
      city: string | null;
      state: string | null;
      cuisine_type: string | null;
      total_score: number | null;
      campaign_template_id: number | null;
      campaign_step: number | null;
      org_id: number;
    }>(
      `SELECT lead_id, contact_name, contact_email, business_name, phone,
              tier, city, state, cuisine_type, total_score,
              campaign_template_id, campaign_step, org_id
       FROM bdr.leads WHERE lead_id = $1`,
      [lead_id]
    );

    if (leads.length === 0) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const lead = leads[0];

    if (!lead.phone) {
      return NextResponse.json({
        error: 'Lead has no phone number',
        lead_id,
        fallback: 'ai_chat',
      }, { status: 422 });
    }

    // Build campaign context for the voice agent
    const campaignContext = {
      campaign_template_id: campaign_template_id || lead.campaign_template_id,
      campaign_step: campaign_step || lead.campaign_step,
      lead_id,
      tier: tier || lead.tier,
      angle: angle || null,
      variant: null,
      business_name: lead.business_name,
      contact_name: lead.contact_name,
      contact_email: lead.contact_email,
      source_channel: 'email' as const,
    };

    // Gather conversation history for context
    const chatHistory = await query<{ messages_count: number; qualification_slots: Record<string, unknown> }>(
      `SELECT messages_count, qualification_slots FROM brain.conversation_outcomes
       WHERE org_id = $1
         AND qualification_slots->>'email' = $2
       ORDER BY created_at DESC LIMIT 1`,
      [lead.org_id, lead.contact_email]
    ).catch(() => []);

    const emailHistory = await query<{ subject: string; angle: string; open_count: number }>(
      `SELECT es.subject, es.angle, es.open_count
       FROM bdr.email_sends es
       WHERE es.lead_id = $1 AND es.sent_at IS NOT NULL
       ORDER BY es.sent_at DESC LIMIT 3`,
      [lead_id]
    ).catch(() => []);

    // Build the call context for the voice agent
    const callContext = {
      trigger_reason,
      lead: {
        name: lead.contact_name,
        business: lead.business_name,
        phone: lead.phone,
        city: lead.city,
        state: lead.state,
        cuisine_type: lead.cuisine_type,
        tier: lead.tier,
        score: lead.total_score,
      },
      campaign: campaignContext,
      prior_engagement: {
        reply_content: reply_content || null,
        email_history: emailHistory.map(e => ({
          subject: e.subject,
          angle: e.angle,
          opened: e.open_count > 0,
        })),
        chat_qualification: chatHistory[0]?.qualification_slots || null,
        chat_messages: chatHistory[0]?.messages_count || 0,
      },
    };

    // Generate tracking token
    const trackingToken = crypto.randomBytes(24).toString('hex');

    // Create AI step execution record
    await query(
      `INSERT INTO bdr.campaign_ai_steps
       (lead_id, campaign_email_id, channel, status, tracking_token, campaign_context, org_id, created_at, updated_at)
       VALUES ($1, $2, 'ai_call', 'pending', $3, $4::jsonb, $5, NOW(), NOW())`,
      [
        lead_id,
        0, // No campaign_email_id for reply-triggered calls
        trackingToken,
        JSON.stringify({ ...campaignContext, call_context: callContext }),
        lead.org_id,
      ]
    );

    // Notify the voice agent server to initiate the call
    const voiceServerUrl = process.env.VOICE_AGENT_URL || 'http://localhost:3001';
    let callInitiated = false;

    try {
      const voiceResponse = await fetchWithTimeout(`${voiceServerUrl}/initiate-campaign-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking_token: trackingToken,
          phone: lead.phone,
          lead_id,
          org_id: lead.org_id,
          call_context: callContext,
        }),
        timeout: 10000,
      });

      if (voiceResponse.ok) {
        callInitiated = true;
        const voiceData = await voiceResponse.json();

        // Update status to call_initiated
        await query(
          `UPDATE bdr.campaign_ai_steps
           SET status = 'call_initiated', call_sid = $2, updated_at = NOW()
           WHERE tracking_token = $1`,
          [trackingToken, voiceData.call_sid || null]
        );
      }
    } catch (voiceErr) {
      console.error('[voice-trigger] Voice server unreachable:', voiceErr);
    }

    // If voice server is unavailable, create a task for human follow-up
    if (!callInitiated) {
      const contactRows = await query<{ contact_id: number }>(
        `SELECT contact_id FROM crm.contacts WHERE bdr_lead_id = $1::text LIMIT 1`,
        [lead_id]
      );

      if (contactRows.length > 0) {
        await query(
          `INSERT INTO crm.task_queue (contact_id, task_type, title, instructions, priority, status, due_at, created_at)
           VALUES ($1, 'call', $2, $3, 0, 'pending', NOW(), NOW())`,
          [
            contactRows[0].contact_id,
            `URGENT CALL: ${lead.contact_name || 'Prospect'} @ ${lead.business_name || 'Unknown'}`,
            `AI voice call could not be initiated. Reason: ${trigger_reason}. ${reply_content ? `Reply: "${reply_content.substring(0, 200)}"` : ''} Score: ${lead.total_score}. Call ASAP.`,
          ]
        );
      }

      // Update step status
      await query(
        `UPDATE bdr.campaign_ai_steps SET status = 'failed', outcome = 'voice_server_unavailable', updated_at = NOW()
         WHERE tracking_token = $1`,
        [trackingToken]
      );
    }

    // Record touchpoint
    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
       SELECT c.contact_id, 'phone', $2, 'outbound', 'campaign',
              $3,
              jsonb_build_object('lead_id', $4, 'trigger_reason', $5, 'tracking_token', $6, 'call_initiated', $7),
              NOW()
       FROM crm.contacts c WHERE c.bdr_lead_id = $1::text`,
      [
        lead_id,
        callInitiated ? 'ai_call_initiated' : 'ai_call_failed',
        `AI call ${callInitiated ? 'initiated' : 'queued'}: ${lead.business_name}`,
        lead_id,
        trigger_reason,
        trackingToken,
        callInitiated,
      ]
    );

    return NextResponse.json({
      success: true,
      call_initiated: callInitiated,
      tracking_token: trackingToken,
      lead_id,
      trigger_reason,
      fallback_task_created: !callInitiated,
    });
  } catch (error) {
    console.error('[voice-trigger] error:', error);
    return NextResponse.json({ error: 'Voice trigger failed' }, { status: 500 });
  }
}
