import { NextRequest, NextResponse } from 'next/server';
import { generateSequence } from '@/lib/ai';

/**
 * POST /api/sequences/generate
 * Generate a complete multi-step sequence via Claude AI.
 * Returns generated steps (not saved) for review in the builder.
 */
export async function POST(request: NextRequest) {
  try {
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

    return NextResponse.json(result);
  } catch (error) {
    console.error('[sequences/generate] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 },
    );
  }
}
