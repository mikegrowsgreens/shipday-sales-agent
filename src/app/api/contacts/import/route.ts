import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgPlan, requireResourceLimit } from '@/lib/feature-gate';
import { trackUsage } from '@/lib/usage';
import { importLimiter, checkRateLimit } from '@/lib/rate-limit';
import { contactImportSchema } from '@/lib/validators/settings';

// POST /api/contacts/import - Import contacts from CSV data
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimitResponse = await checkRateLimit(importLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const plan = await getOrgPlan(orgId);
    await requireResourceLimit(orgId, plan, 'maxContacts', 'crm.contacts');

    const body = await request.json();
    const parsed = contactImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { rows, field_mapping, default_stage, default_tags } = parsed.data;

    const validFields = [
      'email', 'phone', 'first_name', 'last_name', 'business_name',
      'title', 'linkedin_url', 'website', 'lifecycle_stage', 'tags',
    ];

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const mapped: Record<string, unknown> = {};
        for (const [csvCol, dbField] of Object.entries(field_mapping)) {
          if (validFields.includes(dbField as string) && row[csvCol] !== undefined) {
            mapped[dbField as string] = row[csvCol];
          }
        }

        // Must have at least email or phone
        if (!mapped.email && !mapped.phone) {
          skipped++;
          continue;
        }

        // Apply defaults
        if (!mapped.lifecycle_stage) mapped.lifecycle_stage = default_stage || 'raw';
        if (default_tags?.length) {
          mapped.tags = [...(Array.isArray(mapped.tags) ? mapped.tags : []), ...default_tags];
        } else if (!mapped.tags) {
          mapped.tags = [];
        }

        const result = await queryOne<{ contact_id: number; xmax: string }>(
          `INSERT INTO crm.contacts (
            email, phone, first_name, last_name, business_name,
            title, linkedin_url, website, lifecycle_stage, tags, org_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (email, org_id) DO UPDATE SET
            phone = COALESCE(EXCLUDED.phone, crm.contacts.phone),
            first_name = COALESCE(EXCLUDED.first_name, crm.contacts.first_name),
            last_name = COALESCE(EXCLUDED.last_name, crm.contacts.last_name),
            business_name = COALESCE(EXCLUDED.business_name, crm.contacts.business_name),
            title = COALESCE(EXCLUDED.title, crm.contacts.title),
            linkedin_url = COALESCE(EXCLUDED.linkedin_url, crm.contacts.linkedin_url),
            website = COALESCE(EXCLUDED.website, crm.contacts.website),
            updated_at = NOW()
          RETURNING contact_id, xmax::text`,
          [
            mapped.email || null, mapped.phone || null,
            mapped.first_name || null, mapped.last_name || null,
            mapped.business_name || null, mapped.title || null,
            mapped.linkedin_url || null, mapped.website || null,
            mapped.lifecycle_stage, mapped.tags || [], orgId,
          ]
        );

        // xmax = '0' means INSERT, otherwise UPDATE
        if (result?.xmax === '0') {
          imported++;
        } else {
          updated++;
        }
      } catch (err) {
        errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        skipped++;
      }
    }

    if (imported > 0) {
      trackUsage(orgId, 'contacts_created', imported);
    }

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      total: rows.length,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[contacts/import] POST error:', error);
    return NextResponse.json({ error: 'Failed to import contacts' }, { status: 500 });
  }
}
