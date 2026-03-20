import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { Customer, CustomerPlanChange } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';
import { parse } from 'csv-parse/sync';

// ── Plan abbreviation map for upgrade tabs ──

const UPGRADE_PLAN_MAP: Record<string, string> = {
  'bal': 'business_advanced_lite',
  'ba': 'business_advanced',
  'bp': 'branded_premium',
  'bpp': 'branded_premium_plus',
  'bel': 'branded_elite_lite',
  'bec': 'branded_elite_custom',
  'pro': 'pro',
  'elite': 'elite',
  'business advanced lite': 'business_advanced_lite',
  'business advanced': 'business_advanced',
  'branded premium': 'branded_premium',
  'branded premium plus': 'branded_premium_plus',
  'branded elite lite': 'branded_elite_lite',
  'branded elite custom': 'branded_elite_custom',
};

function normalizeUpgradePlan(plan: string): string {
  if (!plan) return plan;
  const trimmed = plan.trim();
  return UPGRADE_PLAN_MAP[trimmed.toLowerCase()] || trimmed.toLowerCase().replace(/\s+/g, '_');
}

function safeNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).replace(/[$,%\s]/g, '');
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

// POST /api/customers/import/upgrades - Import upgrade history from CSV
export const POST = withAuth(async (request, { orgId }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();
    let records: Record<string, string>[];
    try {
      records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
    } catch {
      return NextResponse.json({ error: 'Failed to parse CSV' }, { status: 400 });
    }

    if (records.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 });
    }

    let matched = 0;
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        const email = (row['Email'] || '').trim().toLowerCase();
        const name = (row['Name'] || '').trim();
        const newPlan = normalizeUpgradePlan(row['Plan'] || '');
        const closeDate = row['Close Date'] ? new Date(row['Close Date']).toISOString().split('T')[0] : null;
        const commission = safeNum(row['Commission']);

        if (!newPlan) {
          skipped++;
          continue;
        }

        // Try to find matching customer by email first, then by business name
        let customer: Customer | null = null;
        if (email) {
          customer = await queryOne<Customer>(
            `SELECT * FROM crm.customers WHERE org_id = $1 AND LOWER(email) = $2`,
            [orgId, email]
          );
        }
        if (!customer && name) {
          customer = await queryOne<Customer>(
            `SELECT * FROM crm.customers WHERE org_id = $1 AND LOWER(business_name) = $2`,
            [orgId, name.toLowerCase()]
          );
        }

        if (!customer) {
          errors.push(`Row ${i + 2}: No matching customer for "${name}" / "${email}"`);
          skipped++;
          continue;
        }

        // Check if this exact plan change already exists (idempotent)
        const existing = await queryOne<CustomerPlanChange>(
          `SELECT id FROM crm.customer_plan_changes
           WHERE org_id = $1 AND customer_id = $2 AND new_plan = $3 AND change_date = $4`,
          [orgId, customer.id, newPlan, closeDate]
        );

        if (existing) {
          skipped++;
          continue;
        }

        // Insert plan change
        await queryOne(
          `INSERT INTO crm.customer_plan_changes (
            org_id, customer_id, previous_plan, new_plan, change_type, change_date, commission
          ) VALUES ($1, $2, $3, $4, 'upgrade', $5, $6)`,
          [orgId, customer.id, customer.account_plan, newPlan, closeDate, commission]
        );
        created++;

        // Update customer's current plan if this upgrade is the most recent
        const latestChange = await queryOne<{ new_plan: string }>(
          `SELECT new_plan FROM crm.customer_plan_changes
           WHERE org_id = $1 AND customer_id = $2
           ORDER BY change_date DESC NULLS LAST, created_at DESC
           LIMIT 1`,
          [orgId, customer.id]
        );

        if (latestChange?.new_plan === newPlan) {
          await queryOne(
            `UPDATE crm.customers SET account_plan = $1, updated_at = NOW()
             WHERE id = $2 AND org_id = $3`,
            [newPlan, customer.id, orgId]
          );
        }

        matched++;
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      matched,
      changes_created: created,
      skipped,
      total: records.length,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('[customers/import/upgrades] POST error:', error);
    return NextResponse.json({ error: 'Failed to import upgrades' }, { status: 500 });
  }
});
