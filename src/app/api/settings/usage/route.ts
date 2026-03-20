import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/tenant';
import { getUsage, checkLimit, checkResourceCount } from '@/lib/usage';
import { getOrgPlan } from '@/lib/feature-gate';
import { getPlanLimits, PLAN_DISPLAY_NAMES, PLANS, type PlanName } from '@/lib/plans';

export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const plan = await getOrgPlan(orgId);
    const limits = getPlanLimits(plan);
    const period = new Date().toISOString().slice(0, 7);
    const usage = await getUsage(orgId, period);

    // Check specific limits
    const [contacts, emails, aiGenerations, sequences, campaigns, users] = await Promise.all([
      checkLimit(orgId, plan, 'maxContacts', 'contact_created'),
      checkLimit(orgId, plan, 'maxEmailsPerMonth', 'email_sent'),
      checkLimit(orgId, plan, 'maxAiGenerationsPerMonth', 'ai_generation'),
      checkResourceCount(orgId, plan, 'maxSequences', 'crm.sequences'),
      checkResourceCount(orgId, plan, 'maxCampaigns', 'bdr.lead_campaigns'),
      checkResourceCount(orgId, plan, 'maxUsers', 'crm.users', 'AND is_active = true'),
    ]);

    return NextResponse.json({
      plan,
      planDisplayName: PLAN_DISPLAY_NAMES[plan as PlanName] || plan,
      period,
      limits: {
        contacts,
        emails,
        aiGenerations,
        sequences,
        campaigns,
        users,
      },
      features: limits.features,
      rawUsage: usage,
    });
  } catch (error) {
    console.error('[settings/usage] error:', error);
    return NextResponse.json({ error: 'Failed to load usage data' }, { status: 500 });
  }
}
