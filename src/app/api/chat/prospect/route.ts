import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { prospectChat, extractQualificationSlots, BrainCallPattern } from '@/lib/ai';
import { computeROI, formatROIForChat, buildCalculatorURL } from '@/lib/roi';
import { generateROIChart } from '@/lib/roi-chart';
import { lookupBusiness, formatBusinessContext } from '@/lib/business-lookup';
import { loadSocialProof } from '@/lib/social-proof';
import {
  getCachedBrainContent, setCachedBrainContent,
  getCachedCallPatterns, setCachedCallPatterns,
  getCachedLiveStats, setCachedLiveStats,
  getCachedROI, setCachedROI,
} from '@/lib/brain-cache';
import { computeAvailableSlots, createBooking } from '@/lib/scheduling';
import crypto from 'crypto';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';
import {
  checkGuardrails,
  detectEscalation,
  scoreConversationQuality,
  checkChatbotLengthControl,
  redactConversation,
  type EscalationSignal,
  type ConversationQualityScore,
} from '@/lib/guardrails';

// ─── Calendar Tool Definitions for AI Agent ─────────────────────────────────

const CALENDAR_TOOLS = [
  {
    name: 'check_availability',
    description: 'Check available time slots for booking a demo. Call this when the prospect mentions wanting to book or suggests a specific day.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Date to check in YYYY-MM-DD format' },
        timezone: { type: 'string', description: 'IANA timezone string, e.g. America/New_York' },
        preferred_time: { type: 'string', description: 'Preferred time in HH:MM 24h format, e.g. 14:00 for 2pm. Pass this when the prospect mentions a specific time.' },
      },
      required: ['date', 'timezone'],
    },
  },
  {
    name: 'book_demo',
    description: 'Book a demo meeting at a specific time. Call this after the prospect has chosen a time slot from the availability results.',
    input_schema: {
      type: 'object' as const,
      properties: {
        starts_at: { type: 'string', description: 'ISO 8601 timestamp for the meeting start time' },
        name: { type: 'string', description: 'Prospect contact name' },
        email: { type: 'string', description: 'Prospect email address' },
        phone: { type: 'string', description: 'Prospect phone number (optional)' },
        business_name: { type: 'string', description: 'Restaurant or business name (required if known)' },
      },
      required: ['starts_at', 'name', 'email'],
    },
  },
];

/**
 * Build a tool executor that uses the scheduling engine directly.
 * Requires the org's active event type ID to be resolved first.
 */
function buildToolExecutor(eventTypeId: number, timezone: string) {
  return async (toolName: string, input: Record<string, unknown>): Promise<string> => {
    if (toolName === 'check_availability') {
      const date = input.date as string;
      const tz = (input.timezone as string) || timezone || 'America/New_York';
      const preferredTime = input.preferred_time as string | undefined; // e.g. "14:00"
      try {
        const result = await computeAvailableSlots(eventTypeId, date, tz);
        if (result.slots.length === 0) {
          return JSON.stringify({ available: false, message: 'No slots available on this date', slots: [] });
        }
        // Return all slots — typically 20-30 per day, manageable context
        const allSlots = result.slots.map(s => s.start);
        // Check if preferred time is in the list
        const prefAvailable = preferredTime ? allSlots.some(s => s.includes(`T${preferredTime}`)) : undefined;
        return JSON.stringify({
          available: true,
          preferred_available: prefAvailable,
          slots: allSlots,
          total_slots: result.slots.length,
          timezone: tz,
        });
      } catch (err) {
        console.error('[chat/prospect] check_availability error:', err);
        return JSON.stringify({ error: 'Could not check availability. Suggest the prospect provide their contact info for manual follow-up.' });
      }
    }

    if (toolName === 'book_demo') {
      const startsAt = input.starts_at as string;
      const name = input.name as string;
      const email = input.email as string;
      const phone = (input.phone as string) || undefined;
      const tz = timezone || 'America/New_York';
      try {
        const businessName = (input.business_name as string) || undefined;
        const result = await createBooking({
          event_type_id: eventTypeId,
          starts_at: startsAt,
          timezone: tz,
          name,
          email,
          phone,
          business_name: businessName,
        });
        return JSON.stringify({
          success: true,
          booking_id: result.booking_id,
          meeting_url: result.meeting_url,
          starts_at: result.starts_at,
          ends_at: result.ends_at,
        });
      } catch (err) {
        console.error('[chat/prospect] book_demo error:', err);
        return JSON.stringify({ error: 'Booking failed. Ask the prospect for their contact info so the team can follow up manually.' });
      }
    }

    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  };
}

/**
 * Detect terminal conversation state from messages and reply content.
 * Returns null if conversation is still in progress.
 */
function detectTerminalState(
  messages: Array<{ role: string; content: string }>,
  replyText: string,
  leadCaptured: boolean,
): 'demo_booked' | 'lead_captured' | 'abandoned' | null {
  if (replyText.includes('[BOOK_DEMO]') || /\[BOOK_MEETING:[^\]]+\]/.test(replyText)) return 'demo_booked';
  if (leadCaptured) return 'lead_captured';

  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length >= 15) return 'abandoned';

  const lastUserMsg = userMessages[userMessages.length - 1]?.content?.toLowerCase() || '';
  const goodbyePatterns = [
    /\b(bye|goodbye|not interested|no thanks|no thank you|stop|leave me alone)\b/i,
    /\b(don'?t (want|need)|not (looking|right now))\b/i,
  ];
  if (goodbyePatterns.some(p => p.test(lastUserMsg))) return 'abandoned';

  return null;
}

/**
 * Fire-and-forget: store conversation outcome for the feedback loop.
 */
async function trackConversationOutcome(payload: {
  conversation_id: string;
  messages: Array<{ role: string; content: string }>;
  terminal_state: string;
  qualification_slots: Record<string, unknown>;
  lead_info?: { name?: string; email?: string; company?: string };
  roi_presented: boolean;
  visitor_context?: Record<string, unknown>;
  orgId: number;
}): Promise<void> {
  try {
    const slots = payload.qualification_slots;
    const qualFields = ['orders_per_week', 'aov', 'commission_tier', 'restaurant_type', 'name', 'email', 'company'];
    const filledSlots = qualFields.filter(f => slots[f] !== undefined && slots[f] !== null).length;
    const qualificationCompleteness = Math.round((filledSlots / qualFields.length) * 100);

    await query(
      `INSERT INTO brain.conversation_outcomes
        (conversation_id, org_id, started_at, ended_at, messages_count,
         qualification_completeness, demo_booked, lead_captured,
         terminal_state, qualification_slots, roi_presented, visitor_context)
       VALUES ($1, $2, NOW() - INTERVAL '1 minute' * $3, NOW(), $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (conversation_id) DO UPDATE SET
         ended_at = NOW(),
         messages_count = $3,
         qualification_completeness = $4,
         demo_booked = $5,
         lead_captured = $6,
         terminal_state = $7,
         qualification_slots = $8,
         roi_presented = $9,
         updated_at = NOW()`,
      [
        payload.conversation_id,
        payload.orgId,
        payload.messages.length,
        qualificationCompleteness,
        payload.terminal_state === 'demo_booked',
        !!payload.lead_info?.email,
        payload.terminal_state,
        JSON.stringify(slots),
        payload.roi_presented,
        JSON.stringify(payload.visitor_context || {}),
      ],
    );
  } catch (err) {
    console.error('[chat/prospect] outcome tracking error:', err);
  }
}

/**
 * POST /api/chat/prospect
 * Public (no auth) chat endpoint for prospect-facing sales assistant.
 * Loads brain content, calls Claude, captures lead info.
 * Now tracks conversation outcomes for the feedback loop (Session 3).
 */
export async function POST(request: NextRequest) {
  // Rate limit — public endpoint, extra important
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
  if (rateLimitResponse) return rateLimitResponse;

  // Step 1: Parse request body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch (parseErr) {
    console.error('[chat/prospect] request body parse error:', parseErr);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { message, history, lead_info, visitor_context, campaign_context, demo_mode, demo_qualification, timezone } = body as {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    lead_info?: { name?: string; email?: string; company?: string };
    visitor_context?: {
      page_url?: string;
      referrer_url?: string;
      utm_source?: string;
      utm_medium?: string;
      utm_campaign?: string;
      utm_term?: string;
      utm_content?: string;
    };
    campaign_context?: {
      campaign_template_id?: number;
      campaign_step?: number;
      lead_id?: number;
      tier?: string;
      angle?: string;
      variant?: string;
      business_name?: string;
      contact_name?: string;
      tracking_token?: string;
      source?: string; // 'campaign'
    };
    /** Session 10: Demo mode flag */
    demo_mode?: boolean;
    /** Session 10: Pre-seeded qualification for demo mode */
    demo_qualification?: {
      orders_per_week?: number;
      aov?: number;
      commission_tier?: number;
      restaurant_type?: string;
    };
    /** Browser timezone from client (Intl.DateTimeFormat) */
    timezone?: string;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  try {
    // Resolve org for brain content scoping
    // Public chatbot uses org_slug param or defaults to org_id=1
    const orgSlug = (body as Record<string, unknown>).org_slug as string | undefined;
    let chatOrgId = 1; // default org for backward compatibility
    if (orgSlug) {
      const org = await query<{ org_id: number }>(
        `SELECT org_id FROM crm.organizations WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
        [orgSlug]
      );
      if (org.length > 0) chatOrgId = org[0].org_id;
    }

    // Session 8: Load scheduling_provider setting from org
    let schedulingProvider: 'built_in' | 'calendly' = 'calendly';
    try {
      const orgSettings = await query<{ settings: Record<string, unknown> }>(
        `SELECT settings FROM crm.organizations WHERE org_id = $1 LIMIT 1`,
        [chatOrgId]
      );
      if (orgSettings.length > 0 && orgSettings[0].settings?.scheduling_provider === 'built_in') {
        schedulingProvider = 'built_in';
      }
    } catch { /* continue with default */ }

    // Step 2: Load active brain content + live sales intelligence — scoped to org (Session 10: cached)
    let brainContent: Array<Record<string, unknown>> = [];
    const cachedBrain = getCachedBrainContent(chatOrgId);
    if (cachedBrain) {
      brainContent = cachedBrain;
    } else {
      try {
        brainContent = await query<Record<string, unknown>>(
          `SELECT content_type, title, raw_text, key_claims, value_props, pain_points_addressed
           FROM brain.internal_content
           WHERE is_active = true AND org_id = $1
           ORDER BY updated_at DESC NULLS LAST
           LIMIT 30`,
          [chatOrgId]
        );
        setCachedBrainContent(chatOrgId, brainContent);
      } catch {
        // Brain tables may not exist yet — continue without knowledge base
      }
    }

    // Also pull live deal stats and top phrases — scoped to org (Session 10: cached)
    const cachedStats = getCachedLiveStats(chatOrgId);
    if (cachedStats) {
      if (cachedStats.dealStats) {
        brainContent.push({
          content_type: 'live_stats',
          title: 'Current Sales Metrics (live)',
          raw_text: `Right now: ${cachedStats.dealStats.won} businesses onboarded, ${cachedStats.dealStats.win_rate}% conversion from demo to close, average customer invests $${cachedStats.dealStats.avg_mrr}/month.`,
          key_claims: [], value_props: [], pain_points_addressed: [],
        });
      }
      if (cachedStats.topPhrases && cachedStats.topPhrases.length > 0) {
        brainContent.push({
          content_type: 'live_stats',
          title: 'Top Converting Conversation Approaches (live)',
          raw_text: cachedStats.topPhrases.map(p => `[${p.category}] "${p.phrase}" — +${p.win_rate_lift}% conversion lift`).join('\n'),
          key_claims: [], value_props: [], pain_points_addressed: [],
        });
      }
    } else {
      try {
        const [dealRow] = await query<{ win_rate: number; avg_mrr: number; won: number }>(`
          SELECT
            round(100.0 * count(CASE WHEN outcome='won' THEN 1 END) / NULLIF(count(CASE WHEN outcome IN ('won','lost') THEN 1 END), 0), 1) as win_rate,
            round(avg(CASE WHEN outcome='won' THEN mrr END), 0) as avg_mrr,
            count(CASE WHEN outcome='won' THEN 1 END) as won
          FROM public.deals
          WHERE org_id = $1
        `, [chatOrgId]);

        const topPhrases = await query<{ phrase: string; win_rate_lift: number; category: string }>(`
          SELECT phrase, win_rate_lift, category
          FROM public.phrase_stats
          WHERE win_rate_lift > 15
            AND org_id = $1
          ORDER BY win_rate_lift DESC
          LIMIT 10
        `, [chatOrgId]);

        // Cache the results
        setCachedLiveStats(chatOrgId, {
          dealStats: dealRow || undefined,
          topPhrases: topPhrases.length > 0 ? topPhrases : undefined,
        });

        if (dealRow) {
          brainContent.push({
            content_type: 'live_stats',
            title: 'Current Sales Metrics (live)',
            raw_text: `Right now: ${dealRow.won} businesses onboarded, ${dealRow.win_rate}% conversion from demo to close, average customer invests $${dealRow.avg_mrr}/month.`,
            key_claims: [], value_props: [], pain_points_addressed: [],
          });
        }
        if (topPhrases.length > 0) {
          brainContent.push({
            content_type: 'live_stats',
            title: 'Top Converting Conversation Approaches (live)',
            raw_text: topPhrases.map(p => `[${p.category}] "${p.phrase}" — +${p.win_rate_lift}% conversion lift`).join('\n'),
            key_claims: [], value_props: [], pain_points_addressed: [],
          });
        }
      } catch {
        // Live stats unavailable — continue with brain content only
      }
    }

    // Step 2.5: Load top-performing call patterns from brain (Session 10: cached)
    let callPatterns: BrainCallPattern[] = [];
    const cachedPatterns = getCachedCallPatterns<BrainCallPattern>(chatOrgId);
    if (cachedPatterns) {
      callPatterns = cachedPatterns;
    } else {
      try {
        callPatterns = await query<BrainCallPattern>(
          `SELECT id, pattern_type, pattern_text, context, effectiveness_score, times_referenced, owner_email
           FROM brain.call_patterns
           WHERE org_id = $1
             AND effectiveness_score >= 0.4
           ORDER BY effectiveness_score DESC, times_referenced DESC
           LIMIT 40`,
          [chatOrgId]
        );
        setCachedCallPatterns(chatOrgId, callPatterns);
      } catch {
        // brain.call_patterns may not exist yet — continue without playbook patterns
      }
    }

    // Step 2.6 (Session 10): Load social proof stats
    let socialProofContext = '';
    try {
      const socialProof = await loadSocialProof(chatOrgId);
      if (socialProof?.statementForChat) {
        socialProofContext = socialProof.statementForChat;
      }
    } catch { /* social proof unavailable */ }

    // Step 2.7 (Session 10): Business lookup — if prospect mentioned a restaurant name
    let businessContext = '';
    const allUserMsgs = [...(history || []), { role: 'user' as const, content: message }]
      .filter(m => m.role === 'user')
      .map(m => m.content);
    // Look for restaurant name mentions in the last 2 user messages
    const recentUserText = allUserMsgs.slice(-2).join(' ');
    const restaurantNameMatch = recentUserText.match(
      /(?:called|named|it's|we're|I (?:own|run|have|manage))\s+([A-Z][A-Za-z'\s&]{2,35})(?:\s*(?:restaurant|pizza|grill|cafe|kitchen|deli|bakery|bistro|eatery|bar))?/i
    );
    if (restaurantNameMatch && !businessContext) {
      try {
        const result = await lookupBusiness(restaurantNameMatch[1].trim());
        if (result) {
          businessContext = formatBusinessContext(result);
        }
      } catch { /* lookup failed — non-critical */ }
    }

    // Step 3: Build messages array for Claude (history + current message)
    const chatMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...(history || []),
      { role: 'user' as const, content: message },
    ];

    // Step 3.1 (Session 8): Input guardrail check — PII and off-topic fences
    const inputGuardrail = checkGuardrails(message);
    if (inputGuardrail && inputGuardrail.severity === 'hard') {
      // Hard guardrail violation (PII) — return redirect without calling Claude
      const conversationId = (body as Record<string, unknown>).conversation_id as string
        || `conv_${crypto.randomBytes(8).toString('hex')}`;
      return NextResponse.json({
        reply: inputGuardrail.redirect,
        lead_captured: false,
        detected_info: null,
        suggested_prompts: null,
        qualification: null,
        calculator_url: null,
        conversation_id: conversationId,
        terminal_state: null,
        guardrail_triggered: { fence: inputGuardrail.fence, trigger: inputGuardrail.trigger },
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Step 3.2 (Session 8): Escalation detection
    const escalation: EscalationSignal = detectEscalation(
      message,
      history || [],
    );

    // Step 3.3 (Session 8): Conversation quality scoring
    const previousQuality = (body as Record<string, unknown>).previous_quality_score as ConversationQualityScore | undefined;
    const currentStage = (body as Record<string, unknown>).current_stage as string || 'discovery';
    const qualityScore = scoreConversationQuality(
      chatMessages,
      currentStage,
      lead_info as Record<string, unknown> || {},
      previousQuality,
    );

    // Step 3.4 (Session 8): Length controls
    const hasProgressed = !previousQuality || qualityScore.pipelineAdvancement > previousQuality.pipelineAdvancement;
    const lengthControl = checkChatbotLengthControl(chatMessages, hasProgressed);

    // Step 3.5: Extract qualification slots from conversation history
    const qualificationSlots = extractQualificationSlots(chatMessages, lead_info);

    // Step 3.5a (Session 10): Demo mode — pre-fill qualification slots for demo
    if (demo_mode && demo_qualification) {
      if (demo_qualification.orders_per_week) qualificationSlots.orders_per_week = demo_qualification.orders_per_week;
      if (demo_qualification.aov) qualificationSlots.aov = demo_qualification.aov;
      if (demo_qualification.commission_tier) qualificationSlots.commission_tier = demo_qualification.commission_tier;
      if (demo_qualification.restaurant_type) qualificationSlots.restaurant_type = demo_qualification.restaurant_type;
    }

    // Step 3.5b (Session 9): Enrich from campaign context — pre-fill lead info and load prior engagement
    let campaignGreeting: string | undefined;
    if (campaign_context?.source === 'campaign') {
      // Pre-fill lead info from campaign context
      if (campaign_context.contact_name && !lead_info?.name) {
        qualificationSlots.name = campaign_context.contact_name;
      }
      if (campaign_context.business_name && !qualificationSlots.company) {
        qualificationSlots.company = campaign_context.business_name;
      }

      // Load the campaign step definition for greeting
      if (campaign_context.tracking_token) {
        try {
          const stepRows = await query<{ campaign_context: Record<string, unknown> }>(
            `SELECT campaign_context FROM bdr.campaign_ai_steps
             WHERE tracking_token = $1 AND channel = 'ai_chat'`,
            [campaign_context.tracking_token]
          );
          if (stepRows.length > 0) {
            const ctx = stepRows[0].campaign_context as Record<string, unknown>;
            // Mark as chat_started if not already
            await query(
              `UPDATE bdr.campaign_ai_steps SET status = 'chat_started', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
               WHERE tracking_token = $1 AND status IN ('pending', 'link_sent', 'chat_started')`,
              [campaign_context.tracking_token]
            );
            // Pull any prior email engagement for context
            if (campaign_context.lead_id) {
              const emailHistory = await query<{ subject: string; angle: string; open_count: number }>(
                `SELECT subject, angle, open_count FROM bdr.email_sends
                 WHERE lead_id = $1 AND sent_at IS NOT NULL ORDER BY sent_at DESC LIMIT 3`,
                [campaign_context.lead_id]
              );
              if (emailHistory.length > 0) {
                brainContent.push({
                  content_type: 'campaign_context',
                  title: 'Campaign Email History (for this prospect)',
                  raw_text: `This prospect came from a campaign email. Prior emails:\n${emailHistory.map(e =>
                    `- Subject: "${e.subject}" (angle: ${e.angle}, ${e.open_count > 0 ? 'opened' : 'not opened'})`
                  ).join('\n')}\n\nCampaign angle: ${campaign_context.angle || 'general'}. Tier: ${campaign_context.tier || 'unknown'}.`,
                  key_claims: [],
                  value_props: [],
                  pain_points_addressed: [],
                });
              }
            }
          }
        } catch {
          // Campaign step lookup failed — continue without campaign enrichment
        }
      }

      // Build personalized greeting based on campaign context
      const name = campaign_context.contact_name;
      const angle = campaign_context.angle;
      if (chatMessages.length <= 1) {
        // First message in conversation — the AI should acknowledge the campaign
        const greetings: Record<string, string> = {
          roi_savings: `Hey${name ? ` ${name}` : ''}! I saw you were checking out our delivery cost analysis — want me to run the numbers for your operation?`,
          pain_point: `Hi${name ? ` ${name}` : ''}! I work with restaurants on delivery challenges. What's your biggest headache with delivery right now?`,
          case_study: `Hey${name ? ` ${name}` : ''}! Glad you're here. I've got some great results from restaurants similar to yours — want to see what they achieved?`,
          product_demo: `Hi${name ? ` ${name}` : ''}! Ready to see how the platform works? I can walk you through it in about 2 minutes.`,
          growth_opportunity: `Hey${name ? ` ${name}` : ''}! Looks like you're thinking about scaling delivery — that's exciting. What's your current setup?`,
          ease_of_use: `Hi${name ? ` ${name}` : ''}! Getting started with delivery management is easier than you'd think. Want me to show you how?`,
          competitor_comparison: `Hey${name ? ` ${name}` : ''}! Curious about what it'd look like to keep more of your delivery revenue? I can break down the numbers.`,
        };
        campaignGreeting = greetings[angle || ''] || `Hey${name ? ` ${name}` : ''}! Thanks for checking us out. What can I help you with?`;
      }
    }

    // Step 3.6: Compute ROI when we have the 3 core slots (Session 10: cached + chart)
    let roiContext: string | undefined;
    let calculatorURL: string | undefined;
    let roiChartSvg: string | undefined;
    if (
      qualificationSlots.orders_per_week &&
      qualificationSlots.aov &&
      qualificationSlots.commission_tier
    ) {
      const monthlyDeliveries = qualificationSlots.orders_per_week * 4;
      const roiInput = {
        orderValue: qualificationSlots.aov,
        monthlyDeliveries,
        commissionRate: qualificationSlots.commission_tier / 100,
      };

      // Session 10: Check ROI cache first
      const roiCacheKey = {
        ordersPerWeek: qualificationSlots.orders_per_week,
        aov: qualificationSlots.aov,
        commissionRate: qualificationSlots.commission_tier / 100,
      };
      const cachedROI = getCachedROI(roiCacheKey);
      if (cachedROI) {
        roiContext = cachedROI;
      } else {
        const roi = computeROI(roiInput);
        roiContext = formatROIForChat(roi, roiInput);
        setCachedROI(roiCacheKey, roiContext);

        // Session 10: Generate ROI chart SVG
        try {
          roiChartSvg = generateROIChart(roi, 349); // Premium plan price
        } catch { /* chart generation is non-critical */ }
      }

      calculatorURL = buildCalculatorURL(roiInput);
    }

    // Step 3.6b (Session 10): Inject social proof + business context into brain
    if (socialProofContext) {
      brainContent.push({
        content_type: 'social_proof',
        title: 'Social Proof Statistics',
        raw_text: socialProofContext,
        key_claims: [], value_props: [], pain_points_addressed: [],
      });
    }
    if (businessContext) {
      brainContent.push({
        content_type: 'business_lookup',
        title: 'Real-Time Business Intelligence',
        raw_text: businessContext,
        key_claims: [], value_props: [], pain_points_addressed: [],
      });
    }

    // Step 3.8 (Session 8): Load event types for built-in scheduling context
    let schedulingCtx: { provider: 'built_in' | 'calendly'; eventTypes?: Array<{ name: string; slug: string; duration_minutes: number; description?: string | null }> } | undefined;
    if (schedulingProvider === 'built_in') {
      try {
        const eventTypes = await query<{ name: string; slug: string; duration_minutes: number; description: string | null }>(
          `SELECT name, slug, duration_minutes, description
           FROM crm.scheduling_event_types
           WHERE org_id = $1 AND is_active = true
           ORDER BY created_at ASC`,
          [chatOrgId]
        );
        schedulingCtx = { provider: 'built_in', eventTypes };
      } catch {
        schedulingCtx = { provider: 'built_in' };
      }
    }

    // Step 3.9: Build calendar tool config if built-in scheduling is available
    let toolConfig: { tools: typeof CALENDAR_TOOLS; executeTool: (name: string, input: Record<string, unknown>) => Promise<string> } | undefined;
    if (schedulingCtx?.provider === 'built_in' && schedulingCtx.eventTypes?.length) {
      const eventTypeId = await query<{ event_type_id: number }>(
        `SELECT event_type_id FROM crm.scheduling_event_types
         WHERE org_id = $1 AND is_active = true
         ORDER BY created_at ASC LIMIT 1`,
        [chatOrgId]
      );
      if (eventTypeId.length > 0) {
        const clientTimezone = timezone || 'America/New_York';
        toolConfig = {
          tools: CALENDAR_TOOLS,
          executeTool: buildToolExecutor(eventTypeId[0].event_type_id, clientTimezone),
        };
      }
    }

    // Step 4: Call Claude with qualification context + computed ROI + brain playbook + guardrail context
    let result: { reply: string; detected_info?: { name?: string; email?: string; company?: string }; suggested_prompts?: string[]; qualification?: Record<string, unknown> | undefined; tool_booking_success?: boolean };
    try {
      // If this is a campaign-triggered first message and we have a greeting, use it
      if (campaignGreeting && chatMessages.length <= 1 && message.trim().toLowerCase() === '__campaign_init__') {
        result = {
          reply: campaignGreeting,
          detected_info: campaign_context?.contact_name ? { name: campaign_context.contact_name } : undefined,
          suggested_prompts: [
            'Tell me about your delivery costs',
            'How does your platform work?',
            'What results have similar restaurants seen?',
          ],
        };
      } else {
        result = await prospectChat(
          chatMessages,
          brainContent,
          qualificationSlots,
          roiContext,
          undefined,
          callPatterns,
          { escalation, qualityScore, lengthControl },
          schedulingCtx,
          toolConfig,
        ) as typeof result;
      }
    } catch (aiErr) {
      console.error('[chat/prospect] Claude API error:', aiErr);
      return NextResponse.json(
        { error: 'AI service temporarily unavailable. Please try again.' },
        { status: 502 }
      );
    }

    // Step 5: Handle lead capture — merge any previously known info with newly detected info
    const mergedInfo = {
      ...(lead_info || {}),
      ...(result.detected_info || {}),
    };

    let leadCaptured = false;

    if (mergedInfo.email) {
      try {
        // Check if lead with this email already exists
        const existing = await query<{ lead_id: string }>(
          `SELECT lead_id FROM bdr.leads WHERE contact_email = $1 AND org_id = $2 LIMIT 1`,
          [mergedInfo.email, chatOrgId]
        );

        if (existing.length > 0) {
          // Update existing lead
          await query(
            `UPDATE bdr.leads SET
               business_name = COALESCE(NULLIF($1, ''), business_name),
               contact_name = COALESCE(NULLIF($2, ''), contact_name),
               updated_at = NOW()
             WHERE contact_email = $3 AND org_id = $4`,
            [
              mergedInfo.company || '',
              mergedInfo.name || '',
              mergedInfo.email,
              chatOrgId,
            ]
          );
        } else {
          // Insert new lead with visitor tracking metadata
          const leadId = `chat_${crypto.randomBytes(6).toString('hex')}`;
          const metadata: Record<string, unknown> = {};
          if (visitor_context) {
            if (visitor_context.page_url) metadata.source_page = visitor_context.page_url;
            if (visitor_context.referrer_url) metadata.referrer = visitor_context.referrer_url;
            if (visitor_context.utm_source) metadata.utm_source = visitor_context.utm_source;
            if (visitor_context.utm_medium) metadata.utm_medium = visitor_context.utm_medium;
            if (visitor_context.utm_campaign) metadata.utm_campaign = visitor_context.utm_campaign;
            if (visitor_context.utm_term) metadata.utm_term = visitor_context.utm_term;
            if (visitor_context.utm_content) metadata.utm_content = visitor_context.utm_content;
          }
          // Session 9: Track campaign origin
          if (campaign_context?.source === 'campaign') {
            metadata.campaign_source = true;
            metadata.campaign_template_id = campaign_context.campaign_template_id;
            metadata.campaign_step = campaign_context.campaign_step;
            metadata.campaign_angle = campaign_context.angle;
            metadata.campaign_tier = campaign_context.tier;
            metadata.campaign_tracking_token = campaign_context.tracking_token;
          }

          await query(
            `INSERT INTO bdr.leads (lead_id, business_name, contact_name, contact_email, status, market_type, org_id, metadata, created_at)
             VALUES ($1, $2, $3, $4, 'new', 'chatbot', $5, $6, NOW())`,
            [
              leadId,
              mergedInfo.company || null,
              mergedInfo.name || null,
              mergedInfo.email,
              chatOrgId,
              JSON.stringify(metadata),
            ]
          );
        }
        leadCaptured = true;
      } catch (err) {
        console.error('[chat/prospect] lead capture error:', err);
        // Don't fail the response if lead capture fails
      }
    }

    // Step 6: Track conversation outcome for feedback loop (Session 3)
    const conversationId = (body as Record<string, unknown>).conversation_id as string
      || `conv_${crypto.randomBytes(8).toString('hex')}`;
    const terminalState = result.tool_booking_success ? 'demo_booked' : detectTerminalState(chatMessages, result.reply, leadCaptured);

    if (terminalState) {
      // Non-blocking outcome tracking — don't await to keep response fast
      trackConversationOutcome({
        conversation_id: conversationId,
        messages: chatMessages,
        terminal_state: terminalState,
        qualification_slots: qualificationSlots as Record<string, unknown>,
        lead_info: mergedInfo,
        roi_presented: !!roiContext,
        visitor_context,
        orgId: chatOrgId,
      }).catch(err => console.error('[chat/prospect] outcome tracking failed:', err));

      // Session 8: PII-redacted conversation logging for compliance
      logRedactedConversation(conversationId, chatMessages, result.reply, chatOrgId)
        .catch(err => console.error('[chat/prospect] redacted logging failed:', err));
    }

    // Session 8: Determine if escalation requires immediate handoff
    const escalationHandoff = escalation.recommendation === 'immediate_handoff'
      || lengthControl.action === 'force_handoff';

    return NextResponse.json({
      reply: result.reply,
      lead_captured: leadCaptured,
      detected_info: result.detected_info || null,
      suggested_prompts: result.suggested_prompts || null,
      qualification: result.qualification || null,
      calculator_url: calculatorURL || null,
      conversation_id: conversationId,
      terminal_state: terminalState || null,
      // Session 8 additions
      guardrail_triggered: inputGuardrail ? { fence: inputGuardrail.fence, trigger: inputGuardrail.trigger } : null,
      escalation: escalation.detected ? { level: escalation.level, recommendation: escalation.recommendation } : null,
      quality_score: qualityScore,
      length_control: { action: lengthControl.action, messages_remaining: lengthControl.maxMessages - lengthControl.messageCount },
      should_handoff: escalationHandoff,
      // Session 9: Campaign integration context
      campaign_active: campaign_context?.source === 'campaign',
      campaign_angle: campaign_context?.angle || null,
      // Session 8: Scheduling provider for chat widget
      scheduling_provider: schedulingProvider,
      // Session 10: ROI chart SVG for inline rendering
      roi_chart: roiChartSvg || null,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('[chat/prospect] unexpected error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * Fire-and-forget: log PII-redacted conversation for compliance (Session 8).
 */
async function logRedactedConversation(
  conversationId: string,
  messages: Array<{ role: string; content: string }>,
  lastReply: string,
  orgId: number,
): Promise<void> {
  try {
    const allMessages = [
      ...messages,
      { role: 'assistant', content: lastReply },
    ];
    const redacted = redactConversation(allMessages);
    const hadRedactions = redacted.some(m => m.redacted);

    await query(
      `INSERT INTO brain.conversation_logs
        (conversation_id, org_id, messages_redacted, message_count, had_pii_redactions, logged_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         messages_redacted = $3,
         message_count = $4,
         had_pii_redactions = $5,
         logged_at = NOW()`,
      [
        conversationId,
        orgId,
        JSON.stringify(redacted),
        redacted.length,
        hadRedactions,
      ],
    );
  } catch (err) {
    console.error('[chat/prospect] redacted logging error:', err);
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
