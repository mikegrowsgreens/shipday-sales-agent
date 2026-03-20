import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { preprocessEmail } from '@/lib/email-tracking';
import { generateAdaptiveEmail, type EngagementSignalType } from '@/lib/ai';
import { N8N_WEBHOOK_KEY, N8N_BASE_URL } from '@/lib/config';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { buildSignatureHtml, getStoredSignature } from '@/lib/test-send';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EngagementProfile {
  signal: EngagementSignalType;
  total_sends: number;
  total_opens: number;
  total_clicks: number;
  has_replied: boolean;
  open_rate: number;
  most_opened_angle: string | null;
  previous_angles: string[];
}

interface BranchRule {
  action: string;
  channel?: string;
  angle?: string;
  tone?: string;
  reduce_delay_days?: number;
}

interface StepBranchRules {
  no_opens?: BranchRule;
  opened_no_reply?: BranchRule;
  clicked?: BranchRule;
  multi_open?: BranchRule;
}

interface TemplateStepWithBranch {
  step_number: number;
  delay_days: number;
  channel: string;
  angle: string;
  tone: string;
  instructions: string;
  branch_rules?: StepBranchRules;
}

/**
 * POST /api/bdr/campaigns/process-scheduled
 *
 * Called by n8n every 15 minutes. Three passes:
 *
 * Pass 1 — Follow-up steps: Finds campaign_emails with status='scheduled' AND scheduled_at <= NOW()
 *   - Evaluates engagement signals from previous steps
 *   - Applies branch rules (channel switch, angle change, regenerate) based on engagement
 *   - Auto-sends for eligible leads (tier/score check via template's auto_approve_score_threshold)
 *   - Queues others for manual review
 *
 * Pass 2 — Auto-approve first-touch: Finds leads with status='email_ready' whose
 *   campaign template has auto_approve_score_threshold set AND lead score meets threshold.
 *
 * Auth: webhook key via x-webhook-key header
 */
export async function POST(request: NextRequest) {
  const webhookKey = request.headers.get('x-webhook-key');
  if (webhookKey !== N8N_WEBHOOK_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const orgConfig = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
    const senderEmail = orgConfig.persona?.sender_email || 'sales@example.com';
    const storedSignature = await getStoredSignature();

    const queued: number[] = [];
    const autoSent: number[] = [];
    const skipped: number[] = [];
    const autoApproved: number[] = [];
    const tasksCreated: number[] = [];
    const adapted: Array<{ lead_id: number; signal: string; action: string }> = [];

    // ═══════════════════════════════════════════════════════════════════════
    // PASS 1: Process due scheduled campaign follow-up emails
    // ═══════════════════════════════════════════════════════════════════════

    const dueEmails = await query<{
      id: number;
      lead_id: number;
      template_id: number;
      step_number: number;
      channel: string;
      subject: string;
      body: string;
      angle: string;
      tone: string;
    }>(`
      SELECT ce.id, ce.lead_id, ce.template_id, ce.step_number, ce.channel,
             ce.subject, ce.body, ce.angle, ce.tone
      FROM bdr.campaign_emails ce
      WHERE ce.status = 'scheduled'
        AND ce.scheduled_at <= NOW()
      ORDER BY ce.scheduled_at ASC
      LIMIT 50
    `);

    // Load template data: thresholds + step branch rules
    const templateRows = await query<{
      id: number;
      auto_approve_score_threshold: number | null;
      steps: TemplateStepWithBranch[] | string;
    }>(
      `SELECT id, auto_approve_score_threshold, steps FROM bdr.campaign_templates WHERE is_active = true`
    );
    const thresholdMap: Record<number, number | null> = {};
    const templateStepsMap: Record<number, TemplateStepWithBranch[]> = {};
    for (const t of templateRows) {
      thresholdMap[t.id] = t.auto_approve_score_threshold;
      // steps may be JSON string or already parsed
      templateStepsMap[t.id] = typeof t.steps === 'string' ? JSON.parse(t.steps) : (t.steps || []);
    }

    for (const email of dueEmails) {
      // ─── Evaluate engagement for this lead ────────────────────────────
      const engagement = await evaluateEngagement(email.lead_id);

      // ─── Get branch rules for this step ───────────────────────────────
      const templateSteps = templateStepsMap[email.template_id] || [];
      const stepDef = templateSteps.find(s => s.step_number === email.step_number);
      const branchRules = stepDef?.branch_rules;

      // ─── Determine if branch rule applies ─────────────────────────────
      const branchRule = getBranchRule(engagement.signal, branchRules);
      let effectiveChannel = email.channel;
      let effectiveAngle = email.angle;
      let effectiveTone = email.tone;
      let shouldRegenerate = false;
      let delayReduction = 0;

      if (branchRule && engagement.signal !== 'normal') {
        switch (branchRule.action) {
          case 'switch_channel':
            effectiveChannel = branchRule.channel || (engagement.signal === 'no_opens' ? 'call' : 'linkedin');
            adapted.push({ lead_id: email.lead_id, signal: engagement.signal, action: `switch_channel→${effectiveChannel}` });
            break;

          case 'change_angle':
            effectiveAngle = branchRule.angle || pickAlternateAngle(engagement.previous_angles, email.angle);
            shouldRegenerate = true;
            adapted.push({ lead_id: email.lead_id, signal: engagement.signal, action: `change_angle→${effectiveAngle}` });
            break;

          case 'regenerate':
          case 'direct_cta':
            effectiveTone = branchRule.tone || (branchRule.action === 'direct_cta' ? 'direct' : effectiveTone);
            shouldRegenerate = true;
            adapted.push({ lead_id: email.lead_id, signal: engagement.signal, action: branchRule.action });
            break;

          case 'accelerate':
            delayReduction = branchRule.reduce_delay_days || 1;
            adapted.push({ lead_id: email.lead_id, signal: engagement.signal, action: `accelerate(-${delayReduction}d)` });
            break;

          case 'skip':
            await query(
              `UPDATE bdr.campaign_emails SET status = 'skipped', updated_at = NOW() WHERE id = $1`,
              [email.id]
            );
            await scheduleNextStep(email.lead_id, email.template_id, email.step_number);
            skipped.push(email.id);
            adapted.push({ lead_id: email.lead_id, signal: engagement.signal, action: 'skip' });
            continue;
        }
      } else if (engagement.signal !== 'normal' && !branchRule) {
        // ─── Default adaptive behavior when no explicit branch rules ────
        // Apply intelligent defaults based on engagement signals
        const defaultBehavior = getDefaultAdaptiveBehavior(engagement);
        if (defaultBehavior) {
          switch (defaultBehavior.action) {
            case 'switch_channel':
              effectiveChannel = defaultBehavior.channel || 'call';
              adapted.push({ lead_id: email.lead_id, signal: engagement.signal, action: `default:switch_channel→${effectiveChannel}` });
              break;
            case 'regenerate':
              shouldRegenerate = true;
              if (defaultBehavior.angle) effectiveAngle = defaultBehavior.angle;
              if (defaultBehavior.tone) effectiveTone = defaultBehavior.tone;
              adapted.push({ lead_id: email.lead_id, signal: engagement.signal, action: 'default:regenerate' });
              break;
          }
        }
      }

      // ─── Handle channel switch to non-email ───────────────────────────
      if (effectiveChannel !== 'email') {
        try {
          if (effectiveChannel === 'ai_chat') {
            // ─── AI Chat: Generate tracking link for chatbot handoff ────
            await triggerAIChatStep(email, engagement);
            adapted.push({ lead_id: email.lead_id, signal: engagement.signal, action: 'ai_chat_link_generated' });
          } else if (effectiveChannel === 'ai_call') {
            // ─── AI Call: Trigger voice agent ──────────────────────────
            await triggerAICallStep(email, engagement);
            adapted.push({ lead_id: email.lead_id, signal: engagement.signal, action: 'ai_call_initiated' });
          } else {
            const taskId = await createTaskForStep(email, effectiveChannel, engagement);
            if (taskId) tasksCreated.push(taskId);
          }

          await query(
            `UPDATE bdr.campaign_emails SET status = 'sent', sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
            [email.id]
          );
          await scheduleNextStep(email.lead_id, email.template_id, email.step_number, delayReduction);
          autoSent.push(email.id);
        } catch (taskErr) {
          console.error(`[process-scheduled] task creation failed for campaign_email ${email.id}:`, taskErr);
          await query(
            `UPDATE bdr.campaign_emails SET status = 'ready', updated_at = NOW() WHERE id = $1`,
            [email.id]
          );
          skipped.push(email.id);
        }
        continue;
      }

      // ─── Check lead status ────────────────────────────────────────────
      const lead = await query<{
        lead_id: number;
        status: string;
        tier: string;
        contact_email: string;
        contact_name: string;
        business_name: string;
        city: string | null;
        state: string | null;
        cuisine_type: string | null;
        total_score: number;
        has_replied: boolean;
      }>(
        `SELECT lead_id, status, tier, contact_email, contact_name, business_name,
                city, state, cuisine_type, total_score, has_replied
         FROM bdr.leads WHERE lead_id = $1`,
        [email.lead_id]
      );

      if (lead.length === 0) {
        await query(
          `UPDATE bdr.campaign_emails SET status = 'skipped', updated_at = NOW() WHERE id = $1`,
          [email.id]
        );
        skipped.push(email.id);
        continue;
      }

      const leadData = lead[0];

      // Skip if terminal status
      if (['replied', 'demo_booked', 'demo_opportunity', 'won', 'lost', 'opted_out', 'rejected', 'bounced'].includes(leadData.status)) {
        await query(
          `UPDATE bdr.campaign_emails SET status = 'skipped', updated_at = NOW() WHERE id = $1`,
          [email.id]
        );
        await query(
          `UPDATE bdr.campaign_emails
           SET status = 'skipped', updated_at = NOW()
           WHERE lead_id = $1 AND template_id = $2 AND step_number > $3 AND status IN ('pending', 'scheduled')`,
          [email.lead_id, email.template_id, email.step_number]
        );
        skipped.push(email.id);
        continue;
      }

      // Check for recent replies
      const recentReply = await query<{ id: string }>(
        `SELECT id FROM bdr.email_sends
         WHERE lead_id = $1 AND replied = true
         ORDER BY sent_at DESC LIMIT 1`,
        [email.lead_id]
      );

      if (recentReply.length > 0 || leadData.has_replied) {
        await query(
          `UPDATE bdr.campaign_emails
           SET status = 'skipped', updated_at = NOW()
           WHERE lead_id = $1 AND template_id = $2 AND status IN ('pending', 'scheduled')`,
          [email.lead_id, email.template_id]
        );
        skipped.push(email.id);
        continue;
      }

      // ─── Regenerate email if engagement-adaptive ──────────────────────
      let finalSubject = email.subject;
      let finalBody = email.body;
      let finalAngle = email.angle;

      if (shouldRegenerate && engagement.signal !== 'normal') {
        try {
          const adaptedEmail = await generateAdaptiveEmail({
            business_name: leadData.business_name,
            contact_name: leadData.contact_name,
            city: leadData.city || undefined,
            state: leadData.state || undefined,
            cuisine_type: leadData.cuisine_type || undefined,
            tier: leadData.tier,
            angle: effectiveAngle,
            tone: effectiveTone,
            instructions: stepDef?.instructions,
            engagement_signal: engagement.signal,
            total_sends: engagement.total_sends,
            total_opens: engagement.total_opens,
            total_clicks: engagement.total_clicks,
            open_rate: engagement.open_rate,
            previous_angles: engagement.previous_angles,
            most_opened_angle: engagement.most_opened_angle,
            override_angle: effectiveAngle !== email.angle ? effectiveAngle : undefined,
            override_tone: effectiveTone !== email.tone ? effectiveTone : undefined,
          });

          finalSubject = adaptedEmail.subject;
          finalBody = adaptedEmail.body;
          finalAngle = effectiveAngle;

          // Update the campaign_email record with adapted content
          await query(
            `UPDATE bdr.campaign_emails
             SET subject = $1, body = $2, angle = $3, tone = $4, updated_at = NOW()
             WHERE id = $5`,
            [finalSubject, finalBody, finalAngle, effectiveTone, email.id]
          );
        } catch (aiErr) {
          // If AI fails, fall back to original email
          console.error(`[process-scheduled] adaptive regeneration failed for lead ${email.lead_id}:`, aiErr);
        }
      }

      // ─── Send or queue for review ─────────────────────────────────────
      const templateThreshold = thresholdMap[email.template_id];
      const shouldAutoSend = templateThreshold !== null && templateThreshold !== undefined &&
        (leadData.total_score || 0) >= templateThreshold;

      if (shouldAutoSend && leadData.contact_email) {
        try {
          await autoSendEmail(
            { ...email, subject: finalSubject, body: finalBody, angle: finalAngle },
            leadData,
            senderEmail,
            orgConfig.persona?.sender_name,
            orgConfig.persona?.sender_title,
            storedSignature,
          );
          await scheduleNextStep(email.lead_id, email.template_id, email.step_number, delayReduction);
          autoSent.push(email.id);
        } catch (err) {
          console.error(`[process-scheduled] auto-send failed for campaign_email ${email.id}:`, err);
          await loadOntoLeadForReview({ ...email, subject: finalSubject, body: finalBody, angle: finalAngle });
          queued.push(email.id);
        }
      } else {
        await loadOntoLeadForReview({ ...email, subject: finalSubject, body: finalBody, angle: finalAngle });
        queued.push(email.id);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PASS 2: Auto-approve first-touch leads with eligible templates
    // ═══════════════════════════════════════════════════════════════════════

    const autoApproveLeads = await query<{
      lead_id: number;
      contact_email: string;
      contact_name: string;
      business_name: string;
      email_subject: string;
      email_body: string;
      email_angle: string;
      total_score: number;
      campaign_template_id: number;
      campaign_step: number;
    }>(`
      SELECT l.lead_id, l.contact_email, l.contact_name, l.business_name,
             l.email_subject, l.email_body, l.email_angle,
             l.total_score, l.campaign_template_id, l.campaign_step
      FROM bdr.leads l
      INNER JOIN bdr.campaign_templates ct ON ct.id = l.campaign_template_id
      WHERE l.status = 'email_ready'
        AND l.campaign_template_id IS NOT NULL
        AND ct.auto_approve_score_threshold IS NOT NULL
        AND l.total_score >= ct.auto_approve_score_threshold
        AND l.contact_email IS NOT NULL
        AND l.email_subject IS NOT NULL
      ORDER BY l.total_score DESC
      LIMIT 20
    `);

    for (const lead of autoApproveLeads) {
      try {
        const sendRows = await query<{ id: string }>(
          `INSERT INTO bdr.email_sends (lead_id, to_email, from_email, subject, body, angle, email_type, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'bdr_outbound', NOW())
           RETURNING id`,
          [lead.lead_id, lead.contact_email, senderEmail, lead.email_subject, lead.email_body, lead.email_angle]
        );

        const sendId = sendRows[0]?.id;
        if (!sendId) continue;

        const signature = storedSignature
          ? `<br/><br/>${storedSignature}`
          : buildSignatureHtml(orgConfig.persona?.sender_name, orgConfig.persona?.sender_title, senderEmail);
        const trackedHtml = preprocessEmail(lead.email_body + signature, sendId, false);

        const webhookUrl = `${N8N_BASE_URL}/webhook/dashboard-send-approved`;
        await fetchWithTimeout(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            send_id: sendId,
            lead_id: lead.lead_id,
            to: lead.contact_email,
            from: senderEmail,
            subject: lead.email_subject,
            body_html: trackedHtml,
            body_plain: lead.email_body,
            contact_name: lead.contact_name,
            business_name: lead.business_name,
            angle: lead.email_angle,
            campaign_step: lead.campaign_step || 1,
          }),
          timeout: 30000,
        });

        await query(
          `UPDATE bdr.leads SET status = 'approved', updated_at = NOW() WHERE lead_id = $1`,
          [lead.lead_id]
        );

        if (lead.campaign_template_id && lead.campaign_step) {
          await query(
            `UPDATE bdr.campaign_emails
             SET status = 'sent', send_id = $1::uuid, sent_at = NOW(), updated_at = NOW()
             WHERE lead_id = $2 AND template_id = $3 AND step_number = $4 AND status IN ('ready', 'scheduled')`,
            [sendId, lead.lead_id, lead.campaign_template_id, lead.campaign_step]
          );
          await scheduleNextStep(lead.lead_id, lead.campaign_template_id, lead.campaign_step);
        }

        await query(
          `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
           SELECT c.contact_id, 'email', 'auto_approved', 'outbound', 'bdr',
                  $2, jsonb_build_object('lead_id', $3, 'angle', $4, 'auto_approved', true), NOW()
           FROM crm.contacts c WHERE c.bdr_lead_id = $1::text`,
          [lead.lead_id, lead.email_subject, lead.lead_id, lead.email_angle]
        );

        autoApproved.push(lead.lead_id);
      } catch (err) {
        console.error(`[process-scheduled] auto-approve failed for lead ${lead.lead_id}:`, err);
      }
    }

    return NextResponse.json({
      processed: dueEmails.length,
      auto_sent: autoSent.length,
      queued_for_review: queued.length,
      skipped: skipped.length,
      auto_approved_first_touch: autoApproved.length,
      tasks_created: tasksCreated.length,
      engagement_adapted: adapted.length,
      auto_sent_ids: autoSent,
      queued_ids: queued,
      skipped_ids: skipped,
      auto_approved_ids: autoApproved,
      task_ids: tasksCreated,
      adaptations: adapted,
    });
  } catch (error) {
    console.error('[process-scheduled] error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGAGEMENT EVALUATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Evaluate engagement signals for a lead based on their email history.
 */
async function evaluateEngagement(leadId: number): Promise<EngagementProfile> {
  const sends = await query<{
    id: string;
    open_count: number;
    click_count: number;
    replied: boolean;
    angle: string | null;
    sent_at: string | null;
  }>(
    `SELECT id, open_count, click_count, replied, angle, sent_at
     FROM bdr.email_sends
     WHERE lead_id = $1 AND sent_at IS NOT NULL
     ORDER BY sent_at ASC`,
    [leadId]
  );

  if (sends.length === 0) {
    return {
      signal: 'normal',
      total_sends: 0,
      total_opens: 0,
      total_clicks: 0,
      has_replied: false,
      open_rate: 0,
      most_opened_angle: null,
      previous_angles: [],
    };
  }

  const totalSends = sends.length;
  const totalOpens = sends.reduce((sum, s) => sum + (s.open_count || 0), 0);
  const totalClicks = sends.reduce((sum, s) => sum + (s.click_count || 0), 0);
  const hasReplied = sends.some(s => s.replied);
  const sendsWithOpens = sends.filter(s => (s.open_count || 0) > 0).length;
  const openRate = totalSends > 0 ? Math.round((sendsWithOpens / totalSends) * 100) : 0;

  // Track angles used and which got most opens
  const angleOpens: Record<string, number> = {};
  const previousAngles: string[] = [];
  for (const s of sends) {
    if (s.angle) {
      previousAngles.push(s.angle);
      angleOpens[s.angle] = (angleOpens[s.angle] || 0) + (s.open_count || 0);
    }
  }
  const mostOpenedAngle = Object.entries(angleOpens).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Classify engagement signal
  let signal: EngagementSignalType = 'normal';

  if (hasReplied) {
    signal = 'normal'; // Already handled by reply detection
  } else if (totalClicks > 0) {
    signal = 'clicked';
  } else if (totalOpens === 0 && totalSends >= 1) {
    signal = 'no_opens';
  } else if (totalOpens >= 3 || (totalSends >= 2 && sendsWithOpens === totalSends)) {
    signal = 'multi_open';
  } else if (totalOpens > 0 && !hasReplied) {
    signal = 'opened_no_reply';
  }

  return {
    signal,
    total_sends: totalSends,
    total_opens: totalOpens,
    total_clicks: totalClicks,
    has_replied: hasReplied,
    open_rate: openRate,
    most_opened_angle: mostOpenedAngle,
    previous_angles: [...new Set(previousAngles)],
  };
}

/**
 * Get the applicable branch rule for an engagement signal.
 */
function getBranchRule(signal: EngagementSignalType, rules?: StepBranchRules): BranchRule | null {
  if (!rules || signal === 'normal') return null;

  switch (signal) {
    case 'no_opens': return rules.no_opens || null;
    case 'opened_no_reply': return rules.opened_no_reply || null;
    case 'clicked': return rules.clicked || null;
    case 'multi_open': return rules.multi_open || null;
    default: return null;
  }
}

/**
 * Default adaptive behavior when no explicit branch rules are configured.
 * Applied automatically based on engagement patterns.
 */
function getDefaultAdaptiveBehavior(
  engagement: EngagementProfile
): { action: string; channel?: string; angle?: string; tone?: string } | null {
  switch (engagement.signal) {
    case 'no_opens':
      // After 2+ emails with zero opens, switch to a call
      if (engagement.total_sends >= 2) {
        return { action: 'switch_channel', channel: 'call' };
      }
      // After 1 email with no opens, regenerate with a different approach
      return { action: 'regenerate' };

    case 'opened_no_reply':
      // They're reading, try leveraging the angle they engaged with most
      if (engagement.most_opened_angle) {
        return {
          action: 'regenerate',
          angle: engagement.most_opened_angle,
          tone: 'friendly',
        };
      }
      return { action: 'regenerate' };

    case 'clicked':
      // They're interested — use a direct CTA approach
      return { action: 'regenerate', tone: 'direct' };

    case 'multi_open':
      // They keep re-reading — be more direct with a clear CTA
      return { action: 'regenerate', tone: 'direct' };

    default:
      return null;
  }
}

/**
 * Pick an alternate angle that hasn't been tried yet.
 */
function pickAlternateAngle(previousAngles: string[], currentAngle: string): string {
  const allAngles = ['missed_calls', 'commission_savings', 'delivery_ops', 'tech_consolidation', 'customer_experience'];
  const untried = allAngles.filter(a => !previousAngles.includes(a) && a !== currentAngle);
  if (untried.length > 0) return untried[0];
  // All angles tried, return one that was least recently used
  return allAngles.find(a => a !== currentAngle) || currentAngle;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a task in the queue when engagement-adaptive logic switches to a non-email channel.
 */
async function createTaskForStep(
  email: { id: number; lead_id: number; template_id: number; step_number: number; body: string; channel: string },
  channel: string,
  engagement: EngagementProfile,
): Promise<number | null> {
  const leadRow = await query<{
    lead_id: number;
    contact_name: string | null;
    contact_email: string | null;
    business_name: string | null;
    phone: string | null;
  }>(
    `SELECT lead_id, contact_name, contact_email, business_name, phone
     FROM bdr.leads WHERE lead_id = $1`,
    [email.lead_id]
  );

  if (leadRow.length === 0) return null;
  const ld = leadRow[0];

  // Find or create CRM contact
  let contactId = await findOrCreateContact(email.lead_id, ld);
  if (!contactId) return null;

  const taskType = channel === 'call' || channel === 'phone' ? 'call' :
                   channel === 'linkedin' ? 'linkedin_message' :
                   channel === 'sms' ? 'sms' : 'manual';

  // Build instructions with engagement context
  const engagementNote = engagement.signal !== 'normal'
    ? `\n\n📊 ENGAGEMENT CONTEXT: ${formatEngagementNote(engagement)}`
    : '';

  const taskTitle = `${channel.toUpperCase()}: ${ld.contact_name || 'Prospect'} @ ${ld.business_name || 'Unknown'} (Step ${email.step_number})`;
  const instructions = (email.body || `${channel} outreach for ${ld.business_name}`) + engagementNote;

  // Higher priority for warm leads (clicked = highest, multi_open = high)
  const priority = engagement.signal === 'clicked' ? 0 :
                   engagement.signal === 'multi_open' ? 0 :
                   1;

  const taskResult = await query<{ task_id: number }>(
    `INSERT INTO crm.task_queue (contact_id, task_type, title, instructions, priority, status, due_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
     RETURNING task_id`,
    [contactId, taskType, taskTitle, instructions, priority]
  );

  return taskResult[0]?.task_id || null;
}

/**
 * Format engagement data into a readable note for task instructions.
 */
function formatEngagementNote(engagement: EngagementProfile): string {
  switch (engagement.signal) {
    case 'no_opens':
      return `Lead has NOT opened ${engagement.total_sends} email(s). Email may not be reaching inbox or subject lines aren't compelling. Try a phone call or LinkedIn connection.`;
    case 'opened_no_reply':
      return `Lead opened ${engagement.total_opens}x across ${engagement.total_sends} emails but hasn't replied. ${engagement.most_opened_angle ? `Most engaged with "${engagement.most_opened_angle.replace(/_/g, ' ')}" angle.` : ''} They're interested but need a different push.`;
    case 'clicked':
      return `WARM LEAD -- Clicked ${engagement.total_clicks} link(s)! They're actively exploring the product. Strike while iron is hot.`;
    case 'multi_open':
      return `Lead has opened emails ${engagement.total_opens}x (${engagement.open_rate}% open rate). They keep re-reading — very interested but hesitant. Offer a specific, low-friction next step.`;
    default:
      return `Standard outreach. ${engagement.total_sends} emails sent, ${engagement.total_opens} opens.`;
  }
}

/**
 * Find or create a CRM contact linked to a BDR lead.
 */
async function findOrCreateContact(
  leadId: number,
  ld: { contact_name: string | null; contact_email: string | null; business_name: string | null; phone: string | null }
): Promise<number | null> {
  // Try by bdr_lead_id
  const existing = await query<{ contact_id: number }>(
    `SELECT contact_id FROM crm.contacts WHERE bdr_lead_id = $1::text LIMIT 1`,
    [leadId]
  );
  if (existing.length > 0) return existing[0].contact_id;

  // Try by email
  if (ld.contact_email) {
    const emailMatch = await query<{ contact_id: number }>(
      `SELECT contact_id FROM crm.contacts WHERE email = $1 LIMIT 1`,
      [ld.contact_email]
    );
    if (emailMatch.length > 0) {
      await query(
        `UPDATE crm.contacts SET bdr_lead_id = $1::text, updated_at = NOW() WHERE contact_id = $2`,
        [leadId, emailMatch[0].contact_id]
      );
      return emailMatch[0].contact_id;
    }
  }

  // Create new contact
  const nameParts = (ld.contact_name || '').split(' ');
  const newContact = await query<{ contact_id: number }>(
    `INSERT INTO crm.contacts (email, first_name, last_name, business_name, phone, lifecycle_stage, bdr_lead_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'outreach', $6::text, NOW(), NOW())
     RETURNING contact_id`,
    [ld.contact_email, nameParts[0] || null, nameParts.slice(1).join(' ') || null, ld.business_name, ld.phone, leadId]
  );

  return newContact[0]?.contact_id || null;
}

/**
 * Auto-send a campaign email: create email_sends, preprocess tracking, fire webhook.
 */
async function autoSendEmail(
  email: { id: number; lead_id: number; template_id: number; step_number: number; subject: string; body: string; angle: string },
  leadData: { contact_email: string; contact_name: string; business_name: string },
  fromEmail: string = 'sales@example.com',
  senderName?: string,
  senderTitle?: string,
  savedSignature?: string | null,
) {
  const sendRows = await query<{ id: string }>(
    `INSERT INTO bdr.email_sends (lead_id, to_email, from_email, subject, body, angle, email_type, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'bdr_campaign', NOW())
     RETURNING id`,
    [email.lead_id, leadData.contact_email, fromEmail, email.subject, email.body, email.angle]
  );

  const sendId = sendRows[0]?.id;
  if (!sendId) throw new Error('No send ID returned');

  const signature = savedSignature
    ? `<br/><br/>${savedSignature}`
    : buildSignatureHtml(senderName, senderTitle, fromEmail);
  const trackedHtml = preprocessEmail(email.body + signature, sendId, false);

  const webhookUrl = `${N8N_BASE_URL}/webhook/dashboard-send-approved`;

  await fetchWithTimeout(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      send_id: sendId,
      lead_id: email.lead_id,
      to: leadData.contact_email,
      from: fromEmail,
      subject: email.subject,
      body_html: trackedHtml,
      body_plain: email.body,
      contact_name: leadData.contact_name,
      business_name: leadData.business_name,
      angle: email.angle,
      campaign_step: email.step_number,
    }),
    timeout: 30000,
  });

  await query(
    `UPDATE bdr.campaign_emails SET status = 'sent', send_id = $1::uuid, sent_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [sendId, email.id]
  );

  await query(
    `UPDATE bdr.leads SET status = 'sent', campaign_step = $1, updated_at = NOW() WHERE lead_id = $2`,
    [email.step_number, email.lead_id]
  );
}

/**
 * Load a campaign email step onto the lead for manual review in the queue.
 */
async function loadOntoLeadForReview(email: {
  id: number;
  lead_id: number;
  template_id: number;
  step_number: number;
  subject: string;
  body: string;
  angle: string;
}) {
  await query(
    `UPDATE bdr.campaign_emails SET status = 'ready', updated_at = NOW() WHERE id = $1`,
    [email.id]
  );

  await query(
    `UPDATE bdr.leads
     SET email_subject = $1, email_body = $2, email_angle = $3,
         campaign_step = $4, status = 'email_ready', updated_at = NOW()
     WHERE lead_id = $5`,
    [email.subject, email.body, email.angle, email.step_number, email.lead_id]
  );
}

/**
 * Schedule the next campaign step for a lead.
 * Supports optional delay reduction from engagement-adaptive acceleration.
 * Applies send time optimization if historical data is available.
 */
async function scheduleNextStep(leadId: number, templateId: number, currentStep: number, delayReduction: number = 0) {
  const nextEmail = await query<{ id: number; delay_days: number; step_number: number; channel: string }>(
    `SELECT id, delay_days, step_number, channel FROM bdr.campaign_emails
     WHERE lead_id = $1 AND template_id = $2 AND step_number = $3 AND status = 'pending'`,
    [leadId, templateId, currentStep + 1]
  );

  if (nextEmail.length > 0) {
    const next = nextEmail[0];
    const effectiveDelay = Math.max(1, next.delay_days - delayReduction);

    // Apply send time optimization for email steps
    if (next.channel === 'email') {
      const optimalHour = await getOptimalSendHour(leadId);
      if (optimalHour !== null) {
        // Schedule at the optimal hour on the target day
        // Calculate: base date + delay days, then set to optimal hour PST
        await query(
          `UPDATE bdr.campaign_emails
           SET status = 'scheduled',
               scheduled_at = (DATE(NOW() AT TIME ZONE 'America/Los_Angeles') + INTERVAL '1 day' * $2 + INTERVAL '1 hour' * $3)::timestamp AT TIME ZONE 'America/Los_Angeles',
               updated_at = NOW()
           WHERE id = $1`,
          [next.id, effectiveDelay, optimalHour]
        );
      } else {
        await query(
          `UPDATE bdr.campaign_emails
           SET status = 'scheduled', scheduled_at = NOW() + INTERVAL '1 day' * $2, updated_at = NOW()
           WHERE id = $1`,
          [next.id, effectiveDelay]
        );
      }
    } else {
      await query(
        `UPDATE bdr.campaign_emails
         SET status = 'scheduled', scheduled_at = NOW() + INTERVAL '1 day' * $2, updated_at = NOW()
         WHERE id = $1`,
        [next.id, effectiveDelay]
      );
    }
  }
}

/**
 * Determine the optimal send hour for a lead based on historical engagement data.
 * Returns hour in PST (0-23) or null if insufficient data.
 *
 * Strategy:
 * 1. Check lead's tier-specific hourly open rates
 * 2. Fall back to overall best-performing hours
 * 3. Returns null if < 20 total sends in dataset (insufficient data)
 */
async function getOptimalSendHour(leadId: number): Promise<number | null> {
  // Get lead's tier
  const leadRow = await query<{ tier: string | null }>(
    `SELECT tier FROM bdr.leads WHERE lead_id = $1`,
    [leadId]
  );
  const tier = leadRow[0]?.tier;

  // Try tier-specific optimal hour first
  if (tier) {
    const tierBest = await query<{ hour: number; open_rate: number; sent: number }>(`
      SELECT
        EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')::int as hour,
        ROUND(COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::float as open_rate,
        COUNT(*)::int as sent
      FROM bdr.email_sends es
      JOIN bdr.leads l ON l.lead_id = es.lead_id
      WHERE es.sent_at >= NOW() - INTERVAL '90 days'
        AND es.sent_at IS NOT NULL
        AND l.tier = $1
      GROUP BY EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')
      HAVING COUNT(*) >= 5
      ORDER BY open_rate DESC
      LIMIT 1
    `, [tier]);

    if (tierBest.length > 0 && tierBest[0].sent >= 5) {
      return tierBest[0].hour;
    }
  }

  // Fall back to overall best hour
  const overallBest = await query<{ hour: number; open_rate: number; sent: number }>(`
    SELECT
      EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')::int as hour,
      ROUND(COUNT(CASE WHEN es.open_count > 0 THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1)::float as open_rate,
      COUNT(*)::int as sent
    FROM bdr.email_sends es
    WHERE es.sent_at >= NOW() - INTERVAL '90 days'
      AND es.sent_at IS NOT NULL
    GROUP BY EXTRACT(HOUR FROM es.sent_at AT TIME ZONE 'America/Los_Angeles')
    HAVING COUNT(*) >= 10
    ORDER BY open_rate DESC
    LIMIT 1
  `);

  if (overallBest.length > 0 && overallBest[0].sent >= 10) {
    // Only return if hour is within business hours (7am-6pm PST)
    const h = overallBest[0].hour;
    if (h >= 7 && h <= 18) return h;
  }

  return null; // Insufficient data, use default scheduling
}

// ═══════════════════════════════════════════════════════════════════════════
// AI CHANNEL STEP HANDLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Trigger an AI Chat step by generating a tracking link.
 * The link is embedded in the next email or sent as a standalone notification.
 */
async function triggerAIChatStep(
  email: { id: number; lead_id: number; template_id: number; step_number: number },
  engagement: EngagementProfile,
) {
  const leadRow = await query<{
    contact_email: string | null;
    contact_name: string | null;
    business_name: string | null;
    tier: string | null;
    org_id: number;
  }>(
    `SELECT contact_email, contact_name, business_name, tier, org_id FROM bdr.leads WHERE lead_id = $1`,
    [email.lead_id]
  );
  if (leadRow.length === 0) return;
  const ld = leadRow[0];

  // Get the template step definition for angle/variant
  const stepRow = await query<{ angle: string | null; tone: string | null }>(
    `SELECT angle, tone FROM bdr.campaign_emails WHERE id = $1`,
    [email.id]
  );
  const angle = stepRow[0]?.angle || null;

  // Generate tracking link via the chat-link API
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';
  const res = await fetchWithTimeout(`${baseUrl}/api/campaigns/chat-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: email.lead_id,
      campaign_email_id: email.id,
      campaign_template_id: email.template_id,
      campaign_step: email.step_number,
      tier: ld.tier,
      angle,
      variant: null,
      business_name: ld.business_name,
      contact_name: ld.contact_name,
      contact_email: ld.contact_email,
      org_id: ld.org_id,
    }),
    timeout: 15000,
  });

  const data = await res.json();
  if (!data.chat_link) throw new Error('Failed to generate chat link');

  // Record touchpoint
  const contactId = await findOrCreateContact(email.lead_id, {
    contact_name: ld.contact_name,
    contact_email: ld.contact_email,
    business_name: ld.business_name,
    phone: null,
  });
  if (contactId) {
    await query(
      `INSERT INTO crm.touchpoints (contact_id, channel, event_type, direction, source_system, subject, metadata, occurred_at)
       VALUES ($1, 'ai_chat', 'chat_link_sent', 'outbound', 'campaign',
               'AI chat link generated',
               jsonb_build_object('lead_id', $2, 'campaign_step', $3, 'tracking_token', $4, 'engagement_signal', $5),
               NOW())`,
      [contactId, email.lead_id, email.step_number, data.tracking_token, engagement.signal]
    );
  }
}

/**
 * Trigger an AI Call step by invoking the voice agent.
 */
async function triggerAICallStep(
  email: { id: number; lead_id: number; template_id: number; step_number: number },
  engagement: EngagementProfile,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || '';

  // Use the voice-trigger API to initiate the call
  const res = await fetchWithTimeout(`${baseUrl}/api/campaigns/voice-trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lead_id: email.lead_id,
      campaign_email_id: email.id,
      trigger_reason: 'campaign_step',
      campaign_template_id: email.template_id,
      campaign_step: email.step_number,
    }),
    timeout: 30000,
  });

  const data = await res.json();
  if (data.error) {
    console.warn(`[process-scheduled] AI call trigger warning for lead ${email.lead_id}:`, data.error);
    // If voice agent is unavailable, fall back to creating a human call task
    if (data.fallback === 'task_created') return;
    throw new Error(data.error);
  }
}
