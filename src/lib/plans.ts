/**
 * Plan tier definitions and feature gating configuration.
 * Payment/billing integration is deferred — soft limits only.
 */

export interface PlanLimits {
  maxContacts: number;
  maxSequences: number;
  maxCampaigns: number;
  maxEmailsPerMonth: number;
  maxAiGenerationsPerMonth: number;
  maxUsers: number;
  features: {
    sequences: boolean;
    campaigns: boolean;
    aiGeneration: boolean;
    phoneDialer: boolean;
    coaching: boolean;
    customBranding: boolean;
    apiAccess: boolean;
    linkedinIntegration: boolean;
  };
}

export type PlanName = 'free' | 'starter' | 'pro';
export type FeatureKey = keyof PlanLimits['features'];

export const PLANS: Record<PlanName, PlanLimits> = {
  free: {
    maxContacts: 100,
    maxSequences: 2,
    maxCampaigns: 1,
    maxEmailsPerMonth: 200,
    maxAiGenerationsPerMonth: 50,
    maxUsers: 1,
    features: {
      sequences: true,
      campaigns: false,
      aiGeneration: true,
      phoneDialer: false,
      coaching: false,
      customBranding: false,
      apiAccess: false,
      linkedinIntegration: false,
    },
  },
  starter: {
    maxContacts: 1000,
    maxSequences: 10,
    maxCampaigns: 5,
    maxEmailsPerMonth: 2000,
    maxAiGenerationsPerMonth: 500,
    maxUsers: 3,
    features: {
      sequences: true,
      campaigns: true,
      aiGeneration: true,
      phoneDialer: false,
      coaching: true,
      customBranding: false,
      apiAccess: false,
      linkedinIntegration: true,
    },
  },
  pro: {
    maxContacts: 10000,
    maxSequences: -1, // unlimited
    maxCampaigns: -1,
    maxEmailsPerMonth: 20000,
    maxAiGenerationsPerMonth: 5000,
    maxUsers: 10,
    features: {
      sequences: true,
      campaigns: true,
      aiGeneration: true,
      phoneDialer: true,
      coaching: true,
      customBranding: true,
      apiAccess: true,
      linkedinIntegration: true,
    },
  },
};

export const PLAN_DISPLAY_NAMES: Record<PlanName, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
};

/**
 * Get the minimum plan that includes a given feature.
 */
export function getMinimumPlan(feature: FeatureKey): PlanName {
  const planOrder: PlanName[] = ['free', 'starter', 'pro'];
  for (const plan of planOrder) {
    if (PLANS[plan].features[feature]) return plan;
  }
  return 'pro';
}

/**
 * Get plan limits, defaulting to free if plan name is unrecognized.
 */
export function getPlanLimits(plan: string): PlanLimits {
  return PLANS[plan as PlanName] || PLANS.free;
}
