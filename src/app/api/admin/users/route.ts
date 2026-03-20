import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { hashPassword } from '@/lib/auth';

export async function GET() {
  try {
    const tenant = await requireTenantSession();

    if (tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const users = await query<{
      user_id: number;
      email: string;
      display_name: string | null;
      role: string;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
    }>(
      `SELECT user_id, email, display_name, role, is_active,
              last_login_at::text, created_at::text
       FROM crm.users
       WHERE org_id = $1
       ORDER BY created_at`,
      [tenant.org_id]
    );

    return NextResponse.json({ users });
  } catch (error) {
    console.error('[admin/users] GET error:', error);
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();

    if (tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, display_name, role } = body;

    if (!email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Check for existing user
    const existing = await query<{ user_id: number }>(
      `SELECT user_id FROM crm.users WHERE email = $1`,
      [email.trim().toLowerCase()]
    );

    if (existing.length > 0) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }

    // Hash password with bcrypt
    const passwordHash = await hashPassword(password);

    const result = await query<{ user_id: number }>(
      `INSERT INTO crm.users (org_id, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id`,
      [tenant.org_id, email.trim().toLowerCase(), passwordHash, display_name || null, role || 'member']
    );

    return NextResponse.json({ user_id: result[0].user_id, success: true });
  } catch (error) {
    console.error('[admin/users] POST error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
