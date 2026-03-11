import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Contact } from '@/lib/types';

// GET /api/contacts/duplicates - Detect duplicate contacts
export async function GET() {
  // Find duplicates by email
  const emailDupes = await query<{ email: string; count: string; contact_ids: number[] }>(
    `SELECT LOWER(email) as email, COUNT(*)::text as count,
            array_agg(contact_id ORDER BY updated_at DESC) as contact_ids
     FROM crm.contacts
     WHERE email IS NOT NULL AND email != ''
     GROUP BY LOWER(email)
     HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC
     LIMIT 50`
  );

  // Find duplicates by phone (normalized)
  const phoneDupes = await query<{ phone: string; count: string; contact_ids: number[] }>(
    `SELECT REGEXP_REPLACE(phone, '\\D', '', 'g') as phone, COUNT(*)::text as count,
            array_agg(contact_id ORDER BY updated_at DESC) as contact_ids
     FROM crm.contacts
     WHERE phone IS NOT NULL AND phone != ''
     GROUP BY REGEXP_REPLACE(phone, '\\D', '', 'g')
     HAVING COUNT(*) > 1 AND LENGTH(REGEXP_REPLACE(phone, '\\D', '', 'g')) >= 10
     ORDER BY COUNT(*) DESC
     LIMIT 50`
  );

  // Find duplicates by business name (fuzzy)
  const bizDupes = await query<{ business_name: string; count: string; contact_ids: number[] }>(
    `SELECT LOWER(TRIM(business_name)) as business_name, COUNT(*)::text as count,
            array_agg(contact_id ORDER BY updated_at DESC) as contact_ids
     FROM crm.contacts
     WHERE business_name IS NOT NULL AND business_name != ''
     GROUP BY LOWER(TRIM(business_name))
     HAVING COUNT(*) > 1
     ORDER BY COUNT(*) DESC
     LIMIT 50`
  );

  // Collect all unique contact IDs
  const allIds = new Set<number>();
  for (const g of [...emailDupes, ...phoneDupes, ...bizDupes]) {
    for (const id of g.contact_ids) allIds.add(id);
  }

  // Fetch full contact data for all duplicates
  let contactMap: Record<number, Contact> = {};
  if (allIds.size > 0) {
    const ids = Array.from(allIds);
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const contacts = await query<Contact>(
      `SELECT * FROM crm.contacts WHERE contact_id IN (${placeholders})`,
      ids
    );
    contactMap = Object.fromEntries(contacts.map(c => [c.contact_id, c]));
  }

  // Build duplicate groups
  const groups = [
    ...emailDupes.map(d => ({
      match_type: 'email' as const,
      match_value: d.email,
      contacts: d.contact_ids.map(id => contactMap[id]).filter(Boolean),
    })),
    ...phoneDupes.map(d => ({
      match_type: 'phone' as const,
      match_value: d.phone,
      contacts: d.contact_ids.map(id => contactMap[id]).filter(Boolean),
    })),
    ...bizDupes.map(d => ({
      match_type: 'business' as const,
      match_value: d.business_name,
      contacts: d.contact_ids.map(id => contactMap[id]).filter(Boolean),
    })),
  ].filter(g => g.contacts.length > 1);

  return NextResponse.json({
    groups,
    total_groups: groups.length,
    total_duplicates: allIds.size,
  });
}
