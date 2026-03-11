import { Pool } from 'pg';

// DigitalOcean managed Postgres uses a self-signed cert chain.
// Strip sslmode from the URL (pg driver handles it via the ssl option).
function cleanConnString(url: string): string {
  return url.replace(/[?&]sslmode=require/g, '');
}

function makePool(envVar: string, label: string): Pool {
  const raw = process.env[envVar] || '';
  if (!raw) console.warn(`[db] ${label}: ${envVar} not set — using empty connection string`);
  return new Pool({
    connectionString: cleanConnString(raw),
    ssl: raw.includes('digitalocean') ? { rejectUnauthorized: false } : false,
    max: 10,
  });
}

// wincall_brain DB — holds bdr.*, public.*, and new crm.* schemas
const wincallPool = makePool('DATABASE_URL_WINCALL', 'wincall_brain');

// defaultdb DB — holds shipday.* schema (post-demo dashboard data)
const defaultdbPool = makePool('DATABASE_URL_DEFAULTDB', 'defaultdb');

// ─── wincall_brain queries (bdr.*, public.*, crm.*) ──────────────────────────

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await wincallPool.query(text, params);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await wincallPool.query(text, params);
  return (result.rows[0] as T) || null;
}

// ─── defaultdb queries (shipday.*) ───────────────────────────────────────────

export async function queryShipday<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await defaultdbPool.query(text, params);
  return result.rows as T[];
}

export async function queryShipdayOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await defaultdbPool.query(text, params);
  return (result.rows[0] as T) || null;
}

export { wincallPool, defaultdbPool };
