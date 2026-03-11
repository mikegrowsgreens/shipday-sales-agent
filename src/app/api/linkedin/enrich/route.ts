import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

/**
 * POST /api/linkedin/enrich
 * Trigger LinkedIn profile enrichment via n8n.
 * Pulls company info, role, connections from LinkedIn profiles.
 *
 * Body: { contact_id } or { contact_ids: number[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contact_id, contact_ids } = body;

    const ids = contact_ids || (contact_id ? [contact_id] : []);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'contact_id or contact_ids required' }, { status: 400 });
    }

    const contacts = await query<{
      contact_id: number;
      linkedin_url: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string;
      business_name: string | null;
    }>(
      `SELECT contact_id, linkedin_url, first_name, last_name, email, business_name
       FROM crm.contacts WHERE contact_id = ANY($1)`,
      [ids]
    );

    const n8nBaseUrl = process.env.N8N_BASE_URL || 'https://automation.mikegrowsgreens.com';
    const enrichResults: { contact_id: number; status: string; data?: Record<string, unknown> }[] = [];

    for (const contact of contacts) {
      if (!contact.linkedin_url) {
        enrichResults.push({ contact_id: contact.contact_id, status: 'skipped_no_url' });
        continue;
      }

      try {
        // Call n8n webhook for LinkedIn enrichment
        const response = await fetch(`${n8nBaseUrl}/webhook/linkedin-enrich`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: contact.contact_id,
            linkedin_url: contact.linkedin_url,
            first_name: contact.first_name,
            last_name: contact.last_name,
            email: contact.email,
            business_name: contact.business_name,
          }),
        });

        const result = await response.json().catch(() => ({ status: 'triggered' }));

        // If n8n returns enrichment data, store it
        if (result.headline || result.company_name || result.role_title) {
          await query(
            `INSERT INTO crm.linkedin_profiles
               (contact_id, linkedin_url, headline, company_name, company_size, industry,
                location, role_title, connections, summary, experience, raw_data)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             ON CONFLICT (linkedin_url) DO UPDATE SET
               headline = COALESCE(EXCLUDED.headline, crm.linkedin_profiles.headline),
               company_name = COALESCE(EXCLUDED.company_name, crm.linkedin_profiles.company_name),
               company_size = COALESCE(EXCLUDED.company_size, crm.linkedin_profiles.company_size),
               industry = COALESCE(EXCLUDED.industry, crm.linkedin_profiles.industry),
               location = COALESCE(EXCLUDED.location, crm.linkedin_profiles.location),
               role_title = COALESCE(EXCLUDED.role_title, crm.linkedin_profiles.role_title),
               connections = COALESCE(EXCLUDED.connections, crm.linkedin_profiles.connections),
               summary = COALESCE(EXCLUDED.summary, crm.linkedin_profiles.summary),
               experience = COALESCE(EXCLUDED.experience, crm.linkedin_profiles.experience),
               raw_data = EXCLUDED.raw_data,
               enriched_at = NOW(),
               updated_at = NOW()`,
            [
              contact.contact_id,
              contact.linkedin_url,
              result.headline || null,
              result.company_name || null,
              result.company_size || null,
              result.industry || null,
              result.location || null,
              result.role_title || null,
              result.connections || null,
              result.summary || null,
              JSON.stringify(result.experience || []),
              JSON.stringify(result),
            ]
          );

          // Update contact title and business if enriched
          const contactUpdates: string[] = [];
          const contactParams: unknown[] = [];
          let cpi = 1;

          if (result.role_title) {
            contactUpdates.push(`title = COALESCE(title, $${cpi})`);
            contactParams.push(result.role_title);
            cpi++;
          }
          if (result.company_name) {
            contactUpdates.push(`business_name = COALESCE(business_name, $${cpi})`);
            contactParams.push(result.company_name);
            cpi++;
          }

          if (contactUpdates.length > 0) {
            contactParams.push(contact.contact_id);
            await query(
              `UPDATE crm.contacts SET ${contactUpdates.join(', ')}, updated_at = NOW()
               WHERE contact_id = $${cpi}`,
              contactParams
            );
          }
        }

        // Log touchpoint
        await query(
          `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, body_preview, metadata, occurred_at)
           VALUES ($1, 'linkedin', 'enrichment', 'outbound', 'saleshub', 'LinkedIn profile enriched', $2, NOW())`,
          [contact.contact_id, JSON.stringify({ enrichment: result })]
        );

        enrichResults.push({
          contact_id: contact.contact_id,
          status: response.ok ? 'enriched' : 'trigger_failed',
          data: result,
        });
      } catch (err) {
        enrichResults.push({
          contact_id: contact.contact_id,
          status: 'error',
          data: { error: String(err) },
        });
      }
    }

    return NextResponse.json({ results: enrichResults });
  } catch (error) {
    console.error('[linkedin/enrich] error:', error);
    return NextResponse.json({ error: 'LinkedIn enrichment failed' }, { status: 500 });
  }
}

/**
 * GET /api/linkedin/enrich?contact_id=123
 * Retrieve cached LinkedIn profile data for a contact.
 */
export async function GET(request: NextRequest) {
  try {
    const contactId = request.nextUrl.searchParams.get('contact_id');
    if (!contactId) {
      return NextResponse.json({ error: 'contact_id required' }, { status: 400 });
    }

    const profile = await queryOne(
      `SELECT * FROM crm.linkedin_profiles WHERE contact_id = $1`,
      [parseInt(contactId)]
    );

    return NextResponse.json({ profile: profile || null });
  } catch (error) {
    console.error('[linkedin/enrich GET] error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
