/**
 * Import historic BDR data from leads_master Google Sheet CSV into SalesHub.
 *
 * Targets:
 *   1. bdr.leads — UPSERT all lead records
 *   2. bdr.email_sends — CREATE rows for initial + followup_1 + followup_2 + breakup emails
 *   3. crm.contacts — UPSERT linked CRM contacts
 *   4. crm.touchpoints — CREATE sent/opened/replied events
 *
 * Usage:
 *   1. Export leads_master tab from Google Sheets as CSV
 *   2. npx tsx scripts/import-leads-master.ts ./path/to/leads_master.csv
 *
 * Also imports:
 *   - Shipday customers (fetched from public Google Sheet URL)
 *   - Reply log (pass --reply-log=./path/to/reply_log.csv)
 */

import { Pool } from 'pg';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_WINCALL,
  ssl: { rejectUnauthorized: false },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(val: string | undefined | null): string | null {
  if (!val || val.trim() === '') return null;
  const d = new Date(val.trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseNum(val: string | undefined | null): number | null {
  if (!val || val.trim() === '') return null;
  const n = Number(val.trim());
  return isNaN(n) ? null : n;
}

function cleanEmail(val: string | undefined | null): string | null {
  if (!val || val.trim() === '') return null;
  return val.trim().toLowerCase();
}

function parseCsv(filePath: string): Record<string, string>[] {
  const raw = readFileSync(filePath, 'utf-8');
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

// ─── Phase 1: Import leads_master into bdr.leads + bdr.email_sends ─────────

async function importLeadsMaster(csvPath: string) {
  console.log('=== Phase 1: Import leads_master ===\n');

  const rows = parseCsv(csvPath);
  console.log(`  Parsed ${rows.length} rows from CSV`);

  if (rows.length > 0) {
    console.log(`  Columns: ${Object.keys(rows[0]).join(', ')}`);
  }

  let leadsUpserted = 0;
  let emailSendsCreated = 0;
  let contactsUpserted = 0;
  let touchpointsCreated = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      const leadId = row.lead_id;
      if (!leadId) { errors++; continue; }

      const email = cleanEmail(row.contact_email);
      const status = row.status === 'sequence_complete' ? 'sent' : (row.status || 'scraped');
      const hasReplied = !!(row.reply_received_at || row.reply_classification);

      // 1a. UPSERT bdr.leads
      // Actual DB columns: id(serial), lead_id, business_name, address, city, state, zip_code, phone, website,
      // google_place_id, google_rating, google_review_count, google_price_level, google_business_type,
      // google_delivery_flag, contact_name, contact_email, contact_title, email_confidence,
      // secondary_contact_name, secondary_contact_email, pos_system, ordering_platforms, has_direct_ordering,
      // marketplace_count, cuisine_type, price_range, total_score, contact_quality_score, business_strength_score,
      // delivery_potential_score, tech_stack_score, tier, market_type, zip_population, status,
      // email_subject, email_body, email_angle, email_variant_id, email_sent_at, send_count, last_sent_date,
      // follow_up_1_sent_at, follow_up_1_subject, follow_up_2_sent_at, follow_up_2_subject, follow_up_status,
      // has_replied, reply_date, reply_sentiment, reply_summary, open_count, first_open_at, last_open_at,
      // source, source_url, scraped_at, created_at, updated_at, enriched_at, scored_at,
      // demo_booked_at, demo_outcome, calendly_event_name, win_pattern_score, mrr_potential_score,
      // engagement_score, scoring_model_version, campaign_template_id, campaign_step

      await pool.query(`
        INSERT INTO bdr.leads (
          lead_id, business_name, address, city, state, zip_code, phone, website,
          google_place_id, google_rating, google_review_count, google_price_level,
          contact_name, contact_email, contact_title,
          secondary_contact_name, secondary_contact_email,
          cuisine_type, pos_system,
          total_score, contact_quality_score, business_strength_score,
          delivery_potential_score, tech_stack_score, win_pattern_score, mrr_potential_score,
          engagement_score, scoring_model_version,
          status, tier, market_type, zip_population,
          email_subject, email_body, email_angle,
          email_sent_at, send_count, last_sent_date,
          follow_up_1_sent_at, follow_up_1_subject,
          follow_up_2_sent_at, follow_up_2_subject,
          has_replied, reply_date, reply_sentiment, reply_summary,
          open_count, first_open_at,
          source, source_url, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15,
          $16, $17,
          $18, $19,
          $20, $21, $22,
          $23, $24, $25, $26,
          $27, $28,
          $29, $30, $31, $32,
          $33, $34, $35,
          $36, $37, $38,
          $39, $40,
          $41, $42,
          $43, $44, $45, $46,
          $47, $48,
          $49, $50, NOW()
        )
        ON CONFLICT (lead_id) DO UPDATE SET
          business_name = COALESCE(EXCLUDED.business_name, bdr.leads.business_name),
          contact_name = COALESCE(EXCLUDED.contact_name, bdr.leads.contact_name),
          contact_email = COALESCE(EXCLUDED.contact_email, bdr.leads.contact_email),
          contact_title = COALESCE(EXCLUDED.contact_title, bdr.leads.contact_title),
          phone = COALESCE(EXCLUDED.phone, bdr.leads.phone),
          city = COALESCE(EXCLUDED.city, bdr.leads.city),
          state = COALESCE(EXCLUDED.state, bdr.leads.state),
          website = COALESCE(EXCLUDED.website, bdr.leads.website),
          cuisine_type = COALESCE(EXCLUDED.cuisine_type, bdr.leads.cuisine_type),
          google_rating = COALESCE(EXCLUDED.google_rating, bdr.leads.google_rating),
          google_review_count = COALESCE(EXCLUDED.google_review_count, bdr.leads.google_review_count),
          total_score = COALESCE(EXCLUDED.total_score, bdr.leads.total_score),
          contact_quality_score = COALESCE(EXCLUDED.contact_quality_score, bdr.leads.contact_quality_score),
          business_strength_score = COALESCE(EXCLUDED.business_strength_score, bdr.leads.business_strength_score),
          delivery_potential_score = COALESCE(EXCLUDED.delivery_potential_score, bdr.leads.delivery_potential_score),
          tech_stack_score = COALESCE(EXCLUDED.tech_stack_score, bdr.leads.tech_stack_score),
          win_pattern_score = COALESCE(EXCLUDED.win_pattern_score, bdr.leads.win_pattern_score),
          mrr_potential_score = COALESCE(EXCLUDED.mrr_potential_score, bdr.leads.mrr_potential_score),
          engagement_score = COALESCE(EXCLUDED.engagement_score, bdr.leads.engagement_score),
          status = EXCLUDED.status,
          tier = COALESCE(EXCLUDED.tier, bdr.leads.tier),
          market_type = COALESCE(EXCLUDED.market_type, bdr.leads.market_type),
          email_subject = COALESCE(EXCLUDED.email_subject, bdr.leads.email_subject),
          email_body = COALESCE(EXCLUDED.email_body, bdr.leads.email_body),
          email_angle = COALESCE(EXCLUDED.email_angle, bdr.leads.email_angle),
          send_count = COALESCE(EXCLUDED.send_count, bdr.leads.send_count),
          open_count = COALESCE(EXCLUDED.open_count, bdr.leads.open_count),
          last_sent_date = COALESCE(EXCLUDED.last_sent_date, bdr.leads.last_sent_date),
          follow_up_1_sent_at = COALESCE(EXCLUDED.follow_up_1_sent_at, bdr.leads.follow_up_1_sent_at),
          follow_up_1_subject = COALESCE(EXCLUDED.follow_up_1_subject, bdr.leads.follow_up_1_subject),
          follow_up_2_sent_at = COALESCE(EXCLUDED.follow_up_2_sent_at, bdr.leads.follow_up_2_sent_at),
          follow_up_2_subject = COALESCE(EXCLUDED.follow_up_2_subject, bdr.leads.follow_up_2_subject),
          has_replied = COALESCE(EXCLUDED.has_replied, bdr.leads.has_replied),
          reply_date = COALESCE(EXCLUDED.reply_date, bdr.leads.reply_date),
          reply_sentiment = COALESCE(EXCLUDED.reply_sentiment, bdr.leads.reply_sentiment),
          reply_summary = COALESCE(EXCLUDED.reply_summary, bdr.leads.reply_summary),
          updated_at = NOW()
      `, [
        leadId, row.business_name || null, row.address || null, row.city || null, row.state || null, row.zip_code || null,
        row.phone || null, row.website || null,
        row.google_place_id || null, parseNum(row.google_rating), parseNum(row.google_review_count), parseNum(row.google_price_level),
        row.contact_name || null, email, row.contact_title || null,
        row.contact_2_name || null, cleanEmail(row.contact_2_email),
        row.cuisine_type || null, row.pos_name || null,
        parseNum(row.total_score || row.score), parseNum(row.contact_quality_score || row.score_contact),
        parseNum(row.business_strength_score || row.score_business),
        parseNum(row.delivery_potential_score || row.score_delivery), parseNum(row.tech_stack_score || row.score_techstack),
        parseNum(row.win_pattern_score), parseNum(row.mrr_potential_score),
        parseNum(row.engagement_score), row.scoring_model_version || null,
        status, row.tier || null, row.market_type || null, parseNum(row.zip_population),
        row.email_subject || null, row.email_body || null, row.email_angle || null,
        parseDate(row.email_sent_at), parseNum(row.send_count), parseDate(row.last_sent_date),
        parseDate(row.followup_1_sent), row.follow_up_1_subject || null,
        parseDate(row.followup_2_sent), row.follow_up_2_subject || null,
        hasReplied, parseDate(row.reply_received_at), row.reply_classification || null, row.reply_summary || null,
        parseNum(row.email_open_count), parseDate(row.email_opened_at),
        row.source || 'google_maps', row.source_url || null,
      ]);
      leadsUpserted++;

      // 1b. Create bdr.email_sends rows for each sent email type
      // DB columns: id(uuid), lead_id, email_type, to_email, from_email, subject, body, angle,
      //   variant_id, gmail_message_id, gmail_thread_id, sent_at, open_count, first_open_at,
      //   last_open_at, click_count, replied, reply_at, reply_sentiment, reply_classification
      const emailTypes = [
        { type: 'initial', sentCol: 'email_sent_at', subjectCol: 'email_subject', bodyCol: 'email_body' },
        { type: 'followup_1', sentCol: 'followup_1_sent', subjectCol: 'follow_up_1_subject', bodyCol: null },
        { type: 'followup_2', sentCol: 'followup_2_sent', subjectCol: 'follow_up_2_subject', bodyCol: null },
        { type: 'breakup', sentCol: 'breakup_sent', subjectCol: null, bodyCol: null },
      ];

      for (const et of emailTypes) {
        const sentAt = parseDate(row[et.sentCol]);
        if (!sentAt || !email) continue;

        const isInitial = et.type === 'initial';
        await pool.query(`
          INSERT INTO bdr.email_sends (
            id, lead_id, to_email, email_type, subject, body, angle,
            sent_at, open_count, first_open_at, last_open_at,
            replied, reply_at, reply_classification, reply_sentiment,
            gmail_message_id, gmail_thread_id, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17, $8
          )
          ON CONFLICT DO NOTHING
        `, [
          randomUUID(),
          leadId,
          email,
          et.type,
          et.subjectCol ? (row[et.subjectCol] || row.email_subject || null) : (row.email_subject || null),
          et.bodyCol ? (row[et.bodyCol] || null) : null,
          row.email_angle || null,
          sentAt,
          isInitial ? (parseNum(row.email_open_count) || 0) : 0,
          isInitial ? parseDate(row.email_opened_at) : null,
          isInitial ? parseDate(row.email_opened_at) : null,
          isInitial && hasReplied,
          isInitial ? parseDate(row.reply_received_at) : null,
          isInitial ? (row.reply_classification || null) : null,
          isInitial ? (row.reply_classification || null) : null,
          isInitial ? (row.gmail_message_id || null) : null,
          isInitial ? (row.gmail_thread_id || null) : null,
        ]);
        emailSendsCreated++;
      }

      // 1c. UPSERT crm.contacts
      if (email) {
        let lifecycleStage = 'raw';
        if (status === 'demo_booked') lifecycleStage = 'demo_completed';
        else if (['enriched', 'scored'].includes(status)) lifecycleStage = 'enriched';
        else if (['email_sent', 'sent', 'follow_up_sent', 'email_ready', 'sequence_complete'].includes(status)) lifecycleStage = 'outreach';
        else if (status === 'replied') lifecycleStage = 'engaged';

        await pool.query(`
          INSERT INTO crm.contacts (
            email, phone, first_name, last_name, business_name,
            title, website, lifecycle_stage, lead_score,
            bdr_lead_id, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (email) DO UPDATE SET
            phone = COALESCE(EXCLUDED.phone, crm.contacts.phone),
            first_name = COALESCE(EXCLUDED.first_name, crm.contacts.first_name),
            last_name = COALESCE(EXCLUDED.last_name, crm.contacts.last_name),
            business_name = COALESCE(EXCLUDED.business_name, crm.contacts.business_name),
            title = COALESCE(EXCLUDED.title, crm.contacts.title),
            website = COALESCE(EXCLUDED.website, crm.contacts.website),
            lead_score = GREATEST(crm.contacts.lead_score, EXCLUDED.lead_score),
            bdr_lead_id = EXCLUDED.bdr_lead_id,
            metadata = crm.contacts.metadata || EXCLUDED.metadata,
            updated_at = NOW()
        `, [
          email,
          row.phone || null,
          row.contact_name ? row.contact_name.split(' ')[0] : null,
          row.contact_name && row.contact_name.includes(' ') ? row.contact_name.split(' ').slice(1).join(' ') : null,
          row.business_name || null,
          row.contact_title || null,
          row.website || null,
          lifecycleStage,
          parseNum(row.total_score || row.score) || 0,
          leadId.toString(),
          JSON.stringify({
            source: 'bdr',
            bdr_status: status,
            bdr_tier: row.tier || null,
            city: row.city || null,
            state: row.state || null,
          }),
        ]);
        contactsUpserted++;

        // 1d. Create touchpoints for sent/opened/replied
        const sentAt = parseDate(row.email_sent_at);
        if (sentAt) {
          await pool.query(`
            INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
            SELECT c.contact_id, 'email', 'sent', 'outbound', 'bdr', $2,
                   $3::jsonb, $4
            FROM crm.contacts c WHERE c.email = $1
            ON CONFLICT DO NOTHING
          `, [
            email, row.email_subject || null,
            JSON.stringify({ email_type: 'initial', angle: row.email_angle }),
            sentAt,
          ]);
          touchpointsCreated++;
        }

        const openedAt = parseDate(row.email_opened_at);
        if (openedAt) {
          await pool.query(`
            INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
            SELECT c.contact_id, 'email', 'opened', 'inbound', 'bdr', $2,
                   $3::jsonb, $4
            FROM crm.contacts c WHERE c.email = $1
            ON CONFLICT DO NOTHING
          `, [
            email, row.email_subject || null,
            JSON.stringify({ open_count: parseNum(row.email_open_count) }),
            openedAt,
          ]);
          touchpointsCreated++;
        }

        const repliedAt = parseDate(row.reply_received_at);
        if (repliedAt) {
          await pool.query(`
            INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
            SELECT c.contact_id, 'email', 'replied', 'inbound', 'bdr', $2,
                   $3::jsonb, $4
            FROM crm.contacts c WHERE c.email = $1
            ON CONFLICT DO NOTHING
          `, [
            email, row.email_subject || null,
            JSON.stringify({ reply_classification: row.reply_classification, reply_summary: row.reply_summary }),
            repliedAt,
          ]);
          touchpointsCreated++;
        }
      }

      if (leadsUpserted % 500 === 0 && leadsUpserted > 0) {
        console.log(`  Progress: ${leadsUpserted}/${rows.length} leads...`);
      }
    } catch (err) {
      errors++;
      if (errors <= 10) {
        console.error(`  Error on lead ${row.lead_id}: ${(err as Error).message}`);
      }
    }
  }

  console.log(`\n  Leads upserted: ${leadsUpserted}`);
  console.log(`  Email sends created: ${emailSendsCreated}`);
  console.log(`  Contacts upserted: ${contactsUpserted}`);
  console.log(`  Touchpoints created: ${touchpointsCreated}`);
  console.log(`  Errors: ${errors}`);
}

// ─── Phase 2: Import Shipday customers ──────────────────────────────────────

async function importShipdayCustomers() {
  console.log('\n=== Phase 2: Import Shipday Customers ===\n');

  const SHIPDAY_URL = 'https://docs.google.com/spreadsheets/d/1vkgdy3I2WXwQgM9HhpkBf-kHr17_hVWzRk6W3Lg8kyw/export?format=csv&gid=0';

  let csvText: string;
  try {
    const resp = await fetch(SHIPDAY_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    csvText = await resp.text();
  } catch (err) {
    console.error(`  Failed to fetch Shipday CSV: ${(err as Error).message}`);
    console.log('  Skipping Shipday import.');
    return;
  }

  const rows: Record<string, string>[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  console.log(`  Parsed ${rows.length} Shipday customers`);

  let contactsUpserted = 0;
  let signupsCreated = 0;

  for (const row of rows) {
    const email = cleanEmail(row.email);
    if (!email) continue;

    const customerName = row['Customer Name'] || '';
    const firstName = customerName.split(' ')[0] || null;
    const lastName = customerName.includes(' ') ? customerName.split(' ').slice(1).join(' ') : null;
    const businessName = row['Business'] || null;

    // Upsert into crm.contacts as 'won' (paying customers)
    await pool.query(`
      INSERT INTO crm.contacts (
        email, first_name, last_name, business_name,
        lifecycle_stage, metadata
      ) VALUES ($1, $2, $3, $4, 'won', $5)
      ON CONFLICT (email) DO UPDATE SET
        first_name = COALESCE(EXCLUDED.first_name, crm.contacts.first_name),
        last_name = COALESCE(EXCLUDED.last_name, crm.contacts.last_name),
        business_name = COALESCE(EXCLUDED.business_name, crm.contacts.business_name),
        lifecycle_stage = 'won',
        metadata = crm.contacts.metadata || EXCLUDED.metadata,
        updated_at = NOW()
    `, [
      email, firstName, lastName, businessName,
      JSON.stringify({
        source: 'shipday_customer',
        account_plan: row.account_plan || null,
        avg_completed_orders_6m: parseNum(row.avg_completed_orders_6m),
        avg_order: row['Average Order (last month)'] || null,
        avg_cost: row['Average Cost'] || null,
      }),
    ]);
    contactsUpserted++;

    // Insert into crm.shipday_signups
    await pool.query(`
      INSERT INTO crm.shipday_signups (
        business_name, contact_name, contact_email,
        plan_type, state, shipday_account_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT DO NOTHING
    `, [
      businessName, customerName || null, email,
      row.account_plan || null, row.state || null, row.company_id || null,
      JSON.stringify({
        address: row.address || null,
        avg_completed_orders_6m: parseNum(row.avg_completed_orders_6m),
        avg_order: row['Average Order (last month)'] || null,
        avg_cost: row['Average Cost'] || null,
      }),
    ]);
    signupsCreated++;
  }

  console.log(`  Contacts upserted: ${contactsUpserted}`);
  console.log(`  Shipday signups created: ${signupsCreated}`);
}

// ─── Phase 3: Import reply_log ──────────────────────────────────────────────

async function importReplyLog(csvPath: string) {
  console.log('\n=== Phase 3: Import Reply Log ===\n');

  const rows = parseCsv(csvPath);
  console.log(`  Parsed ${rows.length} reply log rows`);

  if (rows.length > 0) {
    console.log(`  Columns: ${Object.keys(rows[0]).join(', ')}`);
  }

  let updated = 0;
  let touchpoints = 0;

  for (const row of rows) {
    const leadId = row.lead_id;
    const email = cleanEmail(row.contact_email || row.email);
    const replyAt = parseDate(row.reply_received_at || row.reply_date || row.received_at);

    if (!leadId) continue;

    // Update bdr.leads reply fields
    await pool.query(`
      UPDATE bdr.leads SET
        has_replied = true,
        reply_sentiment = COALESCE($2, reply_sentiment),
        reply_summary = COALESCE($3, reply_summary),
        reply_date = COALESCE($4, reply_date),
        updated_at = NOW()
      WHERE lead_id = $1
    `, [
      leadId,
      row.reply_classification || row.reply_sentiment || null,
      row.reply_summary || row.summary || null,
      replyAt,
    ]);
    updated++;

    // Update bdr.email_sends
    await pool.query(`
      UPDATE bdr.email_sends SET
        replied = true,
        reply_at = COALESCE($2, reply_at),
        reply_classification = COALESCE($3, reply_classification),
        reply_sentiment = COALESCE($4, reply_sentiment)
      WHERE lead_id = $1 AND email_type = 'initial'
    `, [
      leadId, replyAt,
      row.reply_classification || null,
      row.reply_classification || null,
    ]);

    // Create reply touchpoint
    if (email && replyAt) {
      await pool.query(`
        INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
        SELECT c.contact_id, 'email', 'replied', 'inbound', 'bdr', NULL,
               $2::jsonb, $3
        FROM crm.contacts c WHERE c.email = $1
        ON CONFLICT DO NOTHING
      `, [
        email,
        JSON.stringify({
          reply_classification: row.reply_classification || null,
          reply_summary: row.reply_summary || row.summary || null,
        }),
        replyAt,
      ]);
      touchpoints++;
    }
  }

  console.log(`  Leads updated: ${updated}`);
  console.log(`  Reply touchpoints: ${touchpoints}`);
}

// ─── Phase 4: Summary ───────────────────────────────────────────────────────

async function printSummary() {
  console.log('\n=== Final Summary ===\n');

  const queries = [
    { label: 'bdr.leads', sql: 'SELECT COUNT(*) as count FROM bdr.leads' },
    { label: 'bdr.email_sends', sql: 'SELECT COUNT(*) as count FROM bdr.email_sends' },
    { label: 'crm.contacts', sql: 'SELECT COUNT(*) as count FROM crm.contacts' },
    { label: 'crm.touchpoints', sql: 'SELECT COUNT(*) as count FROM crm.touchpoints' },
    { label: 'crm.shipday_signups', sql: 'SELECT COUNT(*) as count FROM crm.shipday_signups' },
  ];

  for (const q of queries) {
    const res = await pool.query(q.sql);
    console.log(`  ${q.label}: ${res.rows[0].count} rows`);
  }

  // Status breakdown
  const statusBreakdown = await pool.query(`
    SELECT status, COUNT(*) as count FROM bdr.leads GROUP BY status ORDER BY count DESC
  `);
  console.log('\n  bdr.leads by status:');
  for (const row of statusBreakdown.rows) {
    console.log(`    ${row.status}: ${row.count}`);
  }

  // Lifecycle breakdown
  const lifecycleBreakdown = await pool.query(`
    SELECT lifecycle_stage, COUNT(*) as count FROM crm.contacts GROUP BY lifecycle_stage ORDER BY count DESC
  `);
  console.log('\n  crm.contacts by lifecycle:');
  for (const row of lifecycleBreakdown.rows) {
    console.log(`    ${row.lifecycle_stage}: ${row.count}`);
  }

  // Email sends by type
  const sendsByType = await pool.query(`
    SELECT email_type, COUNT(*) as count FROM bdr.email_sends GROUP BY email_type ORDER BY count DESC
  `);
  console.log('\n  bdr.email_sends by type:');
  for (const row of sendsByType.rows) {
    console.log(`    ${row.email_type}: ${row.count}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find(a => !a.startsWith('--'));
  const replyLogArg = args.find(a => a.startsWith('--reply-log='));
  const replyLogPath = replyLogArg?.split('=')[1];

  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-leads-master.ts <leads_master.csv> [--reply-log=<reply_log.csv>]');
    console.error('\nExport the leads_master tab from Google Sheets as CSV first.');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════╗');
  console.log('║   SalesHub Historic Data Import          ║');
  console.log('╚══════════════════════════════════════════╝\n');

  await importLeadsMaster(csvPath);
  await importShipdayCustomers();

  if (replyLogPath) {
    await importReplyLog(replyLogPath);
  } else {
    console.log('\n  Skipping reply_log (pass --reply-log=./path/to/reply_log.csv to include)');
  }

  await printSummary();

  await pool.end();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
