import { NextRequest, NextResponse } from 'next/server';
import { query, queryDeals } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/dashboard?range=7d|14d|30d|90d|all|custom&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns all dashboard data scoped by date range.
 *
 * DATA SOURCES:
 * - CRM email stats: crm.touchpoints (sequence-driven emails)
 * - BDR email stats: bdr.email_sends (cold outreach emails) — per-send rows with sent_at
 * - "Email Performance" section merges both sources for a unified view
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;
    const range = request.nextUrl.searchParams.get('range') || '30d';
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');

    // Build date filter
    const daysMap: Record<string, number> = {
      today: 1,
      '7d': 7,
      '14d': 14,
      '30d': 30,
      '90d': 90,
    };

    // Parameterized date filter builder
    // startParam is the next available $N index (orgId is always $1)
    type DateFilter = { filter: string; params: unknown[] };

    function buildDateFilter(col: string, startParam = 2): DateFilter {
      if (range === 'custom' && from) {
        if (to) {
          return {
            filter: `AND ${col} >= $${startParam}::date AND ${col} <= $${startParam + 1}::date + INTERVAL '1 day'`,
            params: [from, to],
          };
        }
        return { filter: `AND ${col} >= $${startParam}::date`, params: [from] };
      }
      if (range !== 'all' && daysMap[range]) {
        return {
          filter: `AND ${col} > NOW() - INTERVAL '1 day' * $${startParam}`,
          params: [daysMap[range]],
        };
      }
      return { filter: '', params: [] };
    }

    // CRM stats (contacts, sequences, tasks — always all-time)
    const stageRows = await query<{ lifecycle_stage: string; count: string }>(
      `SELECT lifecycle_stage, COUNT(*)::text as count FROM crm.contacts WHERE org_id = $1 GROUP BY lifecycle_stage`,
      [orgId]
    );
    const contacts_by_stage: Record<string, number> = {};
    let total_contacts = 0;
    for (const row of stageRows) {
      const c = parseInt(row.count);
      contacts_by_stage[row.lifecycle_stage] = c;
      total_contacts += c;
    }

    const seqRow = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM crm.sequence_enrollments WHERE org_id = $1 AND status = 'active'`,
      [orgId]
    );
    const active_sequences = parseInt(seqRow[0]?.count || '0');

    const taskRow = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM crm.task_queue WHERE org_id = $1 AND status IN ('pending','in_progress')`,
      [orgId]
    );
    const pending_tasks = parseInt(taskRow[0]?.count || '0');

    // ═══════════════════════════════════════════════════════════════════════════
    // UNIFIED EMAIL PERFORMANCE
    // ═══════════════════════════════════════════════════════════════════════════

    const crmDF = buildDateFilter('occurred_at');
    const bdrDF = buildDateFilter('sent_at');
    const demoDF = buildDateFilter('scheduled_at');

    // CRM sequence emails (from crm.touchpoints)
    const [crmSentRow, crmOpenRow, crmReplyRow] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM crm.touchpoints
         WHERE org_id = $1 AND channel = 'email' AND event_type = 'sent' ${crmDF.filter}`,
        [orgId, ...crmDF.params]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM crm.touchpoints
         WHERE org_id = $1 AND channel = 'email' AND event_type = 'opened' ${crmDF.filter}`,
        [orgId, ...crmDF.params]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text as count FROM crm.touchpoints
         WHERE org_id = $1 AND channel = 'email' AND event_type = 'replied' ${crmDF.filter}`,
        [orgId, ...crmDF.params]
      ),
    ]);

    // BDR cold outreach emails (from bdr.email_sends)
    const bdrEmailAgg = await query<{
      total_sends: string;
      total_opens: string;
      total_replied: string;
    }>(
      `SELECT
         COUNT(*)::text as total_sends,
         COALESCE(SUM(CASE WHEN open_count > 0 THEN open_count ELSE 0 END), 0)::text as total_opens,
         COUNT(*) FILTER (WHERE replied = true)::text as total_replied
       FROM bdr.email_sends
       WHERE org_id = $1 AND sent_at IS NOT NULL ${bdrDF.filter}`,
      [orgId, ...bdrDF.params]
    );
    const bdrEmailStats = bdrEmailAgg[0] || { total_sends: '0', total_opens: '0', total_replied: '0' };

    // Merge: total emails across both systems
    const crmSent = parseInt(crmSentRow[0]?.count || '0');
    const crmOpened = parseInt(crmOpenRow[0]?.count || '0');
    const crmReplied = parseInt(crmReplyRow[0]?.count || '0');
    const bdrSent = parseInt(bdrEmailStats.total_sends);
    const bdrOpened = parseInt(bdrEmailStats.total_opens);
    const bdrReplied = parseInt(bdrEmailStats.total_replied);

    const emails_sent = crmSent + bdrSent;
    const emails_opened = crmOpened + bdrOpened;
    const emails_replied = crmReplied + bdrReplied;
    const open_rate = emails_sent > 0 ? (emails_opened / emails_sent) * 100 : 0;
    const reply_rate = emails_sent > 0 ? (emails_replied / emails_sent) * 100 : 0;

    // Demos booked
    const demoRow = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM crm.calendly_events
       WHERE org_id = $1 AND cancelled = false ${demoDF.filter}`,
      [orgId, ...demoDF.params]
    );
    const demos_booked = parseInt(demoRow[0]?.count || '0');

    // Channel activity
    const channelDF = buildDateFilter('occurred_at');
    const channelRows = await query<{ channel: string; count: string }>(
      `SELECT channel, COUNT(*)::text as count FROM crm.touchpoints
       WHERE org_id = $1 ${channelDF.filter}
       GROUP BY channel`,
      [orgId, ...channelDF.params]
    );
    const touchpoints_by_channel: Record<string, number> = {};
    for (const row of channelRows) {
      touchpoints_by_channel[row.channel] = parseInt(row.count);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BDR OUTBOUND STATS
    // ═══════════════════════════════════════════════════════════════════════════

    const [totalLeadRow, readyRow, bdrDemoRow] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*)::text as count FROM bdr.leads WHERE org_id = $1`, [orgId]),
      query<{ count: string }>(`SELECT COUNT(*)::text as count FROM bdr.leads WHERE org_id = $1 AND status = 'email_ready'`, [orgId]),
      query<{ count: string }>(`SELECT COUNT(*)::text as count FROM bdr.leads WHERE org_id = $1 AND status = 'demo_booked'`, [orgId]),
    ]);

    // Date-scoped BDR email metrics from email_sends table
    const bdrScopeDF = buildDateFilter('sent_at');
    const bdrScopeAgg = await query<{
      total_sends: string;
      unique_sent: string;
      total_opens: string;
      unique_opened: string;
      unique_replied: string;
    }>(
      `SELECT
         COUNT(*)::text as total_sends,
         COUNT(DISTINCT lead_id)::text as unique_sent,
         COALESCE(SUM(CASE WHEN open_count > 0 THEN open_count ELSE 0 END), 0)::text as total_opens,
         COUNT(DISTINCT lead_id) FILTER (WHERE open_count > 0)::text as unique_opened,
         COUNT(DISTINCT lead_id) FILTER (WHERE replied = true)::text as unique_replied
       FROM bdr.email_sends
       WHERE org_id = $1 AND sent_at IS NOT NULL ${bdrScopeDF.filter}`,
      [orgId, ...bdrScopeDF.params]
    );
    const bdrStats = bdrScopeAgg[0] || {
      total_sends: '0', unique_sent: '0', total_opens: '0', unique_opened: '0', unique_replied: '0',
    };

    const bdrSentCount = parseInt(bdrStats.total_sends);
    const bdrUniqueSent = parseInt(bdrStats.unique_sent);
    const bdrTotalOpens = parseInt(bdrStats.total_opens);
    const bdrUniqueOpened = parseInt(bdrStats.unique_opened);
    const bdrUniqueReplied = parseInt(bdrStats.unique_replied);

    const bdr = {
      total_leads: parseInt(totalLeadRow[0]?.count || '0'),
      email_ready: parseInt(readyRow[0]?.count || '0'),
      sent: bdrSentCount,
      total_opens: bdrTotalOpens,
      open_rate: bdrUniqueSent > 0 ? (bdrUniqueOpened / bdrUniqueSent) * 100 : 0,
      reply_rate: bdrUniqueSent > 0 ? (bdrUniqueReplied / bdrUniqueSent) * 100 : 0,
      demo_opps: parseInt(bdrDemoRow[0]?.count || '0'),
    };

    // Post-demo stats
    const [pdDeals, pdDrafts, pdSent, pdReplied] = await Promise.all([
      queryDeals<{ count: string }>(`SELECT COUNT(*)::text as count FROM deals.deals WHERE org_id = $1 AND agent_status = 'active'`, [orgId]),
      queryDeals<{ count: string }>(`SELECT COUNT(*)::text as count FROM deals.email_drafts WHERE org_id = $1 AND status = 'draft'`, [orgId]),
      queryDeals<{ count: string }>(`SELECT COUNT(*)::text as count FROM deals.email_drafts WHERE org_id = $1 AND status = 'sent'`, [orgId]),
      queryDeals<{ count: string }>(`SELECT COUNT(*)::text as count FROM deals.email_drafts WHERE org_id = $1 AND status = 'sent' AND gmail_thread_id IS NOT NULL`, [orgId]),
    ]);
    const pdSentCount = parseInt(pdSent[0]?.count || '0');
    const postDemo = {
      active_deals: parseInt(pdDeals[0]?.count || '0'),
      drafts_pending: parseInt(pdDrafts[0]?.count || '0'),
      followups_sent: pdSentCount,
      response_rate: pdSentCount > 0 ? (parseInt(pdReplied[0]?.count || '0') / pdSentCount) * 100 : 0,
    };

    // Action items
    const [campaignsRow, tasksActRow, draftsActRow, callsRow] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*)::text as count FROM bdr.leads WHERE org_id = $1 AND status = 'email_ready'`, [orgId]),
      query<{ count: string }>(`SELECT COUNT(*)::text as count FROM crm.task_queue WHERE org_id = $1 AND status = 'pending'`, [orgId]),
      queryDeals<{ count: string }>(`SELECT COUNT(*)::text as count FROM deals.email_drafts WHERE org_id = $1 AND status = 'draft'`, [orgId]),
      query<{ count: string }>(`SELECT COUNT(*)::text as count FROM crm.task_queue WHERE org_id = $1 AND status = 'pending' AND task_type = 'call'`, [orgId]),
    ]);

    const actions: { label: string; count: number; href: string; color: string }[] = [];
    const campaignCount = parseInt(campaignsRow[0]?.count || '0');
    if (campaignCount > 0) actions.push({ label: 'campaigns to review', count: campaignCount, href: '/outbound', color: 'text-blue-400' });
    const taskCount = parseInt(tasksActRow[0]?.count || '0');
    if (taskCount > 0) actions.push({ label: 'pending tasks', count: taskCount, href: '/queue', color: 'text-yellow-400' });
    const draftCount = parseInt(draftsActRow[0]?.count || '0');
    if (draftCount > 0) actions.push({ label: 'follow-up drafts', count: draftCount, href: '/followups', color: 'text-purple-400' });
    const callCount = parseInt(callsRow[0]?.count || '0');
    if (callCount > 0) actions.push({ label: 'calls to make', count: callCount, href: '/queue', color: 'text-green-400' });

    // Recent replies (from bdr.email_sends — has per-send reply tracking)
    let replies: { lead_id: string; business_name: string; reply_snippet: string; replied_at: string; sentiment: string }[] = [];
    try {
      const replyRows = await query<{
        lead_id: string;
        business_name: string;
        subject: string;
        reply_at: string;
        reply_sentiment: string;
      }>(
        `SELECT es.lead_id, l.business_name,
                es.subject,
                es.reply_at::text as reply_at,
                COALESCE(es.reply_sentiment, 'neutral') as reply_sentiment
         FROM bdr.email_sends es
         JOIN bdr.leads l ON l.lead_id = es.lead_id
         WHERE es.org_id = $1 AND es.reply_at IS NOT NULL
         ORDER BY es.reply_at DESC LIMIT 5`,
        [orgId]
      );
      replies = replyRows.map(r => ({
        lead_id: r.lead_id,
        business_name: r.business_name || 'Unknown',
        reply_snippet: r.subject || '',
        replied_at: r.reply_at || '',
        sentiment: r.reply_sentiment || 'neutral',
      }));
    } catch { /* no replies yet */ }

    // Activity trend (daily touchpoints for selected range, max 30 days)
    let trendDays = 14;
    if (range === '7d') trendDays = 7;
    else if (range === '30d' || range === 'custom') trendDays = 30;
    else if (range === '90d') trendDays = 30;
    else if (range === 'all') trendDays = 30;

    let trend: { day: string; count: string }[] = [];
    try {
      trend = await query<{ day: string; count: string }>(
        `SELECT DATE(occurred_at) AS day, COUNT(*)::text AS count
         FROM crm.touchpoints
         WHERE org_id = $1 AND occurred_at >= NOW() - INTERVAL '1 day' * $2
         GROUP BY DATE(occurred_at)
         ORDER BY day ASC`,
        [orgId, trendDays]
      );
    } catch { /* no trend data */ }

    return NextResponse.json({
      crm: {
        total_contacts,
        active_sequences,
        pending_tasks,
        emails_sent,
        open_rate,
        reply_rate,
        demos_booked,
        contacts_by_stage,
        touchpoints_by_channel,
      },
      bdr,
      postDemo,
      actions,
      replies,
      trend,
      range,
    });
  } catch (error) {
    console.error('[api/dashboard] error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}
