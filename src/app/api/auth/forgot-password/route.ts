import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { forgotPasswordSchema } from '@/lib/validators/auth';
import { sendPasswordResetEmail } from '@/lib/email';
import { randomBytes } from 'crypto';
import { authLimiter, checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateLimited = await checkRateLimit(authLimiter, ip);
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      // Always return 200 to prevent email enumeration
      return NextResponse.json({ success: true, message: 'If an account exists, a reset email has been sent' });
    }

    const { email } = parsed.data;

    const user = await queryOne<{ user_id: number; org_id: number }>(
      `SELECT user_id, org_id FROM crm.users WHERE email = $1 AND is_active = true`,
      [email]
    );

    if (user) {
      const token = randomBytes(32).toString('hex');
      await query(
        `INSERT INTO crm.password_resets (user_id, token, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '1 hour')`,
        [user.user_id, token]
      );

      const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
      sendPasswordResetEmail(email, token, baseUrl, user.org_id).catch(err =>
        console.error('[forgot-password] Failed to send reset email:', err)
      );
    }

    // Always return 200 to prevent email enumeration
    return NextResponse.json({ success: true, message: 'If an account exists, a reset email has been sent' });
  } catch (error) {
    console.error('[forgot-password] error:', error);
    return NextResponse.json({ success: true, message: 'If an account exists, a reset email has been sent' });
  }
}
