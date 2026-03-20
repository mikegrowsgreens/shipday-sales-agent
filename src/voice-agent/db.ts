/**
 * Voice Agent Database Connection
 * Standalone pg pool for the voice agent process (separate from Next.js).
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

function cleanConnString(url: string): string {
  return url.replace(/[?&]sslmode=require/g, '');
}

export function getPool(): Pool {
  if (!pool) {
    const raw = process.env.DATABASE_URL_WINCALL || '';
    pool = new Pool({
      connectionString: cleanConnString(raw),
      ssl: raw.includes('digitalocean') ? { rejectUnauthorized: false } : false,
      max: 5,
    });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await getPool().query(text, params);
  return (result.rows[0] as T) || null;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
