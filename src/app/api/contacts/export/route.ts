import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Contact } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';

// GET /api/contacts/export - Export contacts as CSV
export const GET = withAuth(async (request: NextRequest, { orgId }) => {
  const { searchParams } = request.nextUrl;
  const stage = searchParams.get('stage');
  const tags = searchParams.get('tags');
  const ids = searchParams.get('ids');

  const conditions: string[] = ['org_id = $1'];
  const params: unknown[] = [orgId];
  let idx = 2;

  if (ids) {
    const idList = ids.split(',').map(Number).filter(n => !isNaN(n));
    if (idList.length > 0) {
      const placeholders = idList.map((_, i) => `$${idx + i}`).join(',');
      conditions.push(`contact_id IN (${placeholders})`);
      params.push(...idList);
      idx += idList.length;
    }
  }

  if (stage && stage !== 'all') {
    conditions.push(`lifecycle_stage = $${idx++}`);
    params.push(stage);
  }

  if (tags) {
    const tagList = tags.split(',');
    conditions.push(`tags && $${idx++}`);
    params.push(tagList);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const contacts = await query<Contact>(
    `SELECT * FROM crm.contacts ${where} ORDER BY business_name ASC, last_name ASC`,
    params
  );

  // Build CSV
  const headers = [
    'contact_id', 'email', 'phone', 'first_name', 'last_name', 'business_name',
    'title', 'linkedin_url', 'website', 'lifecycle_stage', 'lead_score',
    'engagement_score', 'tags', 'created_at', 'updated_at',
  ];

  const escapeCSV = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = Array.isArray(val) ? val.join('; ') : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = contacts.map(c =>
    headers.map(h => escapeCSV((c as unknown as Record<string, unknown>)[h])).join(',')
  );

  const csv = [headers.join(','), ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="contacts-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
