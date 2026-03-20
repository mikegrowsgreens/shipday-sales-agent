/**
 * Backfill crm.touchpoints from all event sources:
 * 1. bdr.email_sends (wincall_brain) - BDR email sends + opens + replies
 * 2. bdr.leads timestamps - demo bookings
 * 3. shipday.activity_log (defaultdb) - Post-demo email drafts/sends
 * 4. shipday.engagement_events (defaultdb) - Email opens/clicks
 * 5. public.calls (wincall_brain) - Fathom call recordings
 *
 * Run: npx tsx scripts/backfill-touchpoints.ts
 */

import { Pool } from 'pg';

const wincallPool = new Pool({
  connectionString: process.env.DATABASE_URL_WINCALL,
  ssl: { rejectUnauthorized: false },
});

const defaultdbPool = new Pool({
  connectionString: process.env.DATABASE_URL_DEFAULTDB,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log('=== CRM Touchpoint Backfill ===\n');
  let totalInserted = 0;

  // ──────────────────────────────────────────────────────────────────────
  // 1. BDR Email Sends → touchpoints (email sent, opened, replied)
  // ──────────────────────────────────────────────────────────────────────
  console.log('--- Phase 1: BDR Email Sends ---');
  const bdrSends = await wincallPool.query(`
    INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
    SELECT
      c.contact_id,
      'email',
      'sent',
      'outbound',
      'bdr',
      es.subject,
      jsonb_build_object('email_type', es.email_type, 'angle', es.angle, 'gmail_message_id', es.gmail_message_id),
      es.sent_at
    FROM bdr.email_sends es
    JOIN crm.contacts c ON LOWER(TRIM(c.email)) = LOWER(TRIM(es.to_email))
    WHERE es.sent_at IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
  console.log(`  Email sends: ${bdrSends.rowCount}`);
  totalInserted += bdrSends.rowCount || 0;

  // BDR opens (from email_sends.open_count > 0 with first_open_at)
  const bdrOpens = await wincallPool.query(`
    INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
    SELECT
      c.contact_id,
      'email',
      'opened',
      'inbound',
      'bdr',
      es.subject,
      jsonb_build_object('open_count', es.open_count),
      COALESCE(es.first_open_at, es.sent_at + interval '2 hours')
    FROM bdr.email_sends es
    JOIN crm.contacts c ON LOWER(TRIM(c.email)) = LOWER(TRIM(es.to_email))
    WHERE es.open_count > 0
    ON CONFLICT DO NOTHING
  `);
  console.log(`  Email opens: ${bdrOpens.rowCount}`);
  totalInserted += bdrOpens.rowCount || 0;

  // BDR replies
  const bdrReplies = await wincallPool.query(`
    INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
    SELECT
      c.contact_id,
      'email',
      'replied',
      'inbound',
      'bdr',
      es.subject,
      jsonb_build_object('reply_sentiment', es.reply_sentiment),
      COALESCE(es.reply_at, es.sent_at + interval '1 day')
    FROM bdr.email_sends es
    JOIN crm.contacts c ON LOWER(TRIM(c.email)) = LOWER(TRIM(es.to_email))
    WHERE es.replied = true
    ON CONFLICT DO NOTHING
  `);
  console.log(`  Email replies: ${bdrReplies.rowCount}`);
  totalInserted += bdrReplies.rowCount || 0;

  // ──────────────────────────────────────────────────────────────────────
  // 2. BDR Leads timestamps → touchpoints (demo bookings)
  // ──────────────────────────────────────────────────────────────────────
  console.log('\n--- Phase 2: BDR Demo Bookings ---');
  const bdrDemos = await wincallPool.query(`
    INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
    SELECT
      c.contact_id,
      'calendly',
      'booked',
      'inbound',
      'bdr',
      COALESCE(l.calendly_event_name, 'Demo Booked'),
      jsonb_build_object('demo_outcome', l.demo_outcome),
      l.demo_booked_at
    FROM bdr.leads l
    JOIN crm.contacts c ON c.bdr_lead_id = l.lead_id::text
    WHERE l.demo_booked_at IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
  console.log(`  Demo bookings: ${bdrDemos.rowCount}`);
  totalInserted += bdrDemos.rowCount || 0;

  // ──────────────────────────────────────────────────────────────────────
  // 3. Shipday Activity Log → touchpoints
  // ──────────────────────────────────────────────────────────────────────
  console.log('\n--- Phase 3: Post-Demo Activity ---');
  const shipdayActivities = await defaultdbPool.query(`
    SELECT al.*, d.contact_email
    FROM shipday.activity_log al
    JOIN shipday.deals d ON d.deal_id = al.deal_id
    WHERE d.contact_email IS NOT NULL
  `);

  let activityCount = 0;
  for (const row of shipdayActivities.rows) {
    // Map action_type to touchpoint event_type
    let eventType = 'manual_note';
    let channel = 'manual';
    let direction: 'inbound' | 'outbound' = 'outbound';

    if (row.action_type === 'email_sent' || row.action_type === 'email_approved') {
      eventType = 'sent';
      channel = 'email';
    } else if (row.action_type === 'draft_generated') {
      eventType = 'draft_created';
      channel = 'email';
    } else if (row.action_type === 'deal_created') {
      eventType = 'deal_created';
      channel = 'fathom';
      direction = 'inbound';
    }

    try {
      await wincallPool.query(`
        INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, body_preview, metadata, occurred_at)
        SELECT c.contact_id, $1, $2, $3, 'postdemo', $4,
               $5::jsonb, $6
        FROM crm.contacts c
        WHERE LOWER(TRIM(c.email)) = LOWER(TRIM($7))
        ON CONFLICT DO NOTHING
      `, [
        channel,
        eventType,
        direction,
        row.notes || null,
        JSON.stringify({ action_type: row.action_type, touch_number: row.touch_number, asset_name: row.asset_name }),
        row.created_at,
        row.contact_email,
      ]);
      activityCount++;
    } catch (e) {
      // skip duplicates
    }
  }
  console.log(`  Activity log entries: ${activityCount}`);
  totalInserted += activityCount;

  // ──────────────────────────────────────────────────────────────────────
  // 4. Shipday Engagement Events → touchpoints (opens/clicks)
  // ──────────────────────────────────────────────────────────────────────
  console.log('\n--- Phase 4: Post-Demo Engagement ---');
  const shipdayEngagement = await defaultdbPool.query(`
    SELECT ee.*, d.contact_email
    FROM shipday.engagement_events ee
    JOIN shipday.deals d ON d.deal_id = ee.deal_id
    WHERE d.contact_email IS NOT NULL
  `);

  let engagementCount = 0;
  for (const row of shipdayEngagement.rows) {
    const eventType = row.event_type === 'open' ? 'opened' :
                      row.event_type === 'click' ? 'clicked' : row.event_type;
    try {
      await wincallPool.query(`
        INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
        SELECT c.contact_id, 'email', $1, 'inbound', 'postdemo',
               $2, $3::jsonb, $4
        FROM crm.contacts c
        WHERE LOWER(TRIM(c.email)) = LOWER(TRIM($5))
        ON CONFLICT DO NOTHING
      `, [
        eventType,
        row.event_data?.subject || null,
        JSON.stringify({ touch_number: row.touch_number, event_data: row.event_data }),
        row.created_at,
        row.contact_email,
      ]);
      engagementCount++;
    } catch (e) {
      // skip
    }
  }
  console.log(`  Engagement events: ${engagementCount}`);
  totalInserted += engagementCount;

  // ──────────────────────────────────────────────────────────────────────
  // 5. Win-Call Brain Calls → touchpoints
  // ──────────────────────────────────────────────────────────────────────
  console.log('\n--- Phase 5: Win-Call Calls ---');
  const calls = await wincallPool.query(`
    INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, body_preview, metadata, occurred_at)
    SELECT DISTINCT ON (c.contact_id, call.call_date)
      c.contact_id,
      'fathom',
      'call_completed',
      'outbound',
      'wincall',
      call.title,
      LEFT(call.fathom_summary, 200),
      jsonb_build_object(
        'call_id', call.call_id,
        'duration_seconds', call.duration_seconds,
        'fathom_url', call.fathom_url,
        'call_type', call.call_type,
        'talk_listen_ratio', call.talk_listen_ratio
      ),
      call.call_date
    FROM public.calls call
    JOIN public.deals d ON d.deal_id = call.deal_id
    JOIN crm.contacts c ON c.wincall_deal_id = d.deal_id::text
    WHERE call.call_date IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
  console.log(`  Calls: ${calls.rowCount}`);
  totalInserted += calls.rowCount || 0;

  // ──────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────
  console.log('\n--- Summary ---');
  const total = await wincallPool.query(`SELECT COUNT(*) as count FROM crm.touchpoints`);
  const byChannel = await wincallPool.query(`
    SELECT channel, event_type, COUNT(*) as count
    FROM crm.touchpoints
    GROUP BY channel, event_type
    ORDER BY channel, count DESC
  `);

  console.log(`  Total touchpoints: ${total.rows[0].count}`);
  console.log('  By channel + type:');
  for (const row of byChannel.rows) {
    console.log(`    ${row.channel} / ${row.event_type}: ${row.count}`);
  }

  await wincallPool.end();
  await defaultdbPool.end();
  console.log('\nDone!');
}

run().catch(err => {
  console.error('Touchpoint backfill failed:', err);
  process.exit(1);
});
