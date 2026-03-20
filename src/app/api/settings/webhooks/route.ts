import { NextRequest, NextResponse } from 'next/server';
import { queryOne, query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { isPrivateUrl } from '@/lib/ssrf';
import { webhookConfigSchema } from '@/lib/validators/settings';

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  type: 'inbound' | 'outbound';
  last_triggered?: string;
  status?: 'healthy' | 'degraded' | 'down' | 'unknown';
  last_checked?: string;
}

/**
 * GET /api/settings/webhooks
 * Returns all configured n8n webhooks with health status.
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const org = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM crm.organizations WHERE org_id = $1`,
      [orgId]
    );

    const integrations = (org?.settings as Record<string, unknown>)?.integrations as Record<string, unknown> || {};
    const webhooks: WebhookConfig[] = (integrations.n8n_webhooks as WebhookConfig[]) || [];

    return NextResponse.json({ webhooks });
  } catch (error) {
    console.error('[settings/webhooks] GET error:', error);
    return NextResponse.json({ error: 'Failed to load webhooks' }, { status: 500 });
  }
}

/**
 * POST /api/settings/webhooks
 * action: "test" — pings a webhook URL to check connectivity
 * action: "save" — saves webhook configurations
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    if (tenant.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const orgId = tenant.org_id;

    const body = await request.json();
    const parsed = webhookConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { action, url, webhooks } = parsed.data;

    if (action === 'test' && url) {
      // SSRF prevention: block private/internal URLs
      if (isPrivateUrl(url)) {
        return NextResponse.json({ error: 'URL targets a private or reserved address' }, { status: 400 });
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'manual', // Don't follow redirects to private IPs
        });
        clearTimeout(timeout);

        return NextResponse.json({
          status: res.ok ? 'healthy' : 'degraded',
          statusCode: res.status,
          latency_ms: 0, // could add timing
        });
      } catch {
        return NextResponse.json({ status: 'down', error: 'Connection failed or timed out' });
      }
    }

    if (action === 'save' && webhooks) {
      // Load current integrations, merge webhooks
      const org = await queryOne<{ settings: Record<string, unknown> }>(
        `SELECT settings FROM crm.organizations WHERE org_id = $1`,
        [orgId]
      );

      const currentIntegrations = (org?.settings as Record<string, unknown>)?.integrations || {};
      const updatedIntegrations = { ...currentIntegrations as Record<string, unknown>, n8n_webhooks: webhooks };

      await query(
        `UPDATE crm.organizations SET settings = settings || $1::jsonb, updated_at = NOW() WHERE org_id = $2`,
        [JSON.stringify({ integrations: updatedIntegrations }), orgId]
      );

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[settings/webhooks] POST error:', error);
    return NextResponse.json({ error: 'Failed to process webhook request' }, { status: 500 });
  }
}
