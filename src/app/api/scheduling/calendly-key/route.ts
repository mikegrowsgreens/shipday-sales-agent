/**
 * GET/PUT /api/scheduling/calendly-key
 * Read and update the Calendly API key stored in org settings.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/route-auth';
import { query, queryOne } from '@/lib/db';

export const GET = withAdminAuth(async (_request, { orgId }) => {
  const org = await queryOne<{ settings: Record<string, unknown> }>(
    `SELECT settings FROM crm.organizations WHERE org_id = $1`,
    [orgId]
  );

  const settings = (org?.settings || {}) as Record<string, unknown>;
  const integrations = (settings.integrations || {}) as Record<string, unknown>;
  const calendlyConfig = (integrations.calendly || {}) as { api_key?: string };

  // Return masked key for display (only show last 8 chars)
  const apiKey = calendlyConfig.api_key || '';
  const masked = apiKey
    ? `${'•'.repeat(Math.max(0, apiKey.length - 8))}${apiKey.slice(-8)}`
    : '';

  return NextResponse.json({ configured: !!apiKey, masked });
});

export const PUT = withAdminAuth(async (request, { orgId }) => {
  const body = await request.json();
  const { api_key } = body as { api_key?: string };

  if (!api_key || typeof api_key !== 'string' || api_key.trim().length < 10) {
    return NextResponse.json(
      { error: 'Invalid API key. Calendly tokens are long alphanumeric strings.' },
      { status: 400 }
    );
  }

  // Build nested path safely — jsonb_set won't create intermediate keys
  await query(
    `UPDATE crm.organizations
     SET settings = jsonb_set(
       jsonb_set(
         jsonb_set(
           COALESCE(settings, '{}'::jsonb),
           '{integrations}',
           COALESCE(settings->'integrations', '{}'::jsonb)
         ),
         '{integrations,calendly}',
         COALESCE(settings->'integrations'->'calendly', '{}'::jsonb)
       ),
       '{integrations,calendly,api_key}',
       $2::jsonb
     )
     WHERE org_id = $1`,
    [orgId, JSON.stringify(api_key.trim())]
  );

  return NextResponse.json({ success: true });
});
