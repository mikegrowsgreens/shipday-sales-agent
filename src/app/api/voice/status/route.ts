import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/voice/status - Get voice agent status
 *
 * Proxies to the voice agent's health/status endpoints.
 * Used by the Sales Hub dashboard to show active AI calls.
 */
export async function GET() {
  try {
    const voiceAgentHost = process.env.VOICE_AGENT_HOST || 'http://localhost';
    const voiceAgentPort = process.env.VOICE_AGENT_PORT || '3006';
    const baseUrl = voiceAgentHost.startsWith('http') ? voiceAgentHost : `http://${voiceAgentHost}:${voiceAgentPort}`;

    const [healthRes, statusRes] = await Promise.allSettled([
      fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) }),
      fetch(`${baseUrl}/status`, { signal: AbortSignal.timeout(3000) }),
    ]);

    const health = healthRes.status === 'fulfilled' && healthRes.value.ok
      ? await healthRes.value.json()
      : { status: 'offline' };

    const status = statusRes.status === 'fulfilled' && statusRes.value.ok
      ? await statusRes.value.json()
      : { activeCalls: [] };

    return NextResponse.json({
      voiceAgent: {
        ...health,
        ...status,
      },
    });
  } catch (error) {
    console.error('[voice/status] Error:', error);
    return NextResponse.json({
      voiceAgent: { status: 'offline', error: 'Voice agent unreachable' },
    });
  }
}
