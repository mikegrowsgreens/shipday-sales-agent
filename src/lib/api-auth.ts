/**
 * API key authentication for the customer-facing API.
 * Validates Bearer sk_... tokens against hashed keys in crm.api_keys.
 */

import { createHash } from 'crypto';
import { queryOne, query } from './db';

interface ApiKeyAuth {
  orgId: number;
  keyId: number;
  permissions: string[];
}

/**
 * Authenticate a request using an API key (Bearer sk_...).
 * Returns org/key info on success, null on failure.
 */
export async function authenticateApiKey(request: Request): Promise<ApiKeyAuth | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer sk_')) return null;

  const key = authHeader.slice(7); // Remove "Bearer "
  const keyHash = createHash('sha256').update(key).digest('hex');

  const result = await queryOne<{
    key_id: number;
    org_id: number;
    permissions: string[];
  }>(
    `SELECT key_id, org_id, permissions
     FROM crm.api_keys
     WHERE key_hash = $1 AND is_active = true
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [keyHash]
  );

  if (!result) return null;

  // Update last_used_at asynchronously
  query(
    `UPDATE crm.api_keys SET last_used_at = NOW() WHERE key_id = $1`,
    [result.key_id]
  ).catch(() => {});

  return {
    orgId: result.org_id,
    keyId: result.key_id,
    permissions: result.permissions || [],
  };
}

/**
 * Generate a new API key. Returns the full key (show ONCE) and its hash.
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const randomBytes = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  const key = `sk_${randomBytes}`;
  const prefix = key.slice(0, 11); // "sk_" + 8 chars
  const hash = createHash('sha256').update(key).digest('hex');
  return { key, prefix, hash };
}
