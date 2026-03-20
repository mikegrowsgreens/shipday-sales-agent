/**
 * GET /api/admin/integration-health
 *
 * Comprehensive health check for all SalesHub integrations.
 * Returns status for: Google Calendar, Gmail/n8n, Fathom, Twilio,
 * email tracking, databases, and sequencing systems.
 *
 * Auth: session (super admin) OR x-webhook-key (n8n monitoring)
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { queryDeals } from '@/lib/db';
import { N8N_WEBHOOK_KEY, N8N_BASE_URL, TRACKING_BASE_URL, TRACKING_HMAC_SECRET, TWILIO_AUTH_TOKEN } from '@/lib/config';
import { getFreeBusy } from '@/lib/google-calendar';
import type { CalendarConnection } from '@/lib/types';

type HealthStatus = 'healthy' | 'warning' | 'error' | 'unconfigured';

interface CheckResult {
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
}

async function checkGoogleCalendar(): Promise<CheckResult> {
  try {
    const connection = await queryOne<CalendarConnection>(
      `SELECT * FROM crm.calendar_connections
       WHERE provider = 'google' AND is_active = true
       ORDER BY updated_at DESC LIMIT 1`
    );

    if (!connection) {
      return { status: 'error', message: 'No active Google Calendar connection found' };
    }

    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const now = new Date();

    if (!expiresAt) {
      return { status: 'error', message: 'Token has no expiry date', details: { account_email: connection.account_email } };
    }

    if (expiresAt < now) {
      return {
        status: 'error',
        message: 'Token expired -- needs re-authentication',
        details: { account_email: connection.account_email, expired_at: expiresAt.toISOString() },
      };
    }

    const expiresInHours = (expiresAt.getTime() - now.getTime()) / 3600000;

    // Test FreeBusy API
    try {
      const oneHourLater = new Date(now.getTime() + 3600000);
      await getFreeBusy(connection, now.toISOString(), oneHourLater.toISOString());
    } catch (err) {
      return {
        status: 'error',
        message: `FreeBusy API failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
        details: { account_email: connection.account_email, token_expires_in_hours: Math.round(expiresInHours) },
      };
    }

    if (expiresInHours < 24) {
      return {
        status: 'warning',
        message: `Token expires in ${Math.round(expiresInHours)} hours`,
        details: { account_email: connection.account_email, expires_at: expiresAt.toISOString() },
      };
    }

    return {
      status: 'healthy',
      message: `Connected as ${connection.account_email}`,
      details: { account_email: connection.account_email, token_expires_in_hours: Math.round(expiresInHours) },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Check failed' };
  }
}

async function checkGmailSync(): Promise<CheckResult> {
  try {
    const latestSync = await queryOne<{ latest_date: string; total_emails: string }>(
      `SELECT MAX(date)::text as latest_date, COUNT(*)::text as total_emails
       FROM crm.customer_emails`
    );

    if (!latestSync?.latest_date) {
      return { status: 'error', message: 'No emails synced -- Gmail sync workflow may be missing' };
    }

    const lastSyncDate = new Date(latestSync.latest_date);
    const hoursSinceSync = (Date.now() - lastSyncDate.getTime()) / 3600000;

    if (hoursSinceSync > 24) {
      return {
        status: 'error',
        message: `Last email synced ${Math.round(hoursSinceSync)} hours ago`,
        details: { last_sync: lastSyncDate.toISOString(), total_emails: parseInt(latestSync.total_emails) },
      };
    }

    if (hoursSinceSync > 1) {
      return {
        status: 'warning',
        message: `Last email synced ${Math.round(hoursSinceSync * 60)} minutes ago`,
        details: { last_sync: lastSyncDate.toISOString(), total_emails: parseInt(latestSync.total_emails) },
      };
    }

    return {
      status: 'healthy',
      message: `${latestSync.total_emails} emails synced, last ${Math.round(hoursSinceSync * 60)} min ago`,
      details: { last_sync: lastSyncDate.toISOString(), total_emails: parseInt(latestSync.total_emails) },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Check failed' };
  }
}

async function checkFathom(): Promise<CheckResult> {
  try {
    const hasKey = !!(process.env.FATHOM_API_KEY);
    const orgKeys = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM crm.organizations ORDER BY org_id LIMIT 1`
    );
    const orgFathomKeys = (orgKeys?.settings?.fathom_api_keys as string[]) || [];
    const hasOrgKeys = orgFathomKeys.length > 0;

    if (!hasKey && !hasOrgKeys) {
      return { status: 'unconfigured', message: 'No Fathom API keys configured' };
    }

    const latestCall = await queryOne<{ call_date: string; total_calls: string }>(
      `SELECT MAX(call_date)::text as call_date, COUNT(*)::text as total_calls
       FROM public.calls`
    );

    if (!latestCall?.call_date) {
      return { status: 'error', message: 'No calls synced from Fathom' };
    }

    const lastCallDate = new Date(latestCall.call_date);
    const daysSinceCall = (Date.now() - lastCallDate.getTime()) / 86400000;

    if (daysSinceCall > 7) {
      return {
        status: 'warning',
        message: `Last call synced ${Math.round(daysSinceCall)} days ago`,
        details: { last_call: lastCallDate.toISOString(), total_calls: parseInt(latestCall.total_calls), api_keys_configured: hasOrgKeys ? orgFathomKeys.length : (hasKey ? 1 : 0) },
      };
    }

    return {
      status: 'healthy',
      message: `${latestCall.total_calls} calls synced, last ${Math.round(daysSinceCall)} days ago`,
      details: { last_call: lastCallDate.toISOString(), total_calls: parseInt(latestCall.total_calls) },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Check failed' };
  }
}

async function checkEmailTracking(): Promise<CheckResult> {
  const issues: string[] = [];

  if (!TRACKING_BASE_URL) issues.push('TRACKING_BASE_URL not set');
  if (TRACKING_HMAC_SECRET === 'dev-tracking-hmac-secret') issues.push('TRACKING_HMAC_SECRET using default dev value');

  if (issues.length > 0) {
    return { status: 'error', message: issues.join('; '), details: { tracking_base_url: TRACKING_BASE_URL || '(empty)' } };
  }

  try {
    // Check for recent tracking events
    const recentEvents = await queryOne<{ opens: string; clicks: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE event_type = 'open')::text as opens,
         COUNT(*) FILTER (WHERE event_type = 'click')::text as clicks
       FROM bdr.email_events
       WHERE created_at > NOW() - interval '24 hours'`
    );

    return {
      status: 'healthy',
      message: `Last 24h: ${recentEvents?.opens || 0} opens, ${recentEvents?.clicks || 0} clicks`,
      details: {
        tracking_base_url: TRACKING_BASE_URL,
        opens_24h: parseInt(recentEvents?.opens || '0'),
        clicks_24h: parseInt(recentEvents?.clicks || '0'),
      },
    };
  } catch {
    // email_events table may not exist yet
    return {
      status: 'warning',
      message: 'Tracking configured but could not query events',
      details: { tracking_base_url: TRACKING_BASE_URL },
    };
  }
}

async function checkSequences(): Promise<CheckResult> {
  try {
    const stats = await queryOne<{
      active: string;
      stuck: string;
      total_enrollments: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::text as active,
         COUNT(*) FILTER (WHERE status = 'active' AND next_step_at < NOW() - interval '2 hours')::text as stuck,
         COUNT(*)::text as total_enrollments
       FROM crm.sequence_enrollments`
    );

    const stuck = parseInt(stats?.stuck || '0');
    const active = parseInt(stats?.active || '0');

    if (stuck > 0) {
      return {
        status: 'warning',
        message: `${stuck} enrollments stuck (overdue >2h)`,
        details: { active, stuck, total: parseInt(stats?.total_enrollments || '0') },
      };
    }

    return {
      status: 'healthy',
      message: `${active} active enrollments, none stuck`,
      details: { active, stuck: 0, total: parseInt(stats?.total_enrollments || '0') },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Check failed' };
  }
}

async function checkCampaigns(): Promise<CheckResult> {
  try {
    const stats = await queryOne<{
      overdue: string;
      scheduled: string;
      sent_24h: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'scheduled' AND scheduled_at < NOW() - interval '1 hour')::text as overdue,
         COUNT(*) FILTER (WHERE status = 'scheduled')::text as scheduled,
         COUNT(*) FILTER (WHERE status = 'sent' AND sent_at > NOW() - interval '24 hours')::text as sent_24h
       FROM bdr.campaign_emails`
    );

    const overdue = parseInt(stats?.overdue || '0');

    if (overdue > 0) {
      return {
        status: 'warning',
        message: `${overdue} campaign emails overdue (>1h past scheduled time)`,
        details: { overdue, scheduled: parseInt(stats?.scheduled || '0'), sent_24h: parseInt(stats?.sent_24h || '0') },
      };
    }

    return {
      status: 'healthy',
      message: `${stats?.sent_24h || 0} emails sent in last 24h`,
      details: { overdue: 0, scheduled: parseInt(stats?.scheduled || '0'), sent_24h: parseInt(stats?.sent_24h || '0') },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Check failed' };
  }
}

async function checkDatabases(): Promise<CheckResult> {
  try {
    // Test wincall_brain pool
    await queryOne(`SELECT 1 as ok`);

    // Test defaultdb pool
    await queryDeals(`SELECT 1 as ok`);

    return { status: 'healthy', message: 'Both database pools responsive' };
  } catch (err) {
    return { status: 'error', message: `Database connection failed: ${err instanceof Error ? err.message : 'Unknown'}` };
  }
}

async function checkN8n(): Promise<CheckResult> {
  if (!N8N_BASE_URL) {
    return { status: 'unconfigured', message: 'N8N_BASE_URL not set' };
  }

  try {
    const res = await fetch(`${N8N_BASE_URL}/healthz`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      return { status: 'healthy', message: `n8n reachable at ${N8N_BASE_URL}` };
    }
    return { status: 'warning', message: `n8n returned ${res.status}`, details: { url: N8N_BASE_URL } };
  } catch {
    return { status: 'error', message: `Cannot reach n8n at ${N8N_BASE_URL}` };
  }
}

async function checkFollowups(): Promise<CheckResult> {
  try {
    const stats = await queryDeals<{ total: string; pending: string; sent: string }>(
      `SELECT
         COUNT(*)::text as total,
         COUNT(*) FILTER (WHERE status IN ('draft', 'approved'))::text as pending,
         COUNT(*) FILTER (WHERE status = 'sent')::text as sent
       FROM deals.email_drafts`
    );

    const row = stats[0];

    return {
      status: 'healthy',
      message: `${row?.sent || 0} sent, ${row?.pending || 0} pending`,
      details: { total: parseInt(row?.total || '0'), pending: parseInt(row?.pending || '0'), sent: parseInt(row?.sent || '0') },
    };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Check failed' };
  }
}

export async function GET(request: NextRequest) {
  // Allow both admin session and webhook key auth (for n8n monitoring)
  const webhookKey = request.headers.get('x-webhook-key');
  if (webhookKey !== N8N_WEBHOOK_KEY) {
    // Try session auth
    try {
      const { requireSuperAdmin } = await import('@/lib/require-super-admin');
      await requireSuperAdmin();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Run all checks in parallel
  const [
    googleCalendar,
    gmailSync,
    fathom,
    emailTracking,
    sequences,
    campaigns,
    databases,
    n8n,
    followups,
  ] = await Promise.all([
    checkGoogleCalendar(),
    checkGmailSync(),
    checkFathom(),
    checkEmailTracking(),
    checkSequences(),
    checkCampaigns(),
    checkDatabases(),
    checkN8n(),
    checkFollowups(),
  ]);

  const checks = {
    google_calendar: googleCalendar,
    gmail_sync: gmailSync,
    fathom,
    email_tracking: emailTracking,
    sequences,
    campaigns,
    databases,
    n8n,
    followups,
  };

  // Overall status: worst of all checks
  const statuses = Object.values(checks).map(c => c.status);
  let overall: HealthStatus = 'healthy';
  if (statuses.includes('error')) overall = 'error';
  else if (statuses.includes('warning')) overall = 'warning';
  else if (statuses.includes('unconfigured')) overall = 'warning';

  const env_summary = {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || '(using default)',
    FATHOM_API_KEY: !!process.env.FATHOM_API_KEY,
    TWILIO_AUTH_TOKEN: !!TWILIO_AUTH_TOKEN,
    N8N_BASE_URL: N8N_BASE_URL || '(empty)',
    TRACKING_BASE_URL: TRACKING_BASE_URL || '(empty)',
    TRACKING_HMAC_SECRET: TRACKING_HMAC_SECRET !== 'dev-tracking-hmac-secret',
  };

  return NextResponse.json({
    status: overall,
    checked_at: new Date().toISOString(),
    checks,
    env_summary,
  });
}
