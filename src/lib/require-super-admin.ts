/**
 * Super-admin access control.
 */

import { queryOne } from './db';
import { getTenantFromSession, type TenantSession } from './tenant';

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Require super-admin access. Returns tenant session if authorized.
 * Throws 403 if user is not a super-admin.
 */
export async function requireSuperAdmin(): Promise<TenantSession> {
  const tenant = await getTenantFromSession();
  if (!tenant) {
    throw new ForbiddenError('Authentication required');
  }

  const user = await queryOne<{ is_super_admin: boolean }>(
    `SELECT is_super_admin FROM crm.users WHERE user_id = $1`,
    [tenant.user_id]
  );

  if (!user?.is_super_admin) {
    throw new ForbiddenError('Super-admin access required');
  }

  return tenant;
}

/**
 * Require org-level admin (admin role within the org).
 */
export async function requireOrgAdmin(): Promise<TenantSession> {
  const tenant = await getTenantFromSession();
  if (!tenant) {
    throw new ForbiddenError('Authentication required');
  }
  if (tenant.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  return tenant;
}
