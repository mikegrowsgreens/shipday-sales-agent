/**
 * Centralized environment variable validation.
 * Throws at import time if any required env var is missing.
 * Import from here instead of reading process.env directly.
 */

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

// ─── Auth ────────────────────────────────────────────────────────────────────
export const AUTH_SECRET = requireEnv('AUTH_SECRET');
export const DASHBOARD_PASSWORD = requireEnv('DASHBOARD_PASSWORD');

// ─── Webhooks ────────────────────────────────────────────────────────────────
export const N8N_WEBHOOK_KEY = requireEnv('N8N_WEBHOOK_KEY');

// ─── External services ──────────────────────────────────────────────────────
export const N8N_BASE_URL = optionalEnv('N8N_BASE_URL', '');
export const TRACKING_BASE_URL = optionalEnv('TRACKING_BASE_URL', '');

// ─── Twilio ─────────────────────────────────────────────────────────────────
export const TWILIO_AUTH_TOKEN = optionalEnv('TWILIO_AUTH_TOKEN', '');

// ─── Tracking HMAC ───────────────────────────────────────────────────────────
export const TRACKING_HMAC_SECRET = optionalEnv('TRACKING_HMAC_SECRET', 'dev-tracking-hmac-secret');

// ─── Database ────────────────────────────────────────────────────────────────
export const DATABASE_URL_WINCALL = requireEnv('DATABASE_URL_WINCALL');
export const DATABASE_URL_DEFAULTDB = requireEnv('DATABASE_URL_DEFAULTDB');

// ─── JWT secret as Uint8Array for jose ───────────────────────────────────────
export const AUTH_SECRET_BYTES = new TextEncoder().encode(AUTH_SECRET);
