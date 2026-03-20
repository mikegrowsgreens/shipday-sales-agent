/**
 * Route-level auth middleware for multi-tenant API routes.
 * Wraps handler functions with tenant authentication and org_id extraction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession, requireAdminSession, type TenantSession } from './tenant';

type AuthenticatedHandler = (
  request: NextRequest,
  context: { tenant: TenantSession; orgId: number; params?: Record<string, string> }
) => Promise<NextResponse | Response>;

/**
 * Wrap a route handler with tenant auth. Returns 401 if no valid session.
 * The handler receives tenant context with orgId pre-extracted.
 *
 * Usage:
 *   export const GET = withAuth(async (req, { tenant, orgId }) => { ... });
 *   export const POST = withAuth(async (req, { tenant, orgId }) => { ... });
 */
export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest, routeContext?: { params?: Promise<Record<string, string>> }) => {
    try {
      const tenant = await requireTenantSession();
      const params = routeContext?.params ? await routeContext.params : undefined;
      return await handler(request, { tenant, orgId: tenant.org_id, params });
    } catch (error) {
      if (error instanceof Response) return error;
      console.error('[withAuth] unexpected error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/**
 * Wrap a route handler with admin auth. Returns 401 if no session, 403 if not admin.
 */
export function withAdminAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest, routeContext?: { params?: Promise<Record<string, string>> }) => {
    try {
      const tenant = await requireAdminSession();
      const params = routeContext?.params ? await routeContext.params : undefined;
      return await handler(request, { tenant, orgId: tenant.org_id, params });
    } catch (error) {
      if (error instanceof Response) return error;
      console.error('[withAdminAuth] unexpected error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}

/**
 * Wrap a no-request-body handler (like GET) with tenant auth.
 * Accepts handlers that don't need the request parameter.
 */
export function withAuthGet(handler: (context: { tenant: TenantSession; orgId: number }) => Promise<NextResponse | Response>) {
  return async () => {
    try {
      const tenant = await requireTenantSession();
      return await handler({ tenant, orgId: tenant.org_id });
    } catch (error) {
      if (error instanceof Response) return error;
      console.error('[withAuthGet] unexpected error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
