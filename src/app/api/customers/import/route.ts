import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { Customer } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';
import { parse } from 'csv-parse/sync';

// ── Plan normalization maps ──

const AUDIT_PLAN_MAP: Record<string, string> = {
  'branded elite lite': 'branded_elite_lite',
  'branded premium plus': 'branded_premium_plus',
  'business advanced lite': 'business_advanced_lite',
  'business advanced': 'business_advanced',
  'branded elite custom': 'branded_elite_custom',
  'pro': 'pro',
  'elite': 'elite',
  'branded premium': 'branded_premium',
};

const REGIONAL_PLAN_MAP: Record<string, string> = {
  'BRANDED_ELITE': 'branded_elite_lite',
  'BRANDED_ELITE_CUSTOM': 'branded_elite_custom',
  'BUSINESS_ADVANCED': 'business_advanced',
  'BUSINESS_ADVANCED_LITE': 'business_advanced_lite',
  'BRANDED_PREMIUM_PLUS': 'branded_premium_plus',
  'BRANDED_PREMIUM': 'branded_premium',
  'PRO': 'pro',
  'ELITE': 'elite',
};

function normalizeAuditPlan(plan: string): { key: string; display: string } | null {
  if (!plan) return null;
  const trimmed = plan.trim();
  const key = AUDIT_PLAN_MAP[trimmed.toLowerCase()];
  return key ? { key, display: trimmed } : { key: trimmed.toLowerCase().replace(/\s+/g, '_'), display: trimmed };
}

function normalizeRegionalPlan(plan: string): { key: string; display: string } | null {
  if (!plan) return null;
  const trimmed = plan.trim();
  const key = REGIONAL_PLAN_MAP[trimmed] || trimmed.toLowerCase().replace(/\s+/g, '_');
  const display = trimmed.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return { key, display };
}

// ── Notes field parser (Audit format) ──

function parseAuditNotes(notes: string): {
  num_drivers: number | null;
  discount_pct: number | null;
  shipday_account_id: string | null;
  clean_notes: string;
} {
  if (!notes) return { num_drivers: null, discount_pct: null, shipday_account_id: null, clean_notes: '' };

  const drivers = notes.match(/Drivers:\s*(\d+)/i)?.[1];
  const discount = notes.match(/Discount:\s*(\d+(?:\.\d+)?)%/i)?.[1];
  const accountId = notes.match(/ID:\s*(\d+)/i)?.[1];

  // Remove parsed fields from notes to keep only free-text
  let clean = notes
    .replace(/Drivers:\s*\d+;?\s*/gi, '')
    .replace(/Discount:\s*\d+(?:\.\d+)?%;?\s*/gi, '')
    .replace(/ID:\s*\d+;?\s*/gi, '')
    .trim();
  if (clean === ';' || clean === '') clean = '';

  return {
    num_drivers: drivers ? parseInt(drivers) : null,
    discount_pct: discount ? parseFloat(discount) : null,
    shipday_account_id: accountId || null,
    clean_notes: clean,
  };
}

// ── Format auto-detection ──

type ImportFormat = 'audit' | 'regional' | 'auto';

function detectFormat(headers: string[]): ImportFormat | null {
  const lower = headers.map(h => h.toLowerCase().trim());
  if (lower.includes('name') && lower.includes('contact') && lower.includes('plan')) return 'audit';
  if (lower.includes('company_id') || lower.includes('avg_completed_orders')) return 'regional';
  return null;
}

// ── Normalize a status value ──

function normalizeStatus(raw: string): string {
  if (!raw) return 'active';
  const lower = raw.trim().toLowerCase();
  if (['active', 'inactive', 'churned', 'suspended'].includes(lower)) return lower;
  return 'active';
}

// ── Safe number parser ──

function safeNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).replace(/[$,%\s]/g, '');
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function safeInt(val: unknown): number | null {
  const n = safeNum(val);
  return n !== null ? Math.round(n) : null;
}

// POST /api/customers/import - Import customers from CSV
export const POST = withAuth(async (request, { orgId }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const formatHint = (formData.get('format') as string) || 'auto';

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
      return NextResponse.json({ error: 'Failed to parse CSV. Ensure it is a valid CSV file.' }, { status: 400 });
    }

    if (records.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 });
    }

    const headers = Object.keys(records[0]);
    let format: ImportFormat;
    if (formatHint === 'auto') {
      const detected = detectFormat(headers);
      if (!detected) {
        return NextResponse.json({
          error: 'Could not auto-detect format. Please specify format as "audit" or "regional".',
          headers,
        }, { status: 400 });
      }
      format = detected;
    } else {
      format = formatHint as ImportFormat;
    }

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        if (format === 'audit') {
          await importAuditRow(row, orgId, (isNew) => {
            if (isNew) imported++; else updated++;
          });
        } else {
          await importRegionalRow(row, orgId, (isNew) => {
            if (isNew) imported++; else updated++;
          });
        }
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`);
        skipped++;
      }
    }

    return NextResponse.json({
      success: true,
      format,
      imported,
      updated,
      skipped,
      total: records.length,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('[customers/import] POST error:', error);
    return NextResponse.json({ error: 'Failed to import customers' }, { status: 500 });
  }
});

// ── Audit format row import ──

async function importAuditRow(
  row: Record<string, string>,
  orgId: number,
  track: (isNew: boolean) => void
) {
  const email = (row['Email'] || '').trim().toLowerCase();
  if (!email) throw new Error('Missing email');

  const plan = normalizeAuditPlan(row['Current Plan'] || row['Plan'] || '');
  const notesRaw = row['Notes'] || '';
  const parsed = parseAuditNotes(notesRaw);

  const result = await queryOne<Customer & { xmax: string }>(
    `INSERT INTO crm.customers (
      org_id, business_name, contact_name, email, phone,
      account_plan, plan_display_name, account_status,
      signup_date, last_active, num_locations,
      num_drivers, discount_pct, shipday_account_id,
      notes, imported_from
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'audit')
    ON CONFLICT (org_id, email) DO UPDATE SET
      business_name = COALESCE(NULLIF(EXCLUDED.business_name, ''), crm.customers.business_name),
      contact_name = COALESCE(NULLIF(EXCLUDED.contact_name, ''), crm.customers.contact_name),
      phone = COALESCE(NULLIF(EXCLUDED.phone, ''), crm.customers.phone),
      account_plan = COALESCE(NULLIF(EXCLUDED.account_plan, ''), crm.customers.account_plan),
      plan_display_name = COALESCE(NULLIF(EXCLUDED.plan_display_name, ''), crm.customers.plan_display_name),
      account_status = COALESCE(NULLIF(EXCLUDED.account_status, ''), crm.customers.account_status),
      signup_date = COALESCE(EXCLUDED.signup_date, crm.customers.signup_date),
      last_active = COALESCE(EXCLUDED.last_active, crm.customers.last_active),
      num_locations = COALESCE(EXCLUDED.num_locations, crm.customers.num_locations),
      num_drivers = COALESCE(EXCLUDED.num_drivers, crm.customers.num_drivers),
      discount_pct = COALESCE(EXCLUDED.discount_pct, crm.customers.discount_pct),
      shipday_account_id = COALESCE(NULLIF(EXCLUDED.shipday_account_id, ''), crm.customers.shipday_account_id),
      notes = COALESCE(NULLIF(EXCLUDED.notes, ''), crm.customers.notes),
      updated_at = NOW()
    RETURNING *, xmax::text`,
    [
      orgId,
      (row['Name'] || '').trim(),
      (row['Contact'] || '').trim() || null,
      email,
      (row['Phone'] || '').trim() || null,
      plan?.key || null,
      plan?.display || null,
      normalizeStatus(row['Account Status'] || ''),
      row['Signup Date'] ? new Date(row['Signup Date']).toISOString().split('T')[0] : null,
      row['Last Active'] ? new Date(row['Last Active']).toISOString().split('T')[0] : null,
      safeInt(row['Locations']),
      parsed.num_drivers,
      parsed.discount_pct,
      parsed.shipday_account_id,
      parsed.clean_notes || notesRaw.trim() || null,
    ]
  );

  track(result?.xmax === '0');
}

// ── Regional format row import ──

async function importRegionalRow(
  row: Record<string, string>,
  orgId: number,
  track: (isNew: boolean) => void
) {
  const email = (row['email'] || '').trim().toLowerCase();
  if (!email) throw new Error('Missing email');

  const plan = normalizeRegionalPlan(row['account_plan'] || '');

  const result = await queryOne<Customer & { xmax: string }>(
    `INSERT INTO crm.customers (
      org_id, business_name, contact_name, email,
      address, state, shipday_company_id,
      account_plan, plan_display_name,
      avg_completed_orders, avg_order_value, avg_cost_per_order,
      imported_from
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'regional')
    ON CONFLICT (org_id, email) DO UPDATE SET
      business_name = COALESCE(NULLIF(crm.customers.business_name, ''), NULLIF(EXCLUDED.business_name, '')),
      contact_name = COALESCE(NULLIF(crm.customers.contact_name, ''), NULLIF(EXCLUDED.contact_name, '')),
      address = COALESCE(NULLIF(EXCLUDED.address, ''), crm.customers.address),
      state = COALESCE(NULLIF(EXCLUDED.state, ''), crm.customers.state),
      shipday_company_id = COALESCE(EXCLUDED.shipday_company_id, crm.customers.shipday_company_id),
      account_plan = COALESCE(NULLIF(crm.customers.account_plan, ''), NULLIF(EXCLUDED.account_plan, '')),
      plan_display_name = COALESCE(NULLIF(crm.customers.plan_display_name, ''), NULLIF(EXCLUDED.plan_display_name, '')),
      avg_completed_orders = COALESCE(EXCLUDED.avg_completed_orders, crm.customers.avg_completed_orders),
      avg_order_value = COALESCE(EXCLUDED.avg_order_value, crm.customers.avg_order_value),
      avg_cost_per_order = COALESCE(EXCLUDED.avg_cost_per_order, crm.customers.avg_cost_per_order),
      updated_at = NOW()
    RETURNING *, xmax::text`,
    [
      orgId,
      (row['Business'] || '').trim(),
      (row['Customer Name'] || '').trim() || null,
      email,
      (row['address'] || '').trim() || null,
      (row['state'] || '').trim() || null,
      safeInt(row['company_id']),
      plan?.key || null,
      plan?.display || null,
      safeNum(row['avg_completed_orders']),
      safeNum(row['Average Order']),
      safeNum(row['Average Cost']),
    ]
  );

  // For regional: keep existing (audit) plan if present, only set financial/location data
  track(result?.xmax === '0');
}
