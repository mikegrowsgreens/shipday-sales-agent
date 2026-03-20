import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { getOrgPlan, requireFeature } from '@/lib/feature-gate';

/**
 * GET /api/leads/warm
 *
 * Returns warm leads prioritized by cross-touchpoint engagement scoring.
 * Aggregates signals from emails, chatbot, voice agent, and CRM touchpoints
 * to surface the hottest leads for immediate follow-up.
 *
 * Query params:
 * - limit: max results (default 20)
 * - min_score: minimum warmth score (default 10)
 * - channel: filter by recommended action (ai_call, human_call, ai_chat, email_followup)
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const plan = await getOrgPlan(tenant.org_id);
    requireFeature(plan, 'campaigns');

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20'), 100);
    const minScore = parseFloat(request.nextUrl.searchParams.get('min_score') || '10');
    const channelFilter = request.nextUrl.searchParams.get('channel');

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 1: Aggregate engagement signals across all channels
    // ═══════════════════════════════════════════════════════════════════════

    const warmLeads = await query<{
      lead_id: number;
      contact_name: string | null;
      contact_email: string | null;
      business_name: string | null;
      phone: string | null;
      tier: string | null;
      total_score: number | null;
      status: string;
      // Email signals
      email_sends: number;
      email_opens: number;
      email_clicks: number;
      email_replies: number;
      last_email_open: string | null;
      last_email_click: string | null;
      reply_sentiment: string | null;
      // Chat signals
      chat_sessions: number;
      chat_qualified: boolean;
      chat_demo_booked: boolean;
      last_chat_at: string | null;
      // Voice signals
      voice_calls: number;
      voice_qualified: boolean;
      last_voice_at: string | null;
      // CRM contact
      contact_id: number | null;
    }>(`
      WITH email_signals AS (
        SELECT
          es.lead_id,
          COUNT(*)::int as email_sends,
          COALESCE(SUM(es.open_count), 0)::int as email_opens,
          COALESCE(SUM(es.click_count), 0)::int as email_clicks,
          COUNT(CASE WHEN es.replied THEN 1 END)::int as email_replies,
          MAX(CASE WHEN es.open_count > 0 THEN es.sent_at END) as last_email_open,
          MAX(CASE WHEN es.click_count > 0 THEN es.sent_at END) as last_email_click
        FROM bdr.email_sends es
        WHERE es.sent_at IS NOT NULL AND es.sent_at >= NOW() - INTERVAL '30 days'
        GROUP BY es.lead_id
      ),
      chat_signals AS (
        SELECT
          (co.qualification_slots->>'email') as email,
          COUNT(*)::int as chat_sessions,
          BOOL_OR(co.demo_booked) as chat_demo_booked,
          BOOL_OR(co.qualification_completeness >= 0.6) as chat_qualified,
          MAX(co.started_at) as last_chat_at
        FROM brain.conversation_outcomes co
        WHERE co.org_id = $1 AND co.started_at >= NOW() - INTERVAL '30 days'
        GROUP BY co.qualification_slots->>'email'
      ),
      voice_signals AS (
        SELECT
          vac.contact_id,
          COUNT(*)::int as voice_calls,
          BOOL_OR(vac.final_stage IN ('commitment', 'close', 'handoff')) as voice_qualified,
          MAX(vac.started_at) as last_voice_at
        FROM voice.agent_calls vac
        WHERE vac.org_id = $1 AND vac.started_at >= NOW() - INTERVAL '30 days'
        GROUP BY vac.contact_id
      )
      SELECT
        l.lead_id,
        l.contact_name,
        l.contact_email,
        l.business_name,
        l.phone,
        l.tier,
        l.total_score,
        l.status,
        l.reply_sentiment,
        COALESCE(esig.email_sends, 0) as email_sends,
        COALESCE(esig.email_opens, 0) as email_opens,
        COALESCE(esig.email_clicks, 0) as email_clicks,
        COALESCE(esig.email_replies, 0) as email_replies,
        esig.last_email_open,
        esig.last_email_click,
        COALESCE(csig.chat_sessions, 0) as chat_sessions,
        COALESCE(csig.chat_qualified, false) as chat_qualified,
        COALESCE(csig.chat_demo_booked, false) as chat_demo_booked,
        csig.last_chat_at,
        COALESCE(vsig.voice_calls, 0) as voice_calls,
        COALESCE(vsig.voice_qualified, false) as voice_qualified,
        vsig.last_voice_at,
        c.contact_id
      FROM bdr.leads l
      LEFT JOIN email_signals esig ON esig.lead_id = l.lead_id
      LEFT JOIN chat_signals csig ON csig.email = l.contact_email
      LEFT JOIN crm.contacts c ON c.bdr_lead_id = l.lead_id::text
      LEFT JOIN voice_signals vsig ON vsig.contact_id = c.contact_id
      WHERE l.org_id = $1
        AND l.status NOT IN ('won', 'lost', 'rejected', 'bounced')
        AND (
          COALESCE(esig.email_opens, 0) > 0
          OR COALESCE(esig.email_clicks, 0) > 0
          OR COALESCE(esig.email_replies, 0) > 0
          OR COALESCE(csig.chat_sessions, 0) > 0
          OR COALESCE(vsig.voice_calls, 0) > 0
        )
      ORDER BY
        -- Prioritize: replies > clicks > chat > voice > multi-open
        COALESCE(esig.email_replies, 0) * 50 +
        COALESCE(esig.email_clicks, 0) * 30 +
        COALESCE(csig.chat_sessions, 0) * 25 +
        COALESCE(vsig.voice_calls, 0) * 20 +
        CASE WHEN csig.chat_qualified THEN 40 ELSE 0 END +
        CASE WHEN csig.chat_demo_booked THEN 60 ELSE 0 END +
        CASE WHEN vsig.voice_qualified THEN 40 ELSE 0 END +
        CASE WHEN esig.email_opens >= 3 THEN 15 ELSE COALESCE(esig.email_opens, 0) * 3 END
        DESC
      LIMIT $2
    `, [tenant.org_id, limit * 2]); // Fetch extra for post-filtering

    // ═══════════════════════════════════════════════════════════════════════
    // STEP 2: Compute warmth scores and recommended actions
    // ═══════════════════════════════════════════════════════════════════════

    const scoredLeads = warmLeads.map(lead => {
      const signals: Array<{ signal_type: string; count: number; last_at: string; weight: number }> = [];
      let warmthScore = 0;

      // Email signals
      if (lead.email_opens > 0) {
        const weight = lead.email_opens >= 3 ? 15 : lead.email_opens * 3;
        signals.push({ signal_type: 'email_opened', count: lead.email_opens, last_at: lead.last_email_open || '', weight });
        warmthScore += weight;
      }
      if (lead.email_clicks > 0) {
        signals.push({ signal_type: 'email_clicked', count: lead.email_clicks, last_at: lead.last_email_click || '', weight: 30 });
        warmthScore += 30;
      }
      if (lead.email_replies > 0) {
        const weight = lead.reply_sentiment === 'positive' ? 50 : 25;
        signals.push({ signal_type: 'email_replied', count: lead.email_replies, last_at: '', weight });
        warmthScore += weight;
      }

      // Chat signals
      if (lead.chat_sessions > 0) {
        signals.push({ signal_type: 'chat_started', count: lead.chat_sessions, last_at: lead.last_chat_at || '', weight: 25 });
        warmthScore += 25;
      }
      if (lead.chat_qualified) {
        signals.push({ signal_type: 'chat_qualified', count: 1, last_at: lead.last_chat_at || '', weight: 40 });
        warmthScore += 40;
      }
      if (lead.chat_demo_booked) {
        signals.push({ signal_type: 'chat_demo_booked', count: 1, last_at: lead.last_chat_at || '', weight: 60 });
        warmthScore += 60;
      }

      // Voice signals
      if (lead.voice_calls > 0) {
        signals.push({ signal_type: 'voice_completed', count: lead.voice_calls, last_at: lead.last_voice_at || '', weight: 20 });
        warmthScore += 20;
      }
      if (lead.voice_qualified) {
        signals.push({ signal_type: 'voice_qualified', count: 1, last_at: lead.last_voice_at || '', weight: 40 });
        warmthScore += 40;
      }

      // Determine recommended action
      let recommendedAction: 'ai_call' | 'human_call' | 'ai_chat' | 'email_followup' = 'email_followup';
      if (lead.chat_qualified || lead.voice_qualified || lead.chat_demo_booked) {
        recommendedAction = 'human_call';
      } else if (lead.email_replies > 0 && lead.reply_sentiment === 'positive') {
        recommendedAction = lead.phone ? 'ai_call' : 'ai_chat';
      } else if (lead.email_clicks > 0 || lead.email_opens >= 3) {
        recommendedAction = 'ai_chat';
      }

      // Most recent activity timestamp
      const activityDates = [
        lead.last_email_open,
        lead.last_email_click,
        lead.last_chat_at,
        lead.last_voice_at,
      ].filter(Boolean) as string[];
      const lastActivityAt = activityDates.length > 0
        ? activityDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
        : '';

      return {
        lead_id: lead.lead_id,
        contact_id: lead.contact_id,
        business_name: lead.business_name,
        contact_name: lead.contact_name,
        contact_email: lead.contact_email,
        phone: lead.phone,
        tier: lead.tier,
        status: lead.status,
        warmth_score: warmthScore,
        warmth_signals: signals,
        last_activity_at: lastActivityAt,
        recommended_action: recommendedAction,
        qualification_data: {},
      };
    });

    // Filter by minimum score and optional channel
    let filtered = scoredLeads.filter(l => l.warmth_score >= minScore);
    if (channelFilter) {
      filtered = filtered.filter(l => l.recommended_action === channelFilter);
    }
    filtered = filtered.slice(0, limit);

    return NextResponse.json({
      warm_leads: filtered,
      total: filtered.length,
      filters: { min_score: minScore, channel: channelFilter, limit },
    });
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as unknown as { code: string }).code === 'PLAN_UPGRADE_REQUIRED') {
      return NextResponse.json({ error: error.message, code: 'PLAN_UPGRADE_REQUIRED' }, { status: 403 });
    }
    console.error('[leads/warm] error:', error);
    return NextResponse.json({ error: 'Failed to fetch warm leads' }, { status: 500 });
  }
}
