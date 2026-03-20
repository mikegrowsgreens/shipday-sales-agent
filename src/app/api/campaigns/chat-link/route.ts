import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import crypto from 'crypto';

/**
 * GET /api/campaigns/chat-link?token=<tracking_token>
 *
 * Tracking redirect for campaign email → AI chatbot handoff.
 * When a prospect clicks the chat link in a campaign email:
 * 1. Validates the tracking token
 * 2. Records the click event
 * 3. Redirects to the chat page with campaign context params
 *
 * POST /api/campaigns/chat-link
 *
 * Generates a tracking link for embedding in campaign emails.
 * Called during campaign email generation to create the chat CTA link.
 */

// ─── GET: Track click & redirect to chat ─────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    // Look up the AI step execution by tracking token
    const rows = await query<{
      id: number;
      lead_id: number;
      campaign_email_id: number;
      channel: string;
      campaign_context: {
        campaign_template_id: number;
        campaign_step: number;
        tier: string | null;
        angle: string | null;
        variant: string | null;
        business_name: string | null;
        contact_name: string | null;
        contact_email: string | null;
      };
    }>(
      `SELECT id, lead_id, campaign_email_id, channel, campaign_context
       FROM bdr.campaign_ai_steps
       WHERE tracking_token = $1 AND channel = 'ai_chat'`,
      [token]
    );

    if (rows.length === 0) {
      // Fallback: redirect to generic chat page
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
      return NextResponse.redirect(`${baseUrl}/chat`);
    }

    const step = rows[0];
    const ctx = step.campaign_context;

    // Record the click / chat_started event
    await query(
      `UPDATE bdr.campaign_ai_steps
       SET status = 'chat_started', started_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status IN ('pending', 'link_sent')`,
      [step.id]
    );

    // Record touchpoint
    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
       SELECT c.contact_id, 'email', 'campaign_chat_clicked', 'inbound', 'campaign',
              'Clicked campaign chat link',
              jsonb_build_object(
                'lead_id', $2,
                'campaign_template_id', $3,
                'campaign_step', $4,
                'tracking_token', $5
              ),
              NOW()
       FROM crm.contacts c WHERE c.bdr_lead_id = $1::text`,
      [step.lead_id, step.lead_id, ctx.campaign_template_id, ctx.campaign_step, token]
    );

    // Build redirect URL with campaign context
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    const chatParams = new URLSearchParams({
      src: 'campaign',
      token: token,
      cid: String(ctx.campaign_template_id),
      step: String(ctx.campaign_step),
      angle: ctx.angle || '',
      tier: ctx.tier || '',
      lead: String(step.lead_id),
    });

    return NextResponse.redirect(`${baseUrl}/chat?${chatParams.toString()}`);
  } catch (error) {
    console.error('[campaign-chat-link] GET error:', error);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
    return NextResponse.redirect(`${baseUrl}/chat`);
  }
}

// ─── POST: Generate a tracking link ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      lead_id,
      campaign_email_id,
      campaign_template_id,
      campaign_step,
      tier,
      angle,
      variant,
      business_name,
      contact_name,
      contact_email,
      org_id,
    } = body as {
      lead_id: number;
      campaign_email_id: number;
      campaign_template_id: number;
      campaign_step: number;
      tier: string | null;
      angle: string | null;
      variant: string | null;
      business_name: string | null;
      contact_name: string | null;
      contact_email: string | null;
      org_id?: number;
    };

    if (!lead_id || !campaign_email_id) {
      return NextResponse.json({ error: 'lead_id and campaign_email_id required' }, { status: 400 });
    }

    // Generate a unique tracking token
    const trackingToken = crypto.randomBytes(24).toString('hex');

    const campaignContext = {
      campaign_template_id,
      campaign_step,
      lead_id,
      tier,
      angle,
      variant,
      business_name,
      contact_name,
      contact_email,
      source_channel: 'email' as const,
    };

    // Insert the AI step execution record
    await query(
      `INSERT INTO bdr.campaign_ai_steps
       (lead_id, campaign_email_id, channel, status, tracking_token, campaign_context, org_id, created_at, updated_at)
       VALUES ($1, $2, 'ai_chat', 'link_sent', $3, $4::jsonb, $5, NOW(), NOW())`,
      [lead_id, campaign_email_id, trackingToken, JSON.stringify(campaignContext), org_id || 1]
    );

    // Build the tracking link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
    const chatLink = `${baseUrl}/api/campaigns/chat-link?token=${trackingToken}`;

    return NextResponse.json({
      tracking_token: trackingToken,
      chat_link: chatLink,
      campaign_context: campaignContext,
    });
  } catch (error) {
    console.error('[campaign-chat-link] POST error:', error);
    return NextResponse.json({ error: 'Failed to generate chat link' }, { status: 500 });
  }
}
