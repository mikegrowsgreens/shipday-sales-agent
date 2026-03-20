/**
 * DELETE /api/scheduling/connections/[id]
 * Disconnect a calendar connection (soft-delete by setting is_active = false).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/route-auth';
import { queryOne } from '@/lib/db';

export const DELETE = withAuth(async (_request: NextRequest, { tenant, orgId, params }) => {
  const connectionId = params?.id;

  if (!connectionId || isNaN(Number(connectionId))) {
    return NextResponse.json({ error: 'Invalid connection ID' }, { status: 400 });
  }

  // Soft-delete: set is_active = false, ensure it belongs to this org + user
  const deleted = await queryOne(
    `UPDATE crm.calendar_connections
     SET is_active = false, updated_at = NOW()
     WHERE connection_id = $1 AND org_id = $2 AND user_id = $3
     RETURNING connection_id, provider, account_email`,
    [Number(connectionId), orgId, tenant.user_id]
  );

  if (!deleted) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, disconnected: deleted });
});
