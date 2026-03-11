import crypto from 'crypto';
import { TRACKING_HMAC_SECRET } from './config';

/**
 * Generate an HMAC signature for a tracking token.
 * Used to sign sendId values in open/click tracking URLs
 * so they can't be guessed or enumerated.
 */
export function signTrackingToken(sendId: string): string {
  return crypto
    .createHmac('sha256', TRACKING_HMAC_SECRET)
    .update(sendId)
    .digest('hex')
    .substring(0, 16); // 16-char hex = 64 bits of HMAC, sufficient for URL tokens
}

/**
 * Verify an HMAC-signed tracking token.
 */
export function verifyTrackingToken(sendId: string, sig: string): boolean {
  const expected = signTrackingToken(sendId);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}
