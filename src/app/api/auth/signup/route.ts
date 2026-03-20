import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { hashPassword, createUserSession } from '@/lib/auth';
import { signupSchema } from '@/lib/validators/auth';
import { sendVerificationEmail } from '@/lib/email';
import { logAuditEvent } from '@/lib/audit';
import { randomBytes } from 'crypto';
import { DEFAULT_CONFIG } from '@/lib/org-config';
import { authLimiter, checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '127.0.0.1';
    const rateLimited = await checkRateLimit(authLimiter, ip);
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      return NextResponse.json({ error: 'Validation failed', errors }, { status: 400 });
    }

    const { company_name, full_name, email, password, invite_token } = parsed.data;

    // Check if email already exists
    const existingUser = await queryOne<{ user_id: number }>(
      `SELECT user_id FROM crm.users WHERE email = $1`,
      [email]
    );
    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    let orgId: number;
    let orgName: string;
    let orgSlug: string;
    let role = 'admin';

    // Handle invitation flow
    if (invite_token) {
      const invitation = await queryOne<{
        id: number; org_id: number; email: string; role: string; expires_at: string; accepted_at: string | null;
      }>(
        `SELECT id, org_id, email, role, expires_at, accepted_at FROM crm.invitations WHERE token = $1`,
        [invite_token]
      );

      if (!invitation) {
        return NextResponse.json({ error: 'Invalid invitation' }, { status: 400 });
      }
      if (invitation.accepted_at) {
        return NextResponse.json({ error: 'Invitation already used' }, { status: 400 });
      }
      if (new Date(invitation.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Invitation expired' }, { status: 400 });
      }
      if (invitation.email !== email) {
        return NextResponse.json({ error: 'Email does not match invitation' }, { status: 400 });
      }

      // Use existing org
      const org = await queryOne<{ org_id: number; name: string; slug: string }>(
        `SELECT org_id, name, slug FROM crm.organizations WHERE org_id = $1`,
        [invitation.org_id]
      );
      if (!org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 400 });
      }

      orgId = org.org_id;
      orgName = org.name;
      orgSlug = org.slug;
      role = invitation.role;

      // Mark invitation accepted
      await query(`UPDATE crm.invitations SET accepted_at = NOW() WHERE id = $1`, [invitation.id]);
    } else {
      // Check company name uniqueness
      const existingOrg = await queryOne<{ org_id: number }>(
        `SELECT org_id FROM crm.organizations WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL`,
        [company_name]
      );
      if (existingOrg) {
        return NextResponse.json({ error: 'A company with this name already exists' }, { status: 409 });
      }

      // Create slug from company name
      orgSlug = company_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);

      // Ensure slug uniqueness
      const slugExists = await queryOne<{ org_id: number }>(
        `SELECT org_id FROM crm.organizations WHERE slug = $1`,
        [orgSlug]
      );
      if (slugExists) {
        orgSlug = `${orgSlug}-${Date.now().toString(36)}`;
      }

      // Create organization with free plan and default config
      const defaultConfig = {
        ...DEFAULT_CONFIG,
        company_name,
      };

      const newOrg = await queryOne<{ org_id: number }>(
        `INSERT INTO crm.organizations (name, slug, plan, config, settings)
         VALUES ($1, $2, 'free', $3, '{}')
         RETURNING org_id`,
        [company_name, orgSlug, JSON.stringify(defaultConfig)]
      );
      if (!newOrg) {
        return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 });
      }

      orgId = newOrg.org_id;
      orgName = company_name;
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const newUser = await queryOne<{ user_id: number }>(
      `INSERT INTO crm.users (org_id, email, password_hash, display_name, role, email_verified)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING user_id`,
      [orgId, email, passwordHash, full_name, role]
    );
    if (!newUser) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Create email verification token
    const verifyToken = randomBytes(32).toString('hex');
    await query(
      `INSERT INTO crm.email_verifications (user_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '24 hours')`,
      [newUser.user_id, verifyToken]
    );

    // Send verification email (non-blocking)
    const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    sendVerificationEmail(email, verifyToken, baseUrl, orgId).catch(err =>
      console.error('[signup] Failed to send verification email:', err)
    );

    // Create session
    const token = await createUserSession({
      user_id: newUser.user_id,
      org_id: orgId,
      email,
      role,
      display_name: full_name,
      org_name: orgName,
      org_slug: orgSlug,
      org_logo: null,
    });

    // Audit log
    logAuditEvent({
      orgId,
      userId: newUser.user_id,
      action: 'signup',
      details: { invite_token: !!invite_token },
      request,
    });

    const response = NextResponse.json({
      success: true,
      redirect: invite_token ? '/' : '/onboarding',
    });

    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[auth/signup] error:', error);
    return NextResponse.json({ error: 'Signup failed' }, { status: 500 });
  }
}
