import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

/**
 * POST /api/phone/email-bridge - Generate follow-up email from call notes + brain context
 * Body: { call_id, contact_id }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { call_id, contact_id } = body;

    if (!call_id && !contact_id) {
      return NextResponse.json({ error: 'call_id or contact_id required' }, { status: 400 });
    }

    // Get call details
    const callRows = await query<{
      call_id: number; contact_id: number; disposition: string | null;
      duration_seconds: number | null; notes: string | null;
      created_at: string;
    }>(
      call_id
        ? `SELECT call_id, contact_id, disposition, duration_seconds, notes, created_at FROM crm.phone_calls WHERE call_id = $1`
        : `SELECT call_id, contact_id, disposition, duration_seconds, notes, created_at FROM crm.phone_calls WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [call_id || contact_id]
    );

    if (callRows.length === 0) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }
    const call = callRows[0];

    // Get contact
    const contactRows = await query<{
      first_name: string | null; last_name: string | null;
      business_name: string | null; email: string | null;
      lifecycle_stage: string; title: string | null;
    }>(
      `SELECT first_name, last_name, business_name, email, lifecycle_stage, title
       FROM crm.contacts WHERE contact_id = $1`,
      [call.contact_id]
    );

    if (contactRows.length === 0) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    const contact = contactRows[0];

    // Get brain context
    const brainContent = await query<{ content_type: string; raw_text: string }>(
      `SELECT content_type, raw_text
       FROM brain.internal_content
       WHERE is_active = true AND content_type IN ('value_prop_intelligence', 'deal_intelligence')
       ORDER BY updated_at DESC LIMIT 2`
    );

    const contactName = contact.first_name || 'there';
    const brainContext = brainContent.map(b => b.raw_text.substring(0, 400)).join('\n\n');

    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Generate a follow-up email after a phone call. Keep it concise and professional.

CONTACT: ${contactName} ${contact.last_name || ''} at ${contact.business_name || 'their company'}
Title: ${contact.title || 'Unknown'}
Stage: ${contact.lifecycle_stage}

CALL DETAILS:
- Disposition: ${call.disposition || 'connected'}
- Duration: ${call.duration_seconds ? Math.floor(call.duration_seconds / 60) + ' minutes' : 'unknown'}
- Notes: ${call.notes || 'No notes recorded'}
- Date: ${new Date(call.created_at).toLocaleDateString()}

BUSINESS CONTEXT:
${brainContext}

Generate a JSON response:
{
  "subject": "Email subject line",
  "body": "Email body (plain text, use \\n for line breaks). Reference specific things from the call notes. Include a clear next step/CTA."
}`
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to generate email' }, { status: 500 });
    }

    const email = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      subject: email.subject,
      body: email.body,
      contact_email: contact.email,
      contact_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
      call_id: call.call_id,
    });
  } catch (error) {
    console.error('[phone/email-bridge] error:', error);
    return NextResponse.json({ error: 'Failed to generate follow-up email' }, { status: 500 });
  }
}
