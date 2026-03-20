/**
 * Audit logging utility.
 * Logs user actions for compliance and security tracking.
 */

import { query } from './db';

interface AuditEvent {
  orgId: number;
  userId?: number;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  request?: Request;
}

function getIpFromRequest(request?: Request): string | null {
  if (!request) return null;
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null
  );
}

function getUserAgent(request?: Request): string | null {
  if (!request) return null;
  return request.headers.get('user-agent') || null;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await query(
      `INSERT INTO crm.audit_log (org_id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        event.orgId,
        event.userId || null,
        event.action,
        event.resourceType || null,
        event.resourceId || null,
        event.details ? JSON.stringify(event.details) : null,
        getIpFromRequest(event.request),
        getUserAgent(event.request),
      ]
    );
  } catch (err) {
    // Audit logging should never block the main operation
    console.error('[audit] Failed to log event:', err);
  }
}
