import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { query, queryOne } from './db';
import { verifyPasswordHash } from './auth';
import { AUTH_SECRET_BYTES } from './config';

export interface TenantSession {
  user_id: number;
  org_id: number;
  email: string;
  role: string;
  display_name: string;
  org_name: string;
  org_slug: string;
  org_logo: string | null;
}

/**
 * Extract tenant context from JWT session.
 * Returns null if legacy auth (no user_id in token) or invalid.
 */
export async function getTenantFromSession(): Promise<TenantSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, AUTH_SECRET_BYTES);

    // Legacy single-tenant token — no user info
    if (!payload.user_id) return null;

    return {
      user_id: payload.user_id as number,
      org_id: payload.org_id as number,
      email: payload.email as string,
      role: payload.role as string,
      display_name: payload.display_name as string,
      org_name: payload.org_name as string,
      org_slug: payload.org_slug as string,
      org_logo: (payload.org_logo as string) || null,
    };
  } catch {
    return null;
  }
}

/**
 * Require a valid tenant session or throw a 401 response.
 * Use this at the top of every authenticated API route handler.
 */
export async function requireTenantSession(): Promise<TenantSession> {
  const tenant = await getTenantFromSession();
  if (!tenant) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return tenant;
}

/**
 * Require admin role or throw 403.
 */
export async function requireAdminSession(): Promise<TenantSession> {
  const tenant = await requireTenantSession();
  if (tenant.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return tenant;
}

/**
 * Wrap a SQL query to scope by org_id. Requires a valid orgId — never degrades to unscoped.
 * Expects placeholder $TENANT in query which gets replaced with the correct parameter number.
 */
export async function withTenant<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
  orgId?: number
): Promise<T[]> {
  if (!orgId) {
    throw new Response(JSON.stringify({ error: 'Unauthorized: missing org context' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const scopedSql = sql.replace('$TENANT', `$${params.length + 1}`);
  return query<T>(scopedSql, [...params, orgId]);
}

/**
 * Get org settings for branding/configuration.
 */
export async function getOrgSettings(orgId: number): Promise<Record<string, unknown> | null> {
  const org = await queryOne<{
    org_id: number;
    name: string;
    slug: string;
    logo_url: string | null;
    settings: Record<string, unknown>;
  }>(
    `SELECT org_id, name, slug, logo_url, settings FROM crm.organizations WHERE org_id = $1`,
    [orgId]
  );
  return org;
}

/**
 * Validate user credentials (multi-tenant login).
 * Returns user + org data on success, null on failure.
 */
export async function validateUserCredentials(
  email: string,
  password: string
): Promise<TenantSession | null> {
  const user = await queryOne<{
    user_id: number;
    org_id: number;
    email: string;
    password_hash: string;
    display_name: string;
    role: string;
    org_name: string;
    org_slug: string;
    org_logo: string | null;
  }>(
    `SELECT u.user_id, u.org_id, u.email, u.password_hash,
            u.display_name, u.role,
            o.name as org_name, o.slug as org_slug, o.logo_url as org_logo
     FROM crm.users u
     JOIN crm.organizations o ON o.org_id = u.org_id
     WHERE u.email = $1 AND u.is_active = true AND o.is_active = true`,
    [email]
  );

  if (!user) return null;

  // bcrypt password verification
  const isValid = await verifyPasswordHash(password, user.password_hash);
  if (!isValid) return null;

  // Update last login
  await query(`UPDATE crm.users SET last_login_at = NOW() WHERE user_id = $1`, [user.user_id]);

  return {
    user_id: user.user_id,
    org_id: user.org_id,
    email: user.email,
    role: user.role,
    display_name: user.display_name || email.split('@')[0],
    org_name: user.org_name,
    org_slug: user.org_slug,
    org_logo: user.org_logo,
  };
}
