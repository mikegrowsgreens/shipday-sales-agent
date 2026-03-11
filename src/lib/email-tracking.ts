/**
 * Email Tracking Preprocessor
 *
 * Injects open-tracking pixels and rewrites links for click tracking
 * before emails are sent via n8n/Gmail.
 *
 * Tracking URLs include HMAC signatures to prevent enumeration:
 *   Open:  /api/track/o/{sendId}?sig={hmac}
 *   Click: /api/track/c/{sendId}?url={encodedUrl}&i={linkIndex}&sig={hmac}
 */

import { TRACKING_BASE_URL } from './config';
import { signTrackingToken } from './hmac';

const BASE_URL = TRACKING_BASE_URL;

/**
 * Wraps plain text in minimal HTML for tracking pixel support.
 */
function wrapPlainText(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');
  return `<html><body style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">${escaped}</body></html>`;
}

/**
 * Inject a 1x1 tracking pixel at the end of the email HTML body.
 */
function injectTrackingPixel(html: string, sendId: string): string {
  const sig = signTrackingToken(sendId);
  const pixelUrl = `${BASE_URL}/api/track/o/${sendId}?sig=${sig}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:block;width:1px;height:1px;border:0;" alt="" />`;

  // Insert before </body> if it exists, otherwise append
  if (html.includes('</body>')) {
    return html.replace('</body>', `${pixel}</body>`);
  }
  return html + pixel;
}

/**
 * Rewrite all <a href="..."> links to go through the click tracker.
 * Skips mailto: and tel: links.
 */
function rewriteLinks(html: string, sendId: string): string {
  let linkIndex = 0;
  const sig = signTrackingToken(sendId);

  return html.replace(
    /<a\s([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi,
    (match, before, url, after) => {
      // Skip mailto, tel, and anchor links
      if (url.startsWith('mailto:') || url.startsWith('tel:') || url.startsWith('#')) {
        return match;
      }

      // Skip tracking URLs (don't double-wrap)
      if (url.includes('/api/track/')) {
        return match;
      }

      const trackedUrl = `${BASE_URL}/api/track/c/${sendId}?url=${encodeURIComponent(url)}&i=${linkIndex++}&sig=${sig}`;
      return `<a ${before}href="${trackedUrl}"${after}>`;
    }
  );
}

/**
 * Preprocess an email for tracking.
 * Takes the email body (HTML or plain text) and the send ID,
 * returns tracking-enhanced HTML ready for sending.
 */
export function preprocessEmail(body: string, sendId: string, isHtml = false): string {
  let html = isHtml ? body : wrapPlainText(body);
  html = rewriteLinks(html, sendId);
  html = injectTrackingPixel(html, sendId);
  return html;
}

/**
 * Generate the tracking pixel URL for a given send ID.
 */
export function getPixelUrl(sendId: string): string {
  const sig = signTrackingToken(sendId);
  return `${BASE_URL}/api/track/o/${sendId}?sig=${sig}`;
}

/**
 * Generate a tracked link URL.
 */
export function getTrackedLink(sendId: string, originalUrl: string, linkIndex: number): string {
  const sig = signTrackingToken(sendId);
  return `${BASE_URL}/api/track/c/${sendId}?url=${encodeURIComponent(originalUrl)}&i=${linkIndex}&sig=${sig}`;
}
