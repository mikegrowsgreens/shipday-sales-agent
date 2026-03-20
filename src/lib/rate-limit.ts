import { RateLimiterMemory } from 'rate-limiter-flexible';
import { NextResponse } from 'next/server';

// Auth endpoints: 5 attempts per 15 minutes per IP
export const authLimiter = new RateLimiterMemory({
  points: 5,
  duration: 15 * 60,
  keyPrefix: 'auth',
});

// General API: 100 requests per minute per IP
export const apiLimiter = new RateLimiterMemory({
  points: 100,
  duration: 60,
  keyPrefix: 'api',
});

// Track endpoints (open pixel, click redirect): 300/min per IP
export const trackLimiter = new RateLimiterMemory({
  points: 300,
  duration: 60,
  keyPrefix: 'track',
});

// AI generation endpoints: 20 requests per minute per IP (cost protection)
export const aiLimiter = new RateLimiterMemory({
  points: 20,
  duration: 60,
  keyPrefix: 'ai',
});

// Import/bulk endpoints: 10 requests per minute per IP (abuse prevention)
export const importLimiter = new RateLimiterMemory({
  points: 10,
  duration: 60,
  keyPrefix: 'import',
});

// Public scheduling slots: 60 requests per minute per IP
export const slotsLimiter = new RateLimiterMemory({
  points: 60,
  duration: 60,
  keyPrefix: 'slots',
});

// Public booking/cancel: 10 requests per hour per IP (abuse prevention)
export const bookingLimiter = new RateLimiterMemory({
  points: 10,
  duration: 3600,
  keyPrefix: 'booking',
});

/**
 * Check rate limit for a given IP. Returns NextResponse 429 if exceeded, null if OK.
 * Internal calls with a valid X-Internal-Key header bypass rate limiting.
 */
export async function checkRateLimit(
  limiter: RateLimiterMemory,
  ip: string,
  request?: Request,
): Promise<NextResponse | null> {
  // Bypass rate limiting for internal service calls (voice agent, etc.)
  if (request) {
    const internalKey = request.headers.get('x-internal-key');
    if (internalKey && process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) {
      return null;
    }
  }
  try {
    await limiter.consume(ip);
    return null;
  } catch {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
}
