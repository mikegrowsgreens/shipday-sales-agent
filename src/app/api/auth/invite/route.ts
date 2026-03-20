import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { getTenantFromSession } from '@/lib/tenant';
import { requireOrgAdmin } from '@/lib/require-super-admin';
import { inviteSchema } from '@/lib/validators/auth';
import { sendInvitationEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';
import { getOrgPlan, requireResourceLimit } from '@/lib/feature-gate';
import { randomBytes } from 'crypto';
import { apiLimiter, checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateLimited = await checkRateLimit(apiLimiter, ip);
    if (rateLimited) return rateLimited;

    const tenant = await requireOrgAdmin();

    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const { email, role } = parsed.data;

    // Check user limit
    const plan = await getOrgPlan(tenant.org_id);
    await requireResourceLimit(tenant.org_id, plan, 'maxUsers', 'crm.users', 'AND is_active = true');

    // Check if user already exists in this org
    const existingUser = await queryOne<{ user_id: number }>(
      `SELECT user_id FROM crm.users WHERE email = $1 AND org_id = $2`,
      [email, tenant.org_id]
    );
    if (existingUser) {
      return NextResponse.json({ error: 'User already exists in this organization' }, { status: 409 });
    }

    // Check for pending invitation
    const existingInvite = await queryOne<{ id: number }>(
      `SELECT id FROM crm.invitations WHERE email = $1 AND org_id = $2 AND accepted_at IS NULL AND expires_at > NOW()`,
      [email, tenant.org_id]
    );
    if (existingInvite) {
      return NextResponse.json({ error: 'An invitation has already been sent to this email' }, { status: 409 });
    }

    // Create invitation
    const token = randomBytes(32).toString('hex');
    await query(
      `INSERT INTO crm.invitations (org_id, email, role, token, expires_at, invited_by)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days', $5)`,
      [tenant.org_id, email, role, token, tenant.user_id]
    );

    // Send invitation email
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    await sendInvitationEmail(email, token, tenant.org_name, tenant.display_name, baseUrl, tenant.org_id);

    logAuditEvent({
      orgId: tenant.org_id,
      userId: tenant.user_id,
      action: 'user.invite',
      resourceType: 'invitation',
      details: { email, role },
      request,
    });

    return NextResponse.json({ success: true, message: 'Invitation sent' });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    if (error instanceof Error && 'status' in error && (error as unknown as { status: number }).status === 403) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('[auth/invite] error:', error);
    return NextResponse.json({ error: 'Failed to send invitation' }, { status: 500 });
  }
}
