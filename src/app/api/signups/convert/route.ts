import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/signups/convert
 * Convert stalled signups into BDR leads for outreach.
 *
 * Body: { signup_ids: number[] } — convert specific signups
 *   or: { stalled: true } — convert all stalled signups (signup stage, >7 days old)
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json();
    const { signup_ids, stalled } = body;

    let signupsToConvert;

    if (stalled) {
      // Grab all stalled signups
      signupsToConvert = await query<{
        signup_id: number;
        business_name: string | null;
        contact_name: string | null;
        contact_email: string | null;
        contact_phone: string | null;
        state: string | null;
        city: string | null;
        plan_type: string | null;
      }>(
        `SELECT signup_id, business_name, contact_name, contact_email, contact_phone, state, city, plan_type
         FROM crm.inbound_leads
         WHERE funnel_stage = 'signup'
         AND converted_to_lead = false
         AND signup_date < NOW() - INTERVAL '7 days'
         AND contact_email IS NOT NULL
         AND org_id = $1
         LIMIT 100`,
        [orgId]
      );
    } else if (signup_ids?.length > 0) {
      signupsToConvert = await query<{
        signup_id: number;
        business_name: string | null;
        contact_name: string | null;
        contact_email: string | null;
        contact_phone: string | null;
        state: string | null;
        city: string | null;
        plan_type: string | null;
      }>(
        `SELECT signup_id, business_name, contact_name, contact_email, contact_phone, state, city, plan_type
         FROM crm.inbound_leads
         WHERE signup_id = ANY($1)
         AND converted_to_lead = false
         AND org_id = $2`,
        [signup_ids, orgId]
      );
    } else {
      return NextResponse.json({ error: 'Provide signup_ids or stalled=true' }, { status: 400 });
    }

    if (!signupsToConvert || signupsToConvert.length === 0) {
      return NextResponse.json({ converted: 0, message: 'No eligible signups to convert' });
    }

    let converted = 0;
    const results: { signup_id: number; contact_id: number }[] = [];

    for (const signup of signupsToConvert) {
      if (!signup.contact_email) continue;

      // Parse first/last name from contact_name
      const nameParts = (signup.contact_name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || null;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      // Upsert into crm.contacts
      const contact = await queryOne<{ contact_id: number }>(
        `INSERT INTO crm.contacts (email, phone, first_name, last_name, business_name, lifecycle_stage, tags, metadata)
         VALUES ($1, $2, $3, $4, $5, 'raw', ARRAY['stalled-signup'], $6)
         ON CONFLICT (email) DO UPDATE SET
           phone = COALESCE(EXCLUDED.phone, crm.contacts.phone),
           first_name = COALESCE(EXCLUDED.first_name, crm.contacts.first_name),
           last_name = COALESCE(EXCLUDED.last_name, crm.contacts.last_name),
           business_name = COALESCE(EXCLUDED.business_name, crm.contacts.business_name),
           tags = ARRAY(SELECT DISTINCT unnest(crm.contacts.tags || ARRAY['stalled-signup'])),
           updated_at = NOW()
         RETURNING contact_id`,
        [
          signup.contact_email,
          signup.contact_phone,
          firstName,
          lastName,
          signup.business_name,
          JSON.stringify({
            source: 'stalled_signup',
            signup_id: signup.signup_id,
            plan_type: signup.plan_type,
            location: `${signup.city || ''}, ${signup.state || ''}`.trim(),
          }),
        ]
      );

      if (contact) {
        // Mark signup as converted
        await query(
          `UPDATE crm.inbound_leads
           SET converted_to_lead = true, converted_to_lead_at = NOW(), contact_id = $1
           WHERE signup_id = $2`,
          [contact.contact_id, signup.signup_id]
        );

        // Log funnel event
        await query(
          `INSERT INTO crm.signup_funnel_events (signup_id, from_stage, to_stage, source, metadata)
           VALUES ($1, 'signup', 'converted_to_lead', 'auto', $2)`,
          [signup.signup_id, JSON.stringify({ contact_id: contact.contact_id })]
        );

        // Log touchpoint
        await query(
          `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, body_preview, metadata, occurred_at)
           VALUES ($1, 'manual', 'lead_created', 'outbound', 'saleshub', 'Stalled signup converted to lead', $2, NOW())`,
          [contact.contact_id, JSON.stringify({ signup_id: signup.signup_id, plan_type: signup.plan_type })]
        );

        results.push({ signup_id: signup.signup_id, contact_id: contact.contact_id });
        converted++;
      }
    }

    return NextResponse.json({
      converted,
      total_eligible: signupsToConvert.length,
      results,
    });
  } catch (error) {
    console.error('[signups/convert] error:', error);
    return NextResponse.json({ error: 'Failed to convert signups' }, { status: 500 });
  }
}
