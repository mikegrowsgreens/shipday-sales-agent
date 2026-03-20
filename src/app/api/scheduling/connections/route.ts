/**
 * GET /api/scheduling/connections
 * List all calendar connections for the authenticated user's org.
 * Returns connections with sensitive token fields stripped.
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/route-auth';
import { query } from '@/lib/db';

interface ConnectionRow {
  connection_id: number;
  org_id: number;
  user_id: number;
  provider: string;
  account_email: string;
  token_expires_at: string | null;
  scopes: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const GET = withAuth(async (_request, { orgId }) => {
  const connections = await query<ConnectionRow>(
    `SELECT connection_id, org_id, user_id, provider, account_email,
            token_expires_at, scopes, is_active, created_at, updated_at
     FROM crm.calendar_connections
     WHERE org_id = $1 AND is_active = true
     ORDER BY created_at DESC`,
    [orgId]
  );

  return NextResponse.json({ connections });
});
