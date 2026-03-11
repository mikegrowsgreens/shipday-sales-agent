import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * POST /api/bdr/campaigns/edit
 * Save manually-edited email subject/body for a BDR lead.
 */
export async function POST(request: NextRequest) {
  try {
    const { leadId, subject, body } = await request.json();

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 });
    }
    if (!subject && !body) {
      return NextResponse.json({ error: 'subject or body required' }, { status: 400 });
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (subject !== undefined) {
      fields.push(`email_subject = $${pi++}`);
      params.push(subject);
    }
    if (body !== undefined) {
      fields.push(`email_body = $${pi++}`);
      params.push(body);
    }
    fields.push('updated_at = NOW()');

    params.push(leadId);

    await query(
      `UPDATE bdr.leads SET ${fields.join(', ')} WHERE lead_id = $${pi}`,
      params
    );

    return NextResponse.json({ success: true, leadId });
  } catch (error) {
    console.error('[bdr/campaigns/edit] error:', error);
    return NextResponse.json({ error: 'Failed to save edit' }, { status: 500 });
  }
}
