import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tests that verify auth routes have proper rate limiting applied.
 */

const AUTH_DIR = join(__dirname, '..', 'src', 'app', 'api', 'auth');

const AUTH_ROUTES = [
  { path: 'route.ts', name: 'login', needsRateLimit: true },
  { path: 'signup/route.ts', name: 'signup', needsRateLimit: true },
  { path: 'forgot-password/route.ts', name: 'forgot-password', needsRateLimit: true },
  { path: 'reset-password/route.ts', name: 'reset-password', needsRateLimit: true },
  { path: 'verify-email/route.ts', name: 'verify-email', needsRateLimit: true },
  { path: 'invite/route.ts', name: 'invite', needsRateLimit: true },
  { path: 'logout/route.ts', name: 'logout', needsRateLimit: false },
];

describe('Auth Route Security', () => {
  for (const route of AUTH_ROUTES) {
    if (!route.needsRateLimit) continue;

    it(`/api/auth/${route.name} has rate limiting`, () => {
      const filePath = join(AUTH_DIR, route.path);
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toContain('checkRateLimit');
      expect(content).toMatch(/authLimiter|apiLimiter/);
    });
  }

  it('login route validates credentials before creating session', () => {
    const content = readFileSync(join(AUTH_DIR, 'route.ts'), 'utf-8');

    // Should validate before creating session
    expect(content).toContain('validateUserCredentials');
    expect(content).toContain('createUserSession');
  });

  it('signup route validates input with zod schema', () => {
    const content = readFileSync(join(AUTH_DIR, 'signup/route.ts'), 'utf-8');

    expect(content).toContain('signupSchema');
    expect(content).toContain('safeParse');
  });

  it('signup route hashes passwords', () => {
    const content = readFileSync(join(AUTH_DIR, 'signup/route.ts'), 'utf-8');

    expect(content).toContain('hashPassword');
    // Should NOT contain plain text password storage
    expect(content).not.toMatch(/password_hash\s*=\s*password[^_]/);
  });

  it('forgot-password route prevents email enumeration', () => {
    const content = readFileSync(join(AUTH_DIR, 'forgot-password/route.ts'), 'utf-8');

    // Should always return 200 regardless of whether email exists
    const successResponses = (content.match(/NextResponse\.json\(\{.*success:\s*true/g) || []).length;
    expect(successResponses).toBeGreaterThanOrEqual(2); // success case + error case both return 200
  });

  it('reset-password route validates token before allowing password change', () => {
    const content = readFileSync(join(AUTH_DIR, 'reset-password/route.ts'), 'utf-8');

    expect(content).toContain('used_at');
    expect(content).toContain('expires_at');
    expect(content).toContain('Invalid or expired');
  });

  it('session cookies are httpOnly and secure', () => {
    const loginContent = readFileSync(join(AUTH_DIR, 'route.ts'), 'utf-8');

    expect(loginContent).toContain('httpOnly: true');
    expect(loginContent).toContain("secure: process.env.NODE_ENV === 'production'");
    expect(loginContent).toContain("sameSite: 'lax'");
  });
});
