import { NextRequest, NextResponse } from 'next/server';
import { regenerateStep } from '@/lib/ai';
import { requireTenantSession } from '@/lib/tenant';

/**
 * POST /api/sequences/regenerate-step
 * Regenerate a single step within the context of a sequence.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json();
    const { step_type, context, instructions, surrounding_steps } = body as {
      step_type: string;
      context: string;
      instructions?: string;
      surrounding_steps?: Array<{ step_type: string; subject_template?: string; body_template?: string }>;
    };

    if (!step_type || !context) {
      return NextResponse.json(
        { error: 'step_type and context are required' },
        { status: 400 },
      );
    }

    const step = await regenerateStep({
      step_type,
      context,
      instructions,
      surrounding_steps,
    });

    return NextResponse.json(step);
  } catch (error) {
    console.error('[sequences/regenerate-step] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Regeneration failed' },
      { status: 500 },
    );
  }
}
