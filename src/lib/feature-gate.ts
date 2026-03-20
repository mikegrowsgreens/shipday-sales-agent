/**
 * Feature gating middleware for plan-based access control.
 */

import { getPlanLimits, getMinimumPlan, PLAN_DISPLAY_NAMES, type FeatureKey, type PlanName } from './plans';
import { checkLimit, checkResourceCount } from './usage';

export class PlanUpgradeError extends Error {
  status = 403;
  code = 'PLAN_UPGRADE_REQUIRED';
  requiredPlan: string;

  constructor(message: string, requiredPlan: string) {
    super(message);
    this.name = 'PlanUpgradeError';
    this.requiredPlan = requiredPlan;
  }
}

/**
 * Require that the org's plan includes a given feature.
 * Throws PlanUpgradeError if the feature is not available.
 */
export function requireFeature(plan: string, feature: FeatureKey): void {
  const limits = getPlanLimits(plan);
  if (!limits.features[feature]) {
    const minPlan = getMinimumPlan(feature);
    const displayName = PLAN_DISPLAY_NAMES[minPlan] || minPlan;
    throw new PlanUpgradeError(
      `This feature requires a ${displayName} plan or higher`,
      minPlan
    );
  }
}

/**
 * Check a monthly usage limit and throw if exceeded.
 */
export async function requireUsageLimit(
  orgId: number,
  plan: string,
  limitKey: 'maxContacts' | 'maxEmailsPerMonth' | 'maxAiGenerationsPerMonth',
  eventType: string
): Promise<void> {
  const check = await checkLimit(orgId, plan, limitKey, eventType);
  if (!check.allowed) {
    throw new PlanUpgradeError(
      `You've reached your ${limitKey.replace('max', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase()} limit (${check.current}/${check.limit}). Upgrade your plan for more.`,
      'starter'
    );
  }
}

/**
 * Check a resource count limit and throw if exceeded.
 */
export async function requireResourceLimit(
  orgId: number,
  plan: string,
  limitKey: 'maxContacts' | 'maxSequences' | 'maxCampaigns' | 'maxUsers',
  table: string,
  extraWhere = ''
): Promise<void> {
  const check = await checkResourceCount(orgId, plan, limitKey, table, extraWhere);
  if (!check.allowed) {
    throw new PlanUpgradeError(
      `You've reached your ${limitKey.replace('max', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase()} limit (${check.current}/${check.limit}). Upgrade your plan for more.`,
      'starter'
    );
  }
}

/**
 * Get the org's plan from the organizations table.
 */
export async function getOrgPlan(orgId: number): Promise<string> {
  const { queryOne } = await import('./db');
  const row = await queryOne<{ plan: string }>(
    `SELECT plan FROM crm.organizations WHERE org_id = $1`,
    [orgId]
  );
  return row?.plan || 'free';
}
