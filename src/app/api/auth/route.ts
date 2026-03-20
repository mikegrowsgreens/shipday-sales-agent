import { NextRequest, NextResponse } from 'next/server';
import { createSession, validatePassword, createUserSession } from '@/lib/auth';
import { validateUserCredentials, type TenantSession } from '@/lib/tenant';
import { logAuditEvent } from '@/lib/audit';
import { authLimiter, checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateLimited = await checkRateLimit(authLimiter, ip);
    if (rateLimited) return rateLimited;

    const body = await request.json();

    // Multi-tenant login (email + password)
    if (body.email && body.password) {
      const tenant: TenantSession | null = await validateUserCredentials(body.email, body.password);
      if (!tenant) {
        return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
      }

      const token = await createUserSession({
        user_id: tenant.user_id,
        org_id: tenant.org_id,
        email: tenant.email,
        role: tenant.role,
        display_name: tenant.display_name,
        org_name: tenant.org_name,
        org_slug: tenant.org_slug,
        org_logo: tenant.org_logo,
      });

      const response = NextResponse.json({ success: true });
      response.cookies.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });

      logAuditEvent({
        orgId: tenant.org_id,
        userId: tenant.user_id,
        action: 'auth.login',
        details: { method: 'email', email: tenant.email },
        request,
      });

      return response;
    }

    // Legacy single-tenant login (password only) — deprecated
    if (body.password) {
      if (!(await validatePassword(body.password))) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }

      const token = await createSession();

      const response = NextResponse.json({ success: true });
      response.cookies.set('session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      });

      return response;
    }

    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
  } catch (error) {
    console.error('[auth] POST error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
