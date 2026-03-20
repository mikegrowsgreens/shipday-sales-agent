/**
 * GET /api/scheduling/public/org?slug=xxx
 *
 * Public endpoint that returns org branding + active event types for the booking page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'Missing slug parameter' }, { status: 400 });
  }

  const org = await queryOne<{
    org_id: number;
    org_name: string;
    settings: Record<string, unknown>;
  }>(
    `SELECT org_id, name as org_name, settings FROM crm.organizations WHERE slug = $1`,
    [slug],
  );

  if (!org) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const branding = (org.settings?.branding || {}) as Record<string, string>;

  // Fetch active event types
  const eventTypes = await query<{
    event_type_id: number;
    name: string;
    slug: string;
    description: string | null;
    duration_minutes: number;
    color: string;
    location_type: string;
  }>(
    `SELECT event_type_id, name, slug, description, duration_minutes, color, location_type
     FROM crm.scheduling_event_types
     WHERE org_id = $1 AND is_active = true
     ORDER BY name`,
    [org.org_id],
  );

  return NextResponse.json({
    org_name: org.org_name,
    logo_url: branding.logo_url || null,
    primary_color: branding.primary_color || '#2563eb',
    app_name: branding.app_name || org.org_name,
    event_types: eventTypes,
  });
}
