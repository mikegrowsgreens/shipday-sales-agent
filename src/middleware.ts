import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Note: middleware runs in Edge runtime — cannot import config.ts (Node.js APIs).
// AUTH_SECRET is read directly from process.env here.
const getSecret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('Missing required env var: AUTH_SECRET');
  return new TextEncoder().encode(s);
};

const publicPaths = [
  '/login',
  '/api/auth',
  '/api/webhooks',
  '/api/sequences/execute',
  '/api/twilio/status',
  '/api/bdr/webhook',
  '/api/followups/webhook',
  '/api/track',
  '/chat',
  '/api/chat/prospect',
  // Note: /api/brain/sync removed from public paths — now requires auth (P1-8)
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and webhook endpoints
  if (publicPaths.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get('session')?.value;
  const isApiRoute = pathname.startsWith('/api/');

  if (!token) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
