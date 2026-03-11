import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

interface TemplateStep {
  step_number: number;
  delay_days: number;
  channel: string;
  angle: string;
  tone: string;
  instructions: string;
}

interface CampaignTemplate {
  id: number;
  tier: string;
  name: string;
  description: string | null;
  steps: TemplateStep[];
  is_active: boolean;
  auto_approve_score_threshold: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/bdr/campaign-templates
 * Returns all campaign templates grouped by tier.
 */
export async function GET() {
  try {
    const templates = await query<CampaignTemplate>(
      `SELECT id, tier, name, description, steps, is_active, auto_approve_score_threshold, created_at, updated_at
       FROM bdr.campaign_templates
       WHERE is_active = true
       ORDER BY tier, id`
    );

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('[campaign-templates] GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

/**
 * POST /api/bdr/campaign-templates
 * Create a new template.
 */
export async function POST(request: NextRequest) {
  try {
    const { tier, name, description, steps } = await request.json();

    if (!tier || !name) {
      return NextResponse.json({ error: 'tier and name are required' }, { status: 400 });
    }

    const result = await query<CampaignTemplate>(
      `INSERT INTO bdr.campaign_templates (tier, name, description, steps)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tier, name, description || null, JSON.stringify(steps || [])]
    );

    return NextResponse.json({ template: result[0] });
  } catch (error) {
    console.error('[campaign-templates] POST error:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}

/**
 * PUT /api/bdr/campaign-templates
 * Update an existing template.
 */
export async function PUT(request: NextRequest) {
  try {
    const { id, name, description, steps, auto_approve_score_threshold } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const fields: string[] = [];
    const params: unknown[] = [];
    let pi = 1;

    if (name !== undefined) {
      fields.push(`name = $${pi++}`);
      params.push(name);
    }
    if (description !== undefined) {
      fields.push(`description = $${pi++}`);
      params.push(description);
    }
    if (steps !== undefined) {
      fields.push(`steps = $${pi++}`);
      params.push(JSON.stringify(steps));
    }
    if (auto_approve_score_threshold !== undefined) {
      fields.push(`auto_approve_score_threshold = $${pi++}`);
      params.push(auto_approve_score_threshold);
    }
    fields.push('updated_at = NOW()');
    params.push(id);

    const result = await query<CampaignTemplate>(
      `UPDATE bdr.campaign_templates SET ${fields.join(', ')} WHERE id = $${pi} RETURNING *`,
      params
    );

    return NextResponse.json({ template: result[0] });
  } catch (error) {
    console.error('[campaign-templates] PUT error:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}
