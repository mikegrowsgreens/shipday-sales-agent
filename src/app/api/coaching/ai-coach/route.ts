import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgPlan, requireFeature } from '@/lib/feature-gate';
import { trackUsage } from '@/lib/usage';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';
import { sanitizeInput, armorSystemPrompt, wrapUserData } from '@/lib/prompt-guard';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/coaching/ai-coach
 * AI Sales Coach - analyzes recent performance and gives specific coaching
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const plan = await getOrgPlan(tenant.org_id);
    requireFeature(plan, 'coaching');

    // Gather performance data for the last 14 days (org-scoped)
    const [
      emailMetrics,
      callMetrics,
      replyData,
      anglePerf,
      pipelineChanges,
      taskCompletion,
      sequencePerf,
    ] = await Promise.all([
      // Email activity (org-scoped)
      query<{ sent: string; opened: string; replied: string; bounced: string }>(`
        SELECT
          COUNT(CASE WHEN event_type = 'sent' THEN 1 END)::text as sent,
          COUNT(CASE WHEN event_type = 'opened' THEN 1 END)::text as opened,
          COUNT(CASE WHEN event_type IN ('replied','reply_received') THEN 1 END)::text as replied,
          COUNT(CASE WHEN event_type = 'bounced' THEN 1 END)::text as bounced
        FROM crm.touchpoints
        WHERE channel = 'email'
          AND occurred_at >= NOW() - INTERVAL '14 days'
          AND org_id = $1
      `, [orgId]),

      // Call activity (org-scoped)
      query<{ total: string; connected: string; avg_duration: string; voicemail: string }>(`
        SELECT
          COUNT(*)::text as total,
          COUNT(CASE WHEN disposition = 'connected' THEN 1 END)::text as connected,
          COALESCE(ROUND(AVG(duration_secs))::text, '0') as avg_duration,
          COUNT(CASE WHEN disposition = 'voicemail' THEN 1 END)::text as voicemail
        FROM crm.phone_calls
        WHERE started_at >= NOW() - INTERVAL '14 days'
          AND org_id = $1
      `, [orgId]),

      // Reply sentiment breakdown (org-scoped)
      query<{ sentiment: string; cnt: string }>(`
        SELECT
          COALESCE(metadata->>'reply_sentiment', 'unknown') as sentiment,
          COUNT(*)::text as cnt
        FROM crm.touchpoints
        WHERE event_type IN ('replied', 'reply_received')
          AND occurred_at >= NOW() - INTERVAL '14 days'
          AND org_id = $1
        GROUP BY metadata->>'reply_sentiment'
      `, [orgId]),

      // BDR angle performance
      query<{ angle: string; sent: string; replied: string }>(`
        SELECT
          COALESCE(l.email_angle, 'unknown') as angle,
          COUNT(CASE WHEN es.sent_at IS NOT NULL THEN 1 END)::text as sent,
          COUNT(CASE WHEN es.replied THEN 1 END)::text as replied
        FROM bdr.email_sends es
        JOIN bdr.leads l ON l.lead_id = es.lead_id::text
        WHERE es.sent_at >= NOW() - INTERVAL '14 days'
        GROUP BY l.email_angle
      `),

      // Pipeline stage changes (org-scoped)
      query<{ stage: string; cnt: string }>(`
        SELECT lifecycle_stage as stage, COUNT(*)::text as cnt
        FROM crm.contacts
        WHERE updated_at >= NOW() - INTERVAL '14 days'
          AND lifecycle_stage IN ('engaged','demo_completed','negotiation','won','lost')
          AND org_id = $1
        GROUP BY lifecycle_stage
      `, [orgId]),

      // Task completion rate (org-scoped)
      query<{ completed: string; skipped: string; pending: string }>(`
        SELECT
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::text as completed,
          COUNT(CASE WHEN status = 'skipped' THEN 1 END)::text as skipped,
          COUNT(CASE WHEN status = 'pending' THEN 1 END)::text as pending
        FROM crm.task_queue
        WHERE created_at >= NOW() - INTERVAL '14 days'
          AND org_id = $1
      `, [orgId]),

      // Sequence performance (org-scoped)
      query<{ name: string; enrolled: string; replied: string; booked: string }>(`
        SELECT
          s.name,
          COUNT(se.enrollment_id)::text as enrolled,
          COUNT(CASE WHEN se.status = 'replied' THEN 1 END)::text as replied,
          COUNT(CASE WHEN se.status = 'booked' THEN 1 END)::text as booked
        FROM crm.sequences s
        JOIN crm.sequence_enrollments se ON se.sequence_id = s.sequence_id
        WHERE se.started_at >= NOW() - INTERVAL '14 days'
          AND s.org_id = $1
        GROUP BY s.name
      `, [orgId]),
    ]);

    // Compare to previous 14 days for trends (org-scoped)
    const [prevEmails, prevCalls] = await Promise.all([
      query<{ sent: string; replied: string }>(`
        SELECT
          COUNT(CASE WHEN event_type = 'sent' THEN 1 END)::text as sent,
          COUNT(CASE WHEN event_type IN ('replied','reply_received') THEN 1 END)::text as replied
        FROM crm.touchpoints
        WHERE channel = 'email'
          AND occurred_at >= NOW() - INTERVAL '28 days'
          AND occurred_at < NOW() - INTERVAL '14 days'
          AND org_id = $1
      `, [orgId]),
      query<{ total: string; connected: string }>(`
        SELECT
          COUNT(*)::text as total,
          COUNT(CASE WHEN disposition = 'connected' THEN 1 END)::text as connected
        FROM crm.phone_calls
        WHERE started_at >= NOW() - INTERVAL '28 days'
          AND started_at < NOW() - INTERVAL '14 days'
          AND org_id = $1
      `, [orgId]),
    ]);

    const performanceData = {
      current_period: 'Last 14 days',
      email: emailMetrics[0],
      calls: callMetrics[0],
      reply_sentiment: replyData,
      angle_performance: anglePerf,
      pipeline_movement: pipelineChanges,
      task_completion: taskCompletion[0],
      sequence_performance: sequencePerf,
      previous_period: {
        email: prevEmails[0],
        calls: prevCalls[0],
      },
    };

    const config = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
    const repName = config.persona?.sender_name || 'the sales rep';
    const companyDesc = config.company_name || 'SaaS';

    const sanitizedRepName = sanitizeInput(repName);
    const sanitizedCompanyDesc = sanitizeInput(companyDesc);

    const coachingSystemPrompt = armorSystemPrompt(
      `You are an expert B2B sales coach. Analyze performance data and provide SPECIFIC, ACTIONABLE coaching. No generic tips — reference the actual numbers. Return valid JSON only.`
    );

    const message = await client.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      system: coachingSystemPrompt,
      messages: [{
        role: 'user',
        content: `Analyze this 14-day performance data for ${sanitizedRepName} at ${sanitizedCompanyDesc} and provide SPECIFIC, ACTIONABLE coaching.

${wrapUserData('performance_data', JSON.stringify(performanceData, null, 2))}

Provide your coaching in this JSON format:
{
  "overall_grade": "A/B/C/D/F",
  "headline": "One sentence summary of performance",
  "insights": [
    {
      "type": "strength|weakness|opportunity|trend",
      "icon": "trophy|alert|lightbulb|trending",
      "title": "Short title",
      "detail": "2-3 sentence specific insight with numbers",
      "action": "One specific action to take"
    }
  ],
  "top_priority": "The single most important thing to focus on today",
  "angle_recommendation": "Which email angle to use more/less and why"
}

Return 4-6 insights. Be direct, data-driven, and specific to ${sanitizedRepName}'s actual numbers.`,
      }],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const coaching = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Failed to parse coaching' };

    trackUsage(tenant.org_id, 'ai_generations');

    return NextResponse.json({ coaching, performanceData });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[ai-coach] error:', error);
    return NextResponse.json({ error: 'Failed to generate coaching' }, { status: 500 });
  }
}
