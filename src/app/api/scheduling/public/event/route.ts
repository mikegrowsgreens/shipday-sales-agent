/**
 * GET /api/scheduling/public/event?org_slug=xxx&event_slug=yyy
 *
 * Public endpoint returning a single event type with org branding for the booking page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export async function GET(request: NextRequest) {
  const orgSlug = request.nextUrl.searchParams.get('org_slug');
  const eventSlug = request.nextUrl.searchParams.get('event_slug');

  if (!orgSlug || !eventSlug) {
    return NextResponse.json({ error: 'Missing org_slug or event_slug parameter' }, { status: 400 });
  }

  const result = await queryOne<{
    event_type_id: number;
    name: string;
    slug: string;
    description: string | null;
    duration_minutes: number;
    color: string;
    location_type: string;
    custom_questions: unknown;
    host_name: string;
    org_name: string;
    logo_url: string | null;
    primary_color: string;
    app_name: string;
  }>(
    `SELECT
       et.event_type_id,
       et.name,
       et.slug,
       et.description,
       et.duration_minutes,
       et.color,
       et.location_type,
       et.custom_questions,
       COALESCE(u.display_name, u.email) AS host_name,
       o.name AS org_name,
       COALESCE((o.settings->'branding'->>'logo_url'), '') AS logo_url,
       COALESCE((o.settings->'branding'->>'primary_color'), '#2563eb') AS primary_color,
       COALESCE((o.settings->'branding'->>'app_name'), o.name) AS app_name
     FROM crm.scheduling_event_types et
     JOIN crm.organizations o ON o.org_id = et.org_id
     JOIN crm.users u ON u.user_id = et.host_user_id
     WHERE o.slug = $1 AND et.slug = $2 AND et.is_active = true`,
    [orgSlug, eventSlug],
  );

  if (!result) {
    return NextResponse.json({ error: 'Event type not found' }, { status: 404 });
  }

  return NextResponse.json(result);
}
