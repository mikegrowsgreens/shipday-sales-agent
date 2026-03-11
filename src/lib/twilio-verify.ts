import crypto from 'crypto';

/**
 * Verify Twilio webhook signature (X-Twilio-Signature header).
 * Implements Twilio's signature validation without requiring the twilio SDK.
 *
 * @see https://www.twilio.com/docs/usage/security#validating-requests
 */
export function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  if (!authToken || !signature) return false;

  // Sort params alphabetically by key, append key+value to URL
  const data = url + Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], '');

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(data)
    .digest('base64');

  // Use timing-safe comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false; // Different lengths
  }
}
