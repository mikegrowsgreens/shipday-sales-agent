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
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/terms',
  '/privacy',
  '/api/auth',
  '/api/webhooks',
  '/api/sequences/execute',
  '/api/twilio/status',
  '/api/bdr/webhook',
  '/api/followups/webhook',
  '/api/track',
  '/chat',
  '/api/chat/prospect',
  '/api/scheduling/slots',
  '/api/scheduling/book',
  '/api/scheduling/cancel',
  '/api/scheduling/public',
  '/api/scheduling/embed.js',
  '/book',
  // Note: /api/brain/sync removed from public paths — now requires auth (P1-8)
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and webhook endpoints
  if (publicPaths.some(p => pathname.startsWith(p))) {
    const response = NextResponse.next();
    response.headers.set('x-pathname', pathname);
    return response;
  }

  const isApiRoute = pathname.startsWith('/api/');

  // API key auth for API routes (Bearer sk_...) — bypass JWT/session check
  if (isApiRoute) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer sk_')) {
      // API key validation happens in the route handler (api-auth.ts)
      // Middleware just passes it through — the route validates the key
      return NextResponse.next();
    }
  }

  // Check session cookie
  const token = request.cookies.get('session')?.value;

  if (!token) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await jwtVerify(token, getSecret());
    const response = NextResponse.next();
    response.headers.set('x-pathname', pathname);
    return response;
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
