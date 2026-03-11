import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { AUTH_SECRET_BYTES, DASHBOARD_PASSWORD } from './config';

// ─── Legacy single-tenant auth ──────────────────────────────────────────────

export async function createSession(): Promise<string> {
  const token = await new SignJWT({ authenticated: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(AUTH_SECRET_BYTES);
  return token;
}

export async function verifySession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return false;
    await jwtVerify(token, AUTH_SECRET_BYTES);
    return true;
  } catch {
    return false;
  }
}

export async function validatePassword(password: string): Promise<boolean> {
  return password === DASHBOARD_PASSWORD;
}

// ─── Multi-tenant user auth ─────────────────────────────────────────────────

interface UserSessionPayload {
  user_id: number;
  org_id: number;
  email: string;
  role: string;
  display_name: string;
  org_name: string;
  org_slug: string;
  org_logo?: string | null;
}

export async function createUserSession(payload: UserSessionPayload): Promise<string> {
  const token = await new SignJWT({
    authenticated: true,
    ...payload,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(AUTH_SECRET_BYTES);
  return token;
}

export async function getSessionPayload(): Promise<(UserSessionPayload & { authenticated: boolean }) | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('session')?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, AUTH_SECRET_BYTES);
    return payload as unknown as UserSessionPayload & { authenticated: boolean };
  } catch {
    return null;
  }
}

// ─── Password hashing utilities ─────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPasswordHash(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
