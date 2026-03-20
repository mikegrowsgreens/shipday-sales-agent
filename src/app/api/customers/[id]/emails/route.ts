import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { CustomerEmail } from '@/lib/types';
import { withAuth } from '@/lib/route-auth';

// GET /api/customers/[id]/emails - Get email history with thread grouping
export const GET = withAuth(async (request, { orgId, params }) => {
  try {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: 'Missing customer id' }, { status: 400 });

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const threadId = url.searchParams.get('thread_id');

    // Get emails
    let emails: CustomerEmail[];
    if (threadId) {
      emails = await query<CustomerEmail>(
        `SELECT * FROM crm.customer_emails
         WHERE customer_id = $1 AND org_id = $2 AND gmail_thread_id = $3
         ORDER BY date ASC`,
        [id, orgId, threadId]
      );
    } else {
      emails = await query<CustomerEmail>(
        `SELECT * FROM crm.customer_emails
         WHERE customer_id = $1 AND org_id = $2
         ORDER BY date DESC NULLS LAST
         LIMIT $3 OFFSET $4`,
        [id, orgId, limit, offset]
      );
    }

    // Get thread summaries
    const threads = await query<{
      thread_id: string;
      subject: string;
      message_count: string;
      latest_date: string;
      earliest_date: string;
      participants: string;
    }>(
      `SELECT
         gmail_thread_id as thread_id,
         (SELECT subject FROM crm.customer_emails ce2
          WHERE ce2.gmail_thread_id = ce.gmail_thread_id AND ce2.org_id = $2
          ORDER BY date ASC NULLS LAST LIMIT 1) as subject,
         COUNT(*)::text as message_count,
         MAX(date)::text as latest_date,
         MIN(date)::text as earliest_date,
         STRING_AGG(DISTINCT COALESCE(from_email, ''), ', ') as participants
       FROM crm.customer_emails ce
       WHERE customer_id = $1 AND org_id = $2 AND gmail_thread_id IS NOT NULL
       GROUP BY gmail_thread_id
       ORDER BY MAX(date) DESC NULLS LAST`,
      [id, orgId]
    );

    // Total count
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM crm.customer_emails
       WHERE customer_id = $1 AND org_id = $2`,
      [id, orgId]
    );

    return NextResponse.json({
      emails,
      threads: threads.map(t => ({
        thread_id: t.thread_id,
        subject: t.subject,
        message_count: parseInt(t.message_count),
        latest_date: t.latest_date,
        earliest_date: t.earliest_date,
        participants: t.participants.split(', ').filter(Boolean),
      })),
      total: parseInt(countResult?.count || '0'),
    });
  } catch (error) {
    console.error('[customers/emails] GET error:', error);
    return NextResponse.json({ error: 'Failed to load emails' }, { status: 500 });
  }
});
