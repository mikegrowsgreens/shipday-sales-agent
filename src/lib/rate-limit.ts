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

/**
 * Check rate limit for a given IP. Returns NextResponse 429 if exceeded, null if OK.
 */
export async function checkRateLimit(
  limiter: RateLimiterMemory,
  ip: string
): Promise<NextResponse | null> {
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
