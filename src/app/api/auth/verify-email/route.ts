import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { sendVerificationEmail } from '@/lib/email';
import { getTenantFromSession } from '@/lib/tenant';
import { randomBytes } from 'crypto';
import { authLimiter, checkRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/auth/verify-email?token=xxx — verify email token
 */
export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateLimited = await checkRateLimit(authLimiter, ip);
    if (rateLimited) return rateLimited;

    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
    }

    const verification = await queryOne<{
      id: number; user_id: number; expires_at: string; verified_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, verified_at FROM crm.email_verifications WHERE token = $1`,
      [token]
    );

    if (!verification) {
      return NextResponse.redirect(new URL('/login?error=invalid_token', request.url));
    }
    if (verification.verified_at) {
      return NextResponse.redirect(new URL('/login?message=already_verified', request.url));
    }
    if (new Date(verification.expires_at) < new Date()) {
      return NextResponse.redirect(new URL('/login?error=token_expired', request.url));
    }

    // Mark verified
    await query(`UPDATE crm.email_verifications SET verified_at = NOW() WHERE id = $1`, [verification.id]);
    await query(`UPDATE crm.users SET email_verified = true WHERE user_id = $1`, [verification.user_id]);

    return NextResponse.redirect(new URL('/?message=email_verified', request.url));
  } catch (error) {
    console.error('[verify-email] GET error:', error);
    return NextResponse.redirect(new URL('/login?error=verification_failed', request.url));
  }
}

/**
 * POST /api/auth/verify-email — resend verification email
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateLimited = await checkRateLimit(authLimiter, ip);
    if (rateLimited) return rateLimited;

    const tenant = await getTenantFromSession();
    if (!tenant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await queryOne<{ email_verified: boolean; email: string }>(
      `SELECT email_verified, email FROM crm.users WHERE user_id = $1`,
      [tenant.user_id]
    );

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (user.email_verified) {
      return NextResponse.json({ message: 'Email already verified' });
    }

    // Create new verification token
    const token = randomBytes(32).toString('hex');
    await query(
      `INSERT INTO crm.email_verifications (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [tenant.user_id, token]
    );

    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    await sendVerificationEmail(user.email, token, baseUrl, tenant.org_id);

    return NextResponse.json({ success: true, message: 'Verification email sent' });
  } catch (error) {
    console.error('[verify-email] POST error:', error);
    return NextResponse.json({ error: 'Failed to send verification email' }, { status: 500 });
  }
}
