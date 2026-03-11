import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/bdr/scraping
 * List scraping jobs with status and lead counts.
 */
export async function GET() {
  try {
    // Check if scraping_jobs table exists — if not, return empty
    const tableCheck = await query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'bdr' AND table_name = 'scraping_jobs'
      )`,
    );

    if (!tableCheck[0]?.exists) {
      return NextResponse.json({ jobs: [], message: 'Scraping not configured' });
    }

    const jobs = await query(
      `SELECT job_id, search_query, city, state, cuisine_type,
              status, leads_found, leads_new, started_at, completed_at,
              error_message, created_at
       FROM bdr.scraping_jobs
       ORDER BY created_at DESC
       LIMIT 50`,
    );

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('[bdr/scraping] error:', error);
    return NextResponse.json({ error: 'Failed to load scraping jobs' }, { status: 500 });
  }
}

/**
 * POST /api/bdr/scraping
 * Trigger a new scraping job via n8n webhook.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { search_query, city, state, cuisine_type, max_results } = body as {
      search_query?: string;
      city?: string;
      state?: string;
      cuisine_type?: string;
      max_results?: number;
    };

    if (!city && !search_query) {
      return NextResponse.json({ error: 'city or search_query required' }, { status: 400 });
    }

    const webhookUrl = `${process.env.N8N_BASE_URL || 'https://automation.mikegrowsgreens.com'}/webhook/bdr-scrape-trigger`;

    const payload = {
      search_query: search_query || `${cuisine_type || 'restaurant'} in ${city}, ${state}`,
      city,
      state,
      cuisine_type,
      max_results: max_results || 50,
      triggered_by: 'saleshub',
      triggered_at: new Date().toISOString(),
    };

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Webhook trigger failed', status: res.status }, { status: 502 });
    }

    return NextResponse.json({
      triggered: true,
      query: payload.search_query,
      message: 'Scraping job triggered — results will appear in the leads tab.',
    });
  } catch (error) {
    console.error('[bdr/scraping] trigger error:', error);
    return NextResponse.json({ error: 'Failed to trigger scraping' }, { status: 500 });
  }
}
