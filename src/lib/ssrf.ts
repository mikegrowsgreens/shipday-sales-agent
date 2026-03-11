/**
 * SSRF prevention: validate URLs before server-side fetch.
 * Blocks private/reserved IP ranges and non-HTTP protocols.
 */

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,  // link-local
  /^::1$/,        // IPv6 loopback
  /^fc00:/i,      // IPv6 unique local
  /^fe80:/i,      // IPv6 link-local
  /^fd/i,         // IPv6 private
];

export function isPrivateUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow http/https
    if (!['http:', 'https:'].includes(url.protocol)) {
      return true;
    }

    // Block localhost variants
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '[::1]') {
      return true;
    }

    // Block private IP ranges
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return true;
      }
    }

    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
      return true;
    }

    return false;
  } catch {
    return true; // Invalid URL = blocked
  }
}
