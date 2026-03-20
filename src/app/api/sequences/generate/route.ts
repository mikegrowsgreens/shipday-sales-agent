import { NextRequest, NextResponse } from 'next/server';
import { generateSequence } from '@/lib/ai';
import { requireTenantSession } from '@/lib/tenant';
import { trackUsage } from '@/lib/usage';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/sequences/generate
 * Generate a complete multi-step sequence via Claude AI.
 * Returns generated steps (not saved) for review in the builder.
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const body = await request.json();
    const { prompt, channel_mix, num_steps, tone } = body as {
      prompt: string;
      channel_mix?: string[];
      num_steps?: number;
      tone?: string;
    };

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const result = await generateSequence({
      prompt,
      channel_mix,
      num_steps: num_steps || 5,
      tone,
    });

    const tenant = await requireTenantSession();
    trackUsage(tenant.org_id, 'ai_generations');

    return NextResponse.json(result);
  } catch (error) {
    console.error('[sequences/generate] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
