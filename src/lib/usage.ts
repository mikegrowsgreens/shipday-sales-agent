/**
 * Usage tracking and limit checking for plan enforcement.
 * Uses soft limits (UI warnings) without payment gates.
 */

import { query, queryOne } from './db';
import { getPlanLimits } from './plans';

/**
 * Track a usage event for an org in the current monthly period.
 * Uses upsert to increment the count atomically.
 */
export async function trackUsage(orgId: number, eventType: string, count = 1): Promise<void> {
  const period = new Date().toISOString().slice(0, 7); // '2026-03'
  await query(
    `INSERT INTO crm.usage_events (org_id, event_type, count, period)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, event_type, period)
     DO UPDATE SET count = crm.usage_events.count + $3`,
    [orgId, eventType, count, period]
  );
}

/**
 * Get all usage for an org in a given period.
 */
export async function getUsage(
  orgId: number,
  period?: string
): Promise<Record<string, number>> {
  const p = period || new Date().toISOString().slice(0, 7);
  const rows = await query<{ event_type: string; total: string }>(
    `SELECT event_type, SUM(count) as total
     FROM crm.usage_events
     WHERE org_id = $1 AND period = $2
     GROUP BY event_type`,
    [orgId, p]
  );

  const usage: Record<string, number> = {};
  for (const row of rows) {
    usage[row.event_type] = parseInt(row.total, 10);
  }
  return usage;
}

/**
 * Get a specific usage count for an org/event type.
 */
export async function getUsageCount(orgId: number, eventType: string, period?: string): Promise<number> {
  const p = period || new Date().toISOString().slice(0, 7);
  const row = await queryOne<{ total: string }>(
    `SELECT COALESCE(SUM(count), 0) as total
     FROM crm.usage_events
     WHERE org_id = $1 AND event_type = $2 AND period = $3`,
    [orgId, eventType, p]
  );
  return parseInt(row?.total || '0', 10);
}

export interface LimitCheck {
  allowed: boolean;
  current: number;
  limit: number;
  percentage: number;
}

/**
 * Check if an org has hit its limit for a given resource.
 * Returns { allowed, current, limit, percentage }.
 */
export async function checkLimit(
  orgId: number,
  plan: string,
  limitKey: 'maxContacts' | 'maxEmailsPerMonth' | 'maxAiGenerationsPerMonth',
  eventType: string
): Promise<LimitCheck> {
  const limits = getPlanLimits(plan);
  const max = limits[limitKey];
  const current = await getUsageCount(orgId, eventType);

  // -1 = unlimited
  if (max === -1) {
    return { allowed: true, current, limit: -1, percentage: 0 };
  }

  return {
    allowed: current < max,
    current,
    limit: max,
    percentage: Math.min(100, Math.round((current / max) * 100)),
  };
}

/**
 * Check total resource count (for sequences, campaigns, users — lifetime, not monthly).
 */
export async function checkResourceCount(
  orgId: number,
  plan: string,
  limitKey: 'maxContacts' | 'maxSequences' | 'maxCampaigns' | 'maxUsers',
  table: string,
  extraWhere = ''
): Promise<LimitCheck> {
  const limits = getPlanLimits(plan);
  const max = limits[limitKey];

  const row = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM ${table} WHERE org_id = $1 ${extraWhere}`,
    [orgId]
  );
  const current = parseInt(row?.count || '0', 10);

  if (max === -1) {
    return { allowed: true, current, limit: -1, percentage: 0 };
  }

  return {
    allowed: current < max,
    current,
    limit: max,
    percentage: Math.min(100, Math.round((current / max) * 100)),
  };
}
