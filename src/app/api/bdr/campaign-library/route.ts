import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { CAMPAIGN_LIBRARY, type LibraryStep } from '@/lib/campaign-library';

interface CampaignTemplate {
  id: number;
  tier: string;
  name: string;
  description: string | null;
  steps: LibraryStep[];
  is_active: boolean;
  is_library_template: boolean;
  variant: string | null;
  auto_assignable: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/bdr/campaign-library
 * Returns the campaign library definitions + any already-seeded templates for this org.
 * Auto-seeds library templates if they don't exist yet.
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    // Check if library templates already exist for this org
    const existing = await query<CampaignTemplate>(
      `SELECT id, tier, name, description, steps, is_active, is_library_template, variant, auto_assignable, created_at, updated_at
       FROM bdr.campaign_templates
       WHERE is_library_template = true AND org_id = $1
       ORDER BY tier, variant`,
      [orgId]
    );

    if (existing.length === 0) {
      // Seed library templates for this org
      await seedLibraryTemplates(orgId);

      // Re-fetch after seeding
      const seeded = await query<CampaignTemplate>(
        `SELECT id, tier, name, description, steps, is_active, is_library_template, variant, auto_assignable, created_at, updated_at
         FROM bdr.campaign_templates
         WHERE is_library_template = true AND org_id = $1
         ORDER BY tier, variant`,
        [orgId]
      );

      return NextResponse.json({
        templates: seeded,
        library: CAMPAIGN_LIBRARY,
        seeded: true,
      });
    }

    return NextResponse.json({
      templates: existing,
      library: CAMPAIGN_LIBRARY,
      seeded: false,
    });
  } catch (error) {
    console.error('[campaign-library] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign library' }, { status: 500 });
  }
}

/**
 * POST /api/bdr/campaign-library
 * Re-seed library templates (useful after library updates).
 * Body: { force?: boolean } - if true, deactivates existing and re-seeds.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const { force } = await request.json().catch(() => ({ force: false }));

    if (force) {
      // Deactivate existing library templates
      await query(
        `UPDATE bdr.campaign_templates SET is_active = false, updated_at = NOW()
         WHERE is_library_template = true AND org_id = $1`,
        [orgId]
      );
    }

    // Check what already exists
    const existing = await query<{ tier: string; variant: string }>(
      `SELECT tier, variant FROM bdr.campaign_templates
       WHERE is_library_template = true AND is_active = true AND org_id = $1`,
      [orgId]
    );
    const existingSet = new Set(existing.map(e => `${e.tier}:${e.variant}`));

    let seededCount = 0;
    for (const tier of CAMPAIGN_LIBRARY) {
      for (const [variantKey, variant] of Object.entries(tier.variants)) {
        const key = `${tier.tier_key}:${variantKey}`;
        if (existingSet.has(key)) continue;

        await query(
          `INSERT INTO bdr.campaign_templates (org_id, tier, name, description, steps, is_library_template, variant, auto_assignable)
           VALUES ($1, $2, $3, $4, $5, true, $6, true)`,
          [orgId, tier.tier_key, `${tier.name} - ${variant.name}`, variant.description, JSON.stringify(variant.steps), variantKey]
        );
        seededCount++;
      }
    }

    return NextResponse.json({ seeded: seededCount, message: `${seededCount} library templates created` });
  } catch (error) {
    console.error('[campaign-library] POST error:', error);
    return NextResponse.json({ error: 'Failed to seed campaign library' }, { status: 500 });
  }
}

/**
 * Seed all library templates for an org.
 */
async function seedLibraryTemplates(orgId: number): Promise<void> {
  for (const tier of CAMPAIGN_LIBRARY) {
    for (const [variantKey, variant] of Object.entries(tier.variants)) {
      await query(
        `INSERT INTO bdr.campaign_templates (org_id, tier, name, description, steps, is_library_template, variant, auto_assignable)
         VALUES ($1, $2, $3, $4, $5, true, $6, true)`,
        [orgId, tier.tier_key, `${tier.name} - ${variant.name}`, variant.description, JSON.stringify(variant.steps), variantKey]
      );
    }
  }
}
