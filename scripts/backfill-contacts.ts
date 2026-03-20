/**
 * Backfill crm.contacts from all three source systems:
 * 1. bdr.leads (wincall_brain) - BDR cold outreach leads
 * 2. shipday.deals (defaultdb) - Post-demo follow-up deals
 * 3. public.deals (wincall_brain) - Win-Call Brain deals
 *
 * Matching strategy: email address (deduplicated)
 * Run: npx tsx scripts/backfill-contacts.ts
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
  console.log('=== CRM Contact Backfill ===\n');

  // 1. Import from bdr.leads (deduplicate by email, keep highest scored)
  console.log('--- Phase 1: BDR Leads ---');
  const bdrResult = await wincallPool.query(`
    INSERT INTO crm.contacts (
      email, phone, first_name, last_name, business_name,
      title, website, lifecycle_stage, lead_score,
      bdr_lead_id, metadata
    )
    SELECT
      LOWER(TRIM(contact_email)),
      phone,
      SPLIT_PART(contact_name, ' ', 1) as first_name,
      CASE WHEN POSITION(' ' IN COALESCE(contact_name,'')) > 0
           THEN SUBSTRING(contact_name FROM POSITION(' ' IN contact_name) + 1)
           ELSE NULL END as last_name,
      business_name,
      contact_title,
      website,
      CASE
        WHEN status = 'demo_booked' THEN 'demo_completed'
        WHEN status IN ('enriched', 'scored') THEN 'enriched'
        WHEN status IN ('email_sent', 'follow_up_sent', 'email_ready') THEN 'outreach'
        WHEN status = 'replied' THEN 'engaged'
        ELSE 'raw'
      END as lifecycle_stage,
      COALESCE(total_score, 0) as lead_score,
      lead_id::text,
      jsonb_build_object(
        'source', 'bdr',
        'bdr_status', status,
        'bdr_tier', tier,
        'city', city,
        'state', state
      )
    FROM (
      SELECT DISTINCT ON (LOWER(TRIM(contact_email))) *
      FROM bdr.leads
      WHERE contact_email IS NOT NULL AND TRIM(contact_email) != ''
      ORDER BY LOWER(TRIM(contact_email)), COALESCE(total_score, 0) DESC
    ) deduped
    ON CONFLICT (email) DO UPDATE SET
      phone = COALESCE(EXCLUDED.phone, crm.contacts.phone),
      first_name = COALESCE(EXCLUDED.first_name, crm.contacts.first_name),
      last_name = COALESCE(EXCLUDED.last_name, crm.contacts.last_name),
      business_name = COALESCE(EXCLUDED.business_name, crm.contacts.business_name),
      title = COALESCE(EXCLUDED.title, crm.contacts.title),
      website = COALESCE(EXCLUDED.website, crm.contacts.website),
      lead_score = GREATEST(crm.contacts.lead_score, EXCLUDED.lead_score),
      bdr_lead_id = EXCLUDED.bdr_lead_id,
      metadata = crm.contacts.metadata || EXCLUDED.metadata
  `);
  console.log(`  Imported/updated: ${bdrResult.rowCount} contacts from bdr.leads`);

  // 2. Import from shipday.deals (defaultdb)
  console.log('\n--- Phase 2: Post-Demo Deals ---');
  const shipdayRows = await defaultdbPool.query(`
    SELECT
      deal_id, contact_email, contact_phone, contact_name,
      business_name, agent_status, demo_date,
      engagement_score, sequence_step
    FROM shipday.deals
    WHERE contact_email IS NOT NULL AND TRIM(contact_email) != ''
  `);

  let shipdayCount = 0;
  for (const row of shipdayRows.rows) {
    let stage = 'demo_completed';
    if (row.agent_status === 'completed') stage = 'won';
    else if (row.agent_status === 'lost') stage = 'lost';
    else if (row.engagement_score >= 15) stage = 'negotiation';
    else if (row.engagement_score >= 5) stage = 'engaged';

    await wincallPool.query(`
      INSERT INTO crm.contacts (
        email, phone, first_name, last_name, business_name,
        lifecycle_stage, engagement_score, shipday_deal_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (email) DO UPDATE SET
        phone = COALESCE(EXCLUDED.phone, crm.contacts.phone),
        first_name = COALESCE(EXCLUDED.first_name, crm.contacts.first_name),
        last_name = COALESCE(EXCLUDED.last_name, crm.contacts.last_name),
        business_name = COALESCE(EXCLUDED.business_name, crm.contacts.business_name),
        lifecycle_stage = CASE
          WHEN crm.contacts.lifecycle_stage IN ('won','lost') THEN crm.contacts.lifecycle_stage
          ELSE EXCLUDED.lifecycle_stage
        END,
        engagement_score = GREATEST(crm.contacts.engagement_score, EXCLUDED.engagement_score),
        shipday_deal_id = EXCLUDED.shipday_deal_id,
        metadata = crm.contacts.metadata || EXCLUDED.metadata
    `, [
      row.contact_email.toLowerCase().trim(),
      row.contact_phone,
      row.contact_name ? row.contact_name.split(' ')[0] : null,
      row.contact_name && row.contact_name.includes(' ') ? row.contact_name.split(' ').slice(1).join(' ') : null,
      row.business_name,
      stage,
      row.engagement_score || 0,
      row.deal_id?.toString(),
      JSON.stringify({
        source: 'postdemo',
        demo_date: row.demo_date,
        agent_status: row.agent_status,
        sequence_step: row.sequence_step,
      }),
    ]);
    shipdayCount++;
  }
  console.log(`  Imported/updated: ${shipdayCount} contacts from shipday.deals`);

  // 3. Import from public.deals (wincall_brain)
  // contact_emails is a text[] array, so we unnest and deduplicate
  console.log('\n--- Phase 3: Win-Call Deals ---');
  const wincallResult = await wincallPool.query(`
    INSERT INTO crm.contacts (
      email, business_name, lifecycle_stage, wincall_deal_id, metadata
    )
    SELECT
      email_lower,
      account_name,
      lifecycle_stage,
      deal_id_text,
      metadata
    FROM (
      SELECT DISTINCT ON (LOWER(TRIM(unnested_email)))
        LOWER(TRIM(unnested_email)) as email_lower,
        d.account_name,
        CASE
          WHEN d.outcome = 'won' OR d.stage = 'Closed Won' THEN 'won'
          WHEN d.outcome = 'lost' OR d.stage = 'Closed Lost' THEN 'lost'
          WHEN d.stage IN ('Negotiation', 'Proposal') THEN 'negotiation'
          ELSE 'demo_completed'
        END as lifecycle_stage,
        d.deal_id::text as deal_id_text,
        jsonb_build_object('source', 'wincall', 'stage', d.stage, 'outcome', d.outcome, 'mrr', d.mrr) as metadata
      FROM public.deals d,
      LATERAL unnest(d.contact_emails) AS unnested_email
      WHERE unnested_email IS NOT NULL AND TRIM(unnested_email) != ''
      ORDER BY LOWER(TRIM(unnested_email)), d.mrr DESC NULLS LAST
    ) deduped
    ON CONFLICT (email) DO UPDATE SET
      business_name = COALESCE(EXCLUDED.business_name, crm.contacts.business_name),
      wincall_deal_id = EXCLUDED.wincall_deal_id,
      metadata = crm.contacts.metadata || EXCLUDED.metadata
  `);
  console.log(`  Imported/updated: ${wincallResult.rowCount} contacts from public.deals`);

  // 4. Summary
  console.log('\n--- Summary ---');
  const total = await wincallPool.query(`SELECT COUNT(*) as count FROM crm.contacts`);
  const byStage = await wincallPool.query(`
    SELECT lifecycle_stage, COUNT(*) as count
    FROM crm.contacts GROUP BY lifecycle_stage ORDER BY count DESC
  `);

  console.log(`  Total contacts: ${total.rows[0].count}`);
  console.log('  By stage:');
  for (const row of byStage.rows) {
    console.log(`    ${row.lifecycle_stage}: ${row.count}`);
  }

  await wincallPool.end();
  await defaultdbPool.end();
  console.log('\nDone!');
}

run().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
