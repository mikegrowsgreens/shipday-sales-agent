import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getOrgConfig } from '@/lib/org-config';
import { apiLimiter, checkRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/widget/config?slug=<org_slug>
 * Public endpoint — returns org-specific widget branding for the embeddable chat widget.
 * No auth required (widget runs on third-party pages).
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const rateLimitResponse = await checkRateLimit(apiLimiter, ip);
  if (rateLimitResponse) return rateLimitResponse;

  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug parameter is required' }, { status: 400 });
  }

  try {
    // Resolve org from slug
    const org = await query<{ org_id: number; name: string }>(
      `SELECT org_id, name FROM crm.organizations WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
      [slug]
    );

    if (org.length === 0) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const orgId = org[0].org_id;
    const config = await getOrgConfig(orgId);

    // Only return what the widget needs — no sensitive config
    const widgetConfig = {
      org_slug: slug,
      company_name: config.company_name,
      product_name: config.product_name,
      persona_name: config.persona.sender_name,
      primary_color: config.branding.primary_color,
      logo_url: config.branding.logo_url,
      greeting: `Hey! I can help you figure out what ${config.company_name} could save your business on delivery. Ask me anything.`,
      calendly_url: config.persona.calendly_url || '',
      chat_enabled: config.features.prospect_chat,
    };

    // Cache for 5 minutes — config doesn't change often
    return NextResponse.json(widgetConfig, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('[widget/config] error:', error);
    return NextResponse.json({ error: 'Failed to load widget config' }, { status: 500 });
  }
}

/**
 * OPTIONS — CORS preflight for cross-origin widget requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
