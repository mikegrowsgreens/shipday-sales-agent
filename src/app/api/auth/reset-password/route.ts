import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { resetPasswordSchema } from '@/lib/validators/auth';
import { hashPassword } from '@/lib/auth';
import { logAuditEvent } from '@/lib/audit';
import { authLimiter, checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateLimited = await checkRateLimit(authLimiter, ip);
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const { token, password } = parsed.data;

    const reset = await queryOne<{
      id: number; user_id: number; expires_at: string; used_at: string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at FROM crm.password_resets WHERE token = $1`,
      [token]
    );

    if (!reset) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }
    if (reset.used_at) {
      return NextResponse.json({ error: 'This reset link has already been used' }, { status: 400 });
    }
    if (new Date(reset.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This reset link has expired' }, { status: 400 });
    }

    // Update password
    const passwordHash = await hashPassword(password);
    await query(`UPDATE crm.users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2`, [passwordHash, reset.user_id]);

    // Mark reset token as used
    await query(`UPDATE crm.password_resets SET used_at = NOW() WHERE id = $1`, [reset.id]);

    // Get user's org for audit
    const user = await queryOne<{ org_id: number }>(
      `SELECT org_id FROM crm.users WHERE user_id = $1`,
      [reset.user_id]
    );

    if (user) {
      logAuditEvent({
        orgId: user.org_id,
        userId: reset.user_id,
        action: 'password.reset',
        request,
      });
    }

    return NextResponse.json({ success: true, message: 'Password has been reset. You can now log in.' });
  } catch (error) {
    console.error('[reset-password] error:', error);
    return NextResponse.json({ error: 'Password reset failed' }, { status: 500 });
  }
}
