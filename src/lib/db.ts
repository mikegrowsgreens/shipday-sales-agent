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

// Primary DB — holds bdr.*, public.*, and crm.* schemas
const wincallPool = makePool('DATABASE_URL_WINCALL', 'primary');

// Deals DB — holds deal followup data (deals.* schema)
const defaultdbPool = makePool('DATABASE_URL_DEFAULTDB', 'deals');

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

/**
 * Execute a query with RLS context set for the given org_id.
 * Sets app.current_org_id for the duration of the transaction so
 * PostgreSQL Row-Level Security policies can enforce tenant isolation.
 *
 * Use this as a defense-in-depth layer alongside explicit org_id WHERE clauses.
 */
export async function queryWithRLS<T = Record<string, unknown>>(
  text: string,
  params: unknown[],
  orgId: number
): Promise<T[]> {
  const safeOrgId = Math.floor(Number(orgId));
  if (!Number.isFinite(safeOrgId) || safeOrgId <= 0) {
    throw new Error(`Invalid org_id for RLS context: ${orgId}`);
  }
  const client = await wincallPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_org_id', String(safeOrgId)]);
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result.rows as T[];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Like queryWithRLS but returns only the first row or null.
 */
export async function queryOneWithRLS<T = Record<string, unknown>>(
  text: string,
  params: unknown[],
  orgId: number
): Promise<T | null> {
  const rows = await queryWithRLS<T>(text, params, orgId);
  return rows[0] || null;
}

// ─── defaultdb queries (deals/followups data) ────────────────────────────────

export async function queryDeals<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await defaultdbPool.query(text, params);
  return result.rows as T[];
}

export async function queryDealsOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await defaultdbPool.query(text, params);
  return (result.rows[0] as T) || null;
}

export { wincallPool, defaultdbPool };
