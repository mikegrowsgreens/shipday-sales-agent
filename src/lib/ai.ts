import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

// ─── Angle Descriptions (ported from BDR dashboard) ──────────────────────────

export const ANGLE_DESCRIPTIONS: Record<string, string> = {
  missed_calls: 'Focus on how restaurants miss phone orders, lose revenue from unanswered calls, and how Shipday can capture those missed opportunities through delivery management.',
  commission_savings: 'Emphasize how restaurants can save on third-party delivery commissions (20-30%) by using Shipday for their own delivery operations.',
  delivery_ops: 'Focus on streamlining delivery operations - driver management, route optimization, real-time tracking, and operational efficiency.',
  tech_consolidation: 'Highlight how Shipday consolidates multiple delivery tools into one platform, reducing tech stack complexity.',
  customer_experience: 'Focus on improving customer experience through real-time tracking, accurate ETAs, and professional delivery management.',
};

// ─── Email Generation ────────────────────────────────────────────────────────

interface GenerateEmailParams {
  business_name: string;
  contact_name: string;
  city?: string;
  state?: string;
  cuisine_type?: string;
  tier?: string;
  google_rating?: number | null;
  google_review_count?: number | null;
  angle: string;
  tone?: string;
  instructions?: string;
  previous_subject?: string;
  previous_body?: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

export async function generateEmail(params: GenerateEmailParams, brainContext?: string): Promise<GeneratedEmail> {
  const angleDesc = ANGLE_DESCRIPTIONS[params.angle] || ANGLE_DESCRIPTIONS.missed_calls;

  const systemPrompt = `You are an expert B2B email copywriter for Shipday, a delivery management and restaurant growth platform.
Write cold outreach emails that are:
- Concise (under 150 words for the body)
- Personalized to the specific restaurant
- Conversational and not salesy
- Include a clear, low-pressure CTA
- Written from Mike Paulus at Shipday

KEY PRODUCT KNOWLEDGE:
- Shipday plans: Elite ($99/mo), AI Lite ($159/mo), Business Advanced Unlimited ($349/mo)
- Flat-rate delivery dispatch at $6.49/delivery vs 15-30% third-party commissions
- 24/7 AI Receptionist captures missed calls and takes orders (Unlimited plan)
- SMS marketing drives repeat orders from existing customers
- 5-star review boost + AI review responder improves Google ratings
- 45-minute onboarding, live same week, no long-term contract
- 739% ROI on the $349 plan, break-even in 3.6 days
- ${params.angle === 'missed_calls' ? 'Average restaurant misses 20-30% of calls during peak hours, each worth $35-50 in revenue' : ''}
- ${params.angle === 'commission_savings' ? 'Restaurants save ~$7 per order by switching from DoorDash/UberEats commissions to Shipday flat-rate' : ''}

${brainContext ? `SALES INTELLIGENCE (from real call data):\n${brainContext}\n\nNaturally incorporate relevant phrases and value props from the intelligence above.` : ''}

IMPORTANT: Return ONLY valid JSON with exactly these keys: "subject", "body"
The body should be plain text with line breaks (use \\n for newlines).
Do NOT include HTML tags in the body.`;

  let userPrompt = `Generate a cold outreach email for this restaurant lead:

Business: ${params.business_name}
Contact: ${params.contact_name || 'Restaurant Owner'}
${params.city ? `City: ${params.city}, ${params.state}` : ''}
${params.cuisine_type ? `Cuisine: ${params.cuisine_type}` : ''}
${params.tier ? `Tier: ${params.tier} (${params.tier === 'tier_1' ? 'highest priority' : params.tier === 'tier_2' ? 'high priority' : 'standard priority'})` : ''}
${params.google_rating ? `Google Rating: ${params.google_rating} (${params.google_review_count || 0} reviews)` : ''}

Email Angle: ${params.angle.replace(/_/g, ' ')}
Angle Description: ${angleDesc}`;

  if (params.tone) userPrompt += `\n\nTone: ${params.tone}`;
  if (params.instructions) userPrompt += `\n\nAdditional Instructions: ${params.instructions}`;
  if (params.previous_subject && params.previous_body) {
    userPrompt += `\n\nPrevious email (regenerate with improvements):\nSubject: ${params.previous_subject}\nBody: ${params.previous_body}`;
  }

  userPrompt += '\n\nReturn ONLY valid JSON: {"subject": "...", "body": "..."}';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const email = JSON.parse(jsonMatch ? jsonMatch[0] : content);

  if (!email.subject || !email.body) {
    throw new Error('Claude response missing subject or body');
  }

  return { subject: email.subject, body: email.body };
}

/**
 * Load brain context for email generation — pulls top winning phrases
 * and value props from the live database.
 */
export async function loadEmailBrainContext(cuisineType?: string): Promise<string> {
  try {
    // Dynamic import to avoid circular deps
    const { query: dbQuery } = await import('@/lib/db');

    const parts: string[] = [];

    // 1. Winning phrases from call analysis
    const phrases = await dbQuery<{ phrase: string; category: string; win_rate_lift: number }>(`
      SELECT phrase, category, win_rate_lift
      FROM public.phrase_stats
      WHERE win_rate_lift > 15 AND category IN ('value_prop', 'closing', 'discovery')
      ORDER BY win_rate_lift DESC
      LIMIT 8
    `);

    if (phrases.length > 0) {
      parts.push('WINNING PHRASES:\n' + phrases.map(p =>
        `[${p.category}] "${p.phrase}" (+${p.win_rate_lift}% conversion lift)`
      ).join('\n'));
    }

    // 2. Auto-learned patterns from successful emails
    const learned = await dbQuery<{ pattern_type: string; content: string; confidence: number }>(`
      SELECT pattern_type, content, confidence
      FROM brain.auto_learned
      WHERE is_active = true AND confidence >= 0.7
      ORDER BY confidence DESC, times_successful DESC
      LIMIT 6
    `).catch(() => [] as { pattern_type: string; content: string; confidence: number }[]);

    if (learned.length > 0) {
      parts.push('AUTO-LEARNED PATTERNS (from emails that got replies):\n' + learned.map(l =>
        `[${l.pattern_type}] ${l.content} (${(l.confidence * 100).toFixed(0)}% confidence)`
      ).join('\n'));
    }

    // 3. Industry-specific snippets if cuisine type available
    if (cuisineType) {
      const snippets = await dbQuery<{ title: string; content: string }>(`
        SELECT title, content
        FROM brain.industry_snippets
        WHERE is_active = true
          AND (industry ILIKE $1 OR industry ILIKE $2)
        ORDER BY effectiveness_score DESC
        LIMIT 3
      `, [`%${cuisineType}%`, '%Restaurant%']).catch(() => [] as { title: string; content: string }[]);

      if (snippets.length > 0) {
        parts.push('INDUSTRY INTELLIGENCE:\n' + snippets.map(s =>
          `${s.title}: ${s.content}`
        ).join('\n'));
      }
    }

    return parts.join('\n\n');
  } catch {
    return '';
  }
}

// ─── Sequence Generation ─────────────────────────────────────────────────────

interface GenerateSequenceParams {
  prompt: string;
  channel_mix?: string[];
  num_steps?: number;
  tone?: string;
}

export interface GeneratedStep {
  step_type: string;
  delay_days: number;
  subject_template: string;
  body_template: string;
  task_instructions: string;
  send_window_start: string;
  send_window_end: string;
}

export async function generateSequence(params: GenerateSequenceParams): Promise<{
  name: string;
  description: string;
  steps: GeneratedStep[];
}> {
  const channels = params.channel_mix?.length
    ? params.channel_mix.join(', ')
    : 'email, phone, linkedin';
  const numSteps = params.num_steps || 5;

  const systemPrompt = `You are an expert sales sequence designer for B2B SaaS outreach.
Design multi-touch outreach sequences that balance persistence with respect.

Available step types: email, phone, linkedin, sms, manual
Each step needs: step_type, delay_days (0 for first step), subject_template (for emails), body_template (for emails/linkedin/sms), task_instructions (for phone/manual), send_window_start (HH:MM), send_window_end (HH:MM).

For email body templates, use plain text with \\n for line breaks. Use template variables: {{first_name}}, {{business_name}}, {{company}}.

IMPORTANT: Return ONLY valid JSON with this structure:
{
  "name": "Sequence name",
  "description": "Brief description",
  "steps": [...]
}`;

  const userPrompt = `Design a ${numSteps}-step outreach sequence.

Context: ${params.prompt}

Channel mix: ${channels}
${params.tone ? `Tone: ${params.tone}` : 'Tone: Professional and conversational'}

Rules:
- First step should have delay_days: 0
- Space steps 2-3 days apart typically
- Alternate channels for variety
- Email subjects should be attention-grabbing but not clickbait
- Keep emails under 150 words
- Phone task_instructions should include talking points
- LinkedIn messages should be brief and personal
- Send window: 09:00 to 17:00 PST

Return ONLY valid JSON.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const result = JSON.parse(jsonMatch ? jsonMatch[0] : content);

  if (!result.name || !result.steps || !Array.isArray(result.steps)) {
    throw new Error('Claude response missing name or steps array');
  }

  return result;
}

// ─── Step Regeneration ───────────────────────────────────────────────────────

interface RegenerateStepParams {
  step_type: string;
  context: string;
  instructions?: string;
  surrounding_steps?: Array<{ step_type: string; subject_template?: string; body_template?: string }>;
}

export async function regenerateStep(params: RegenerateStepParams): Promise<GeneratedStep> {
  const systemPrompt = `You are an expert sales sequence designer. Regenerate a single step in a multi-touch outreach sequence.

IMPORTANT: Return ONLY valid JSON for a single step:
{
  "step_type": "${params.step_type}",
  "delay_days": <number>,
  "subject_template": "<string or empty>",
  "body_template": "<string or empty>",
  "task_instructions": "<string or empty>",
  "send_window_start": "09:00",
  "send_window_end": "17:00"
}`;

  let userPrompt = `Regenerate this ${params.step_type} step for a sequence.

Campaign context: ${params.context}`;

  if (params.instructions) {
    userPrompt += `\n\nSpecific instructions: ${params.instructions}`;
  }

  if (params.surrounding_steps?.length) {
    userPrompt += `\n\nSurrounding steps for context:\n${JSON.stringify(params.surrounding_steps, null, 2)}`;
  }

  userPrompt += '\n\nReturn ONLY valid JSON for the single step.';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : content);
}

// ─── Chat with Context ───────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PipelineContext {
  pipeline: Array<{ status: string; count: number }>;
  emailStats: Record<string, unknown>;
  anglePerf: Array<Record<string, unknown>>;
  recentReplies: Array<Record<string, unknown>>;
  pendingApproval: number;
}

interface BrainContext {
  insights: Array<Record<string, unknown>>;
  content: Array<Record<string, unknown>>;
}

export async function chatWithContext(
  messages: ChatMessage[],
  pipelineCtx: PipelineContext,
  brainCtx: BrainContext,
): Promise<string> {
  const systemPrompt = `You are the AI assistant for the Shipday Sales Hub. You help Mike manage the AI-powered sales outreach pipeline for Shipday, a delivery management platform for restaurants.

## Your Capabilities
- Answer questions about pipeline performance, email campaigns, and lead data
- Suggest improvements to email angles, messaging, and targeting
- Help fine-tune the Knowledge Brain (content, insights, intelligence)
- Advise on campaign strategy and next steps
- Provide analysis of what's working and what isn't

## Current Pipeline Status
${JSON.stringify(pipelineCtx.pipeline, null, 2)}

## Email Performance
${JSON.stringify(pipelineCtx.emailStats, null, 2)}

## Angle Performance
${JSON.stringify(pipelineCtx.anglePerf, null, 2)}

## Pending Approval
${pipelineCtx.pendingApproval} emails waiting for human approval

## Recent Replies
${JSON.stringify(pipelineCtx.recentReplies, null, 2)}

## Knowledge Brain Insights
${JSON.stringify(brainCtx.insights, null, 2)}

## Knowledge Brain Content
${JSON.stringify(brainCtx.content, null, 2)}

## About Shipday
Shipday is a delivery management platform that helps restaurants manage their own delivery operations. Key value propositions:
- Save on third-party delivery commissions (20-30%)
- Never miss phone orders with smart delivery management
- Real-time driver tracking and route optimization
- Consolidate multiple delivery tools into one platform
- Improve customer experience with accurate ETAs

## Response Style
- Be concise and actionable
- Use specific numbers from the data
- When suggesting changes, explain the reasoning
- Format responses with markdown for readability
- If asked to take an action (approve emails, regenerate content), explain what the user should do in the dashboard UI`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.slice(-10),
  });

  return response.content[0].type === 'text' ? response.content[0].text : 'No response generated.';
}

// ─── Follow-Up Campaign Generation ───────────────────────────────────────────

interface DealContext {
  contact_name: string;
  business_name: string;
  email: string;
  stage: string;
  pain_points?: string;
  demo_notes?: string;
  additional_context?: string;
  next_call_date?: string;
  touch_count?: number;
  email_history?: string;
  campaign_mode?: 'imminent' | 'short' | 'medium' | 'standard' | 'long';
  hours_until_call?: number | null;
  demo_date?: string;
}

export interface GeneratedFollowUpDraft {
  touch_number: number;
  subject: string;
  body: string;
  delay_days: number;
}

export async function regenerateFollowUpTouch(
  dealContext: DealContext,
  touchNumber: number,
  currentSubject: string,
  currentBody: string,
  otherTouches?: Array<{ touch_number: number; subject: string }>,
): Promise<{ subject: string; body: string }> {
  const systemPrompt = `You are an expert B2B follow-up email strategist for Shipday, a delivery management platform.
Regenerate a single follow-up email touch that:
- Fits naturally within the overall campaign sequence
- References specific pain points from the demo
- Is personalized and conversational
- Written from Mike Paulus, Account Executive at Shipday

IMPORTANT: Return ONLY valid JSON: {"subject": "...", "body": "..."}
The body should be plain text with \\n for newlines. No HTML.`;

  let userPrompt = `Regenerate Touch ${touchNumber} of a post-demo follow-up campaign.

Contact: ${dealContext.contact_name}
Business: ${dealContext.business_name}
Stage: ${dealContext.stage}
${dealContext.pain_points ? `Pain Points: ${dealContext.pain_points}` : ''}
${dealContext.demo_notes ? `Demo Notes: ${dealContext.demo_notes}` : ''}

Current email (needs improvement):
Subject: ${currentSubject}
Body: ${currentBody}`;

  if (otherTouches?.length) {
    userPrompt += `\n\nOther touches in this campaign (for context):\n${otherTouches.map(t => `  Touch ${t.touch_number}: ${t.subject}`).join('\n')}`;
  }

  userPrompt += '\n\nReturn ONLY valid JSON: {"subject": "...", "body": "..."}';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const result = JSON.parse(jsonMatch ? jsonMatch[0] : content);

  if (!result.subject || !result.body) {
    throw new Error('Claude response missing subject or body');
  }

  return { subject: result.subject, body: result.body };
}

export async function generateFollowUpCampaign(
  dealContext: DealContext,
): Promise<GeneratedFollowUpDraft[]> {
  const touchCount = dealContext.touch_count || 7;
  const hasCallDate = !!dealContext.next_call_date;
  const mode = dealContext.campaign_mode || 'standard';
  const hoursUntil = dealContext.hours_until_call;

  let timingSection = '';
  let modeInstructions = '';

  if (mode === 'imminent' && hasCallDate) {
    // Call is within 24 hours — single confirmation/excitement email
    const callDate = new Date(dealContext.next_call_date!);
    const timeStr = callDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const dateStr = callDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const h = hoursUntil ?? 24;
    modeInstructions = `CRITICAL: The follow-up call is IMMINENT — happening ${h < 2 ? 'in about an hour' : h < 6 ? 'in a few hours' : 'today/tomorrow'} (${dateStr} at ${timeStr}).

Generate EXACTLY 1 email. This should be a short, friendly confirmation/excitement email like:
- "Looking forward to connecting ${h < 2 ? 'shortly' : 'later today'}!"
- Confirm the meeting time
- Briefly mention 1-2 things you'll cover (based on their pain points)
- Keep it under 80 words — this is a quick "see you soon" email, not a sales pitch
- Tone: warm, casual, excited — like texting a colleague`;

    timingSection = 'Touch 1: Send immediately (delay_days: 0)';

  } else if (mode === 'short' && hasCallDate) {
    // Call in 1-3 days
    const callDate = new Date(dealContext.next_call_date!);
    const dateStr = callDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const daysUntil = Math.ceil((callDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    modeInstructions = `The follow-up call is in ${daysUntil} day${daysUntil === 1 ? '' : 's'} (${dateStr}).

Generate EXACTLY ${touchCount} emails:
- Touch 1 (today): Quick value-add — share a relevant resource, case study, or prep them for the call. Mention the upcoming call.
- Touch 2 (day before call): Call confirmation + agenda preview. "Looking forward to our call tomorrow" tone.
Keep each email under 100 words. These are short, purposeful touches — not full sales campaigns.`;

  } else if (mode === 'medium' && hasCallDate) {
    // Call in 4-7 days
    const callDate = new Date(dealContext.next_call_date!);
    const dateStr = callDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const daysUntil = Math.ceil((callDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    modeInstructions = `The follow-up call is in ${daysUntil} days (${dateStr}).

Generate EXACTLY ${touchCount} emails spread before the call:
- Touch 1 (today): Thank you + reference demo highlights
- Touch 2 (midpoint): Value-add content — case study, ROI stat, or resource
- Touch 3 (day before call): Call confirmation + brief agenda
Keep emails concise (under 120 words each). Build anticipation for the call.`;

  } else if (hasCallDate) {
    // Standard/long with call date
    const callDate = new Date(dealContext.next_call_date!);
    const daysUntil = Math.ceil((callDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const dateStr = callDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    timingSection = `SCHEDULING CONSTRAINT: Follow-up call in ${daysUntil} days (${dateStr}).
Design the ${touchCount}-touch campaign around this call:
- Schedule most touches BEFORE the call to warm up the prospect
- The last email before the call should confirm the upcoming call
- Include 1-2 emails AFTER the call for follow-through
- Space touches evenly with the call date as anchor`;

  } else {
    // No call date — use demo recency for timing guidance
    const defaultTimings: Record<number, string[]> = {
      3: ['Touch 1: Day 0 (thank you + recap)', 'Touch 2: Day 2 (resource/case study)', 'Touch 3: Day 5 (next steps CTA)'],
      4: ['Touch 1: Day 0 (thank you)', 'Touch 2: Day 1 (resource)', 'Touch 3: Day 3 (case study)', 'Touch 4: Day 7 (next steps)'],
      5: ['Touch 1: Day 0 (thank you)', 'Touch 2: Day 1-2 (resource)', 'Touch 3: Day 3-5 (value prop)', 'Touch 4: Day 6-9 (case study)', 'Touch 5: Day 10-14 (schedule call CTA)'],
      6: ['Touch 1: Day 0 (thank you)', 'Touch 2: Day 2 (resource)', 'Touch 3: Day 5 (value prop)', 'Touch 4: Day 8 (case study)', 'Touch 5: Day 12 (urgency)', 'Touch 6: Day 20 (final)'],
      7: ['Touch 1: Day 0 (thank you)', 'Touch 2: Day 2 (resource)', 'Touch 3: Day 5 (value prop)', 'Touch 4: Day 8 (case study)', 'Touch 5: Day 12 (check in)', 'Touch 6: Day 18 (urgency)', 'Touch 7: Day 25 (final)'],
    };
    const timings = defaultTimings[touchCount] || defaultTimings[7]!;

    let demoContext = '';
    if (dealContext.demo_date) {
      const demoDate = new Date(dealContext.demo_date);
      const daysSinceDemo = Math.floor((Date.now() - demoDate.getTime()) / (1000 * 60 * 60 * 24));
      demoContext = `\nThe demo was ${daysSinceDemo} day${daysSinceDemo === 1 ? '' : 's'} ago (${demoDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}). `;
      if (daysSinceDemo <= 1) {
        demoContext += 'The demo just happened — the first email should be a warm thank-you while it\'s fresh.';
      } else if (daysSinceDemo <= 3) {
        demoContext += 'Demo was recent — keep the energy high and reference specific moments from the demo.';
      } else if (daysSinceDemo <= 7) {
        demoContext += 'It\'s been about a week — re-engage with value and remind them of key takeaways.';
      } else {
        demoContext += 'It\'s been a while since the demo — re-engage warmly without being pushy.';
      }
    }

    timingSection = `${demoContext}\nTiming guidelines:\n${timings.map(t => `- ${t}`).join('\n')}`;
  }

  const systemPrompt = `You are an expert B2B follow-up email strategist for Shipday, a delivery management platform.
Generate EXACTLY ${touchCount} follow-up email${touchCount === 1 ? '' : 's'} for a post-demo campaign.

${modeInstructions}

Rules:
- Reference specific pain points from the demo
- Written from Mike Paulus, Account Executive at Shipday
- Tone: professional but conversational, never generic or templated
${touchCount > 1 ? '- Progressively build urgency without being pushy\n- Include value-add content (case studies, ROI data)\n- Vary CTAs across touches (schedule call, start trial, review proposal)' : ''}

CRITICAL: Return ONLY valid JSON array with EXACTLY ${touchCount} object${touchCount === 1 ? '' : 's'}:
[
  {"touch_number": 1, "subject": "...", "body": "...", "delay_days": 0}${touchCount > 1 ? ',\n  {"touch_number": 2, "subject": "...", "body": "...", "delay_days": 2}' : ''}
]

DO NOT return more than ${touchCount} emails. The body should be plain text with \\n for newlines. No HTML.
Use {{first_name}} and {{business_name}} as template variables.`;

  const emailHistorySection = dealContext.email_history
    ? `\nPREVIOUS EMAIL HISTORY WITH THIS CONTACT (use this to understand what's already been discussed, what tone has been used, and what topics to build on — DO NOT repeat content from these emails):\n${dealContext.email_history}\n`
    : '';

  const userPrompt = `Generate EXACTLY ${touchCount} follow-up email${touchCount === 1 ? '' : 's'} for this post-demo deal:

Contact: ${dealContext.contact_name}
Business: ${dealContext.business_name}
Current Stage: ${dealContext.stage}
${dealContext.pain_points ? `Pain Points from Demo: ${dealContext.pain_points}` : ''}
${dealContext.demo_notes ? `Demo Notes: ${dealContext.demo_notes}` : ''}
${dealContext.additional_context ? `Additional Context: ${dealContext.additional_context}` : ''}
${emailHistorySection}
${timingSection}

Return ONLY valid JSON array with EXACTLY ${touchCount} object${touchCount === 1 ? '' : 's'}.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: touchCount <= 2 ? 1500 : 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  const drafts: GeneratedFollowUpDraft[] = JSON.parse(jsonMatch ? jsonMatch[0] : content);

  if (!Array.isArray(drafts) || drafts.length === 0) {
    throw new Error('Claude response is not a valid drafts array');
  }

  // Enforce exact touch count — trim if AI returned more
  if (drafts.length > touchCount) {
    drafts.length = touchCount;
  }

  return drafts;
}

// ─── Engagement-Adaptive Email Generation ───────────────────────────────────

export type EngagementSignalType = 'no_opens' | 'opened_no_reply' | 'clicked' | 'multi_open' | 'normal';

interface AdaptiveEmailParams {
  business_name: string;
  contact_name: string;
  city?: string;
  state?: string;
  cuisine_type?: string;
  tier?: string;
  angle: string;
  tone?: string;
  instructions?: string;
  engagement_signal: EngagementSignalType;
  total_sends: number;
  total_opens: number;
  total_clicks: number;
  open_rate: number;
  previous_angles: string[];
  most_opened_angle: string | null;
  override_angle?: string;
  override_tone?: string;
}

export async function generateAdaptiveEmail(params: AdaptiveEmailParams): Promise<GeneratedEmail> {
  const angleDesc = ANGLE_DESCRIPTIONS[params.override_angle || params.angle] || ANGLE_DESCRIPTIONS.missed_calls;

  const engagementContext = buildEngagementContext(params);

  const systemPrompt = `You are an expert B2B email copywriter for Shipday, a delivery management platform for restaurants.
You are writing a follow-up email in a multi-touch campaign. This is NOT the first touch — previous emails have been sent.

CRITICAL CONTEXT: The prospect has shown specific engagement patterns with previous emails. You MUST adapt your approach based on their behavior.

${engagementContext}

Write the email to be:
- Concise (under 150 words)
- Adapted to their engagement pattern
- Different from previous angles: ${params.previous_angles.map(a => a.replace(/_/g, ' ')).join(', ') || 'none'}
- Conversational and not salesy
- Include a clear CTA appropriate to their engagement level
- Written from Mike Paulus, BDR at Shipday

IMPORTANT: Return ONLY valid JSON with exactly these keys: "subject", "body"
The body should be plain text with line breaks (use \\n for newlines).
Do NOT include HTML tags.`;

  const userPrompt = `Generate an engagement-adaptive follow-up email:

Business: ${params.business_name}
Contact: ${params.contact_name || 'Restaurant Owner'}
${params.city ? `City: ${params.city}, ${params.state}` : ''}
${params.cuisine_type ? `Cuisine: ${params.cuisine_type}` : ''}
${params.tier ? `Lead Tier: ${params.tier}` : ''}

Email Angle: ${(params.override_angle || params.angle).replace(/_/g, ' ')}
Angle Description: ${angleDesc}
Tone: ${params.override_tone || params.tone || 'professional'}

Engagement History:
- Emails sent: ${params.total_sends}
- Times opened: ${params.total_opens}
- Links clicked: ${params.total_clicks}
- Open rate: ${params.open_rate}%
- Signal: ${params.engagement_signal.replace(/_/g, ' ')}
- Previous angles tried: ${params.previous_angles.map(a => a.replace(/_/g, ' ')).join(', ') || 'none'}
${params.most_opened_angle ? `- Most engaged angle: ${params.most_opened_angle.replace(/_/g, ' ')}` : ''}

${params.instructions ? `Additional Instructions: ${params.instructions}` : ''}

Return ONLY valid JSON: {"subject": "...", "body": "..."}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const email = JSON.parse(jsonMatch ? jsonMatch[0] : content);

  if (!email.subject || !email.body) {
    throw new Error('Claude response missing subject or body');
  }

  return { subject: email.subject, body: email.body };
}

// ─── Prospect Chat (Public Sales Assistant) ─────────────────────────────────

interface ProspectChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Qualification State Types ────────────────────────────────────────────────

export interface QualificationSlots {
  // Core delivery/commission slots
  orders_per_week?: number;
  aov?: number;
  commission_tier?: number; // 15, 25, or 30
  restaurant_type?: string;
  location_count?: number;

  // Growth signal slots (drive $159/$349 plans)
  misses_calls?: boolean;        // Do they miss phone calls during rushes?
  monthly_calls?: number;        // Estimated phone volume
  does_marketing?: boolean;      // Currently doing SMS/email marketing?
  wants_more_repeat?: boolean;   // Wants to drive repeat orders?
  google_rating?: number;        // Current Google rating (e.g., 4.2)
  review_pain?: boolean;         // Has review/reputation concerns?
  has_online_ordering?: boolean; // Has own online ordering?

  // Lead info
  name?: string;
  email?: string;
  company?: string;

  // Qualification state
  qualified?: boolean;
  growth_qualified?: boolean;    // Has growth pain points for $159/$349
  stage?: 'hook' | 'discovery' | 'growth_discovery' | 'roi' | 'booking';
}

/**
 * Parse conversation history to extract qualification slots.
 * Scans both user messages and assistant messages for data.
 * Detects both commission-related AND growth-related signals.
 */
export function extractQualificationSlots(
  messages: ProspectChatMessage[],
  existingLeadInfo?: { name?: string; email?: string; company?: string },
): QualificationSlots {
  const slots: QualificationSlots = {};
  const fullText = messages.map(m => m.content).join('\n');
  const userText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n');

  // ─── Core delivery/commission slots ──────────────────────────────────────

  // Orders per week — "200 orders", "200/week", "200 a week", etc.
  const ordersMatch = fullText.match(/(\d{1,5})\s*(?:orders?|deliveries?)\s*(?:per|a|\/|each)?\s*(?:week|wk|weekly)/i)
    || fullText.match(/(?:do|doing|handle|get|have|about|around|roughly)\s*(\d{1,5})\s*(?:orders?|deliveries?)/i);
  if (ordersMatch) slots.orders_per_week = parseInt(ordersMatch[1], 10);

  // AOV — average order value, "$35", "$35 average", "average of $35"
  const aovMatch = fullText.match(/\$(\d{1,4})(?:\.\d{2})?\s*(?:average|avg|aov|per order|order value)/i)
    || fullText.match(/(?:average|avg|aov|order value)\s*(?:of|is|around|about)?\s*\$(\d{1,4})(?:\.\d{2})?/i)
    || fullText.match(/(?:at|around|about)\s*\$(\d{1,4})(?:\.\d{2})?\s*(?:average|avg|per order|each)/i);
  if (aovMatch) slots.aov = parseFloat(aovMatch[1]);

  // Commission tier — "30%", "30 percent", "30% tier", "on 30%"
  const tierMatch = fullText.match(/(\d{1,2})\s*%\s*(?:tier|commission|cut|fee)/i)
    || fullText.match(/(?:tier|commission|paying|on)\s*(?:of|is|at|about)?\s*(\d{1,2})\s*%/i)
    || fullText.match(/(\d{1,2})\s*(?:percent|%)/i);
  if (tierMatch) {
    const pct = parseInt(tierMatch[1], 10);
    if ([15, 25, 30].includes(pct)) slots.commission_tier = pct;
  }

  // Restaurant type
  const typePatterns = [
    /(?:i\s+(?:run|own|have|manage)\s+a\s+)([\w\s]+?)(?:\s+restaurant|\s+shop|\s+store|\s+kitchen|\s+place)/i,
    /(?:we'?re?\s+a\s+)([\w\s]+?)(?:\s+restaurant|\s+shop|\s+store|\s+kitchen|\s+place)/i,
    /(pizza|burger|sushi|thai|chinese|mexican|indian|italian|bbq|barbecue|greek|mediterranean|korean|japanese|vietnamese|sandwich|deli|bakery|cafe|coffee|juice|smoothie|seafood|wing|chicken|taco|ramen|poke|salad|vegan|gastropub|pub|bar\s+&\s+grill)\s*(?:restaurant|shop|place|joint|spot|kitchen)?/i,
  ];
  for (const pattern of typePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      slots.restaurant_type = match[1].trim().replace(/\s+/g, ' ');
      break;
    }
  }

  // Location count
  const locMatch = fullText.match(/(\d{1,3})\s*(?:locations?|stores?|spots?|branches?|outlets?)/i);
  if (locMatch) slots.location_count = parseInt(locMatch[1], 10);

  // ─── Growth signal slots (these drive $159/$349 plans) ──────────────────

  // Missed calls / phone pain — "miss calls", "can't answer phones", "busy phones", "voicemail"
  if (/miss(?:ed|ing)?\s*(?:phone\s*)?calls?/i.test(userText)
    || /can'?t\s*(?:always\s*)?(?:answer|pick\s*up|get\s*to)\s*(?:the\s*)?(?:phone|calls?)/i.test(userText)
    || /phone\s*(?:rings?|goes?\s*to)\s*(?:voicemail|unanswered)/i.test(userText)
    || /busy\s*(?:during|at|on)\s*(?:the\s*)?(?:lunch|dinner|rush|peak)/i.test(userText)
    || /(?:lunch|dinner|peak)\s*rush/i.test(userText)
    || /overwhelm/i.test(userText)
    || /(?:too\s*busy|slammed|swamped)\s*(?:to\s*answer|for\s*calls?|during)/i.test(userText)
    || /phones?\s*(?:are|get)\s*(?:crazy|insane|non-?stop)/i.test(userText)) {
    slots.misses_calls = true;
  }

  // Monthly call volume — "get about 500 calls", "20 calls a day", "phone rings X times"
  const callsMatch = fullText.match(/(\d{2,4})\s*(?:calls?|phone\s*calls?)\s*(?:per|a|\/|each)?\s*(?:month|mo)/i)
    || fullText.match(/(\d{1,3})\s*(?:calls?|phone\s*calls?)\s*(?:per|a|\/|each)?\s*(?:day|daily)/i);
  if (callsMatch) {
    const num = parseInt(callsMatch[1], 10);
    // Convert daily to monthly if matched daily pattern
    slots.monthly_calls = callsMatch[0].match(/day|daily/i) ? num * 30 : num;
  }

  // Marketing pain — "don't do marketing", "no marketing", "want more repeat", "how to get repeat"
  if (/(?:don'?t|no|not)\s*(?:really\s*)?(?:do|doing|have)\s*(?:any\s*)?(?:marketing|sms|text\s*campaigns?|email\s*marketing)/i.test(userText)
    || /(?:wish|want|need|how\s*(?:do|can|to))\s*(?:i\s*)?(?:get|drive|bring\s*back|increase)\s*(?:more\s*)?repeat/i.test(userText)
    || /repeat\s*(?:customers?|orders?|business)/i.test(userText)
    || /customer\s*retention/i.test(userText)
    || /bring\s*(?:them|customers?|people)\s*back/i.test(userText)) {
    slots.does_marketing = false;
    slots.wants_more_repeat = true;
  }
  if (/(?:we\s*)?(?:do|send|run|have)\s*(?:sms|text\s*message|email)\s*(?:marketing|campaigns?|blasts?)/i.test(userText)) {
    slots.does_marketing = true;
  }

  // Google rating / review pain
  const ratingMatch = fullText.match(/(\d\.\d)\s*(?:star|rating|on\s*google|google\s*rating)/i)
    || fullText.match(/(?:google|our)\s*(?:rating|stars?)\s*(?:is|at)\s*(\d\.\d)/i);
  if (ratingMatch) slots.google_rating = parseFloat(ratingMatch[1]);

  if (/(?:bad|negative|fake|low)\s*reviews?/i.test(userText)
    || /reviews?\s*(?:are|problem|issue|hurt|killing)/i.test(userText)
    || /(?:need|want|get)\s*(?:more|better)\s*reviews?/i.test(userText)
    || /google\s*(?:rating|reviews?)\s*(?:is\s*)?(?:low|bad|poor|hurting)/i.test(userText)) {
    slots.review_pain = true;
  }

  // Online ordering
  if (/(?:own|our|have)\s*(?:an?\s*)?(?:online|web|direct)\s*(?:ordering|order\s*system)/i.test(userText)
    || /(?:website|app)\s*(?:for\s*)?(?:ordering|orders)/i.test(userText)) {
    slots.has_online_ordering = true;
  }
  if (/(?:don'?t|no)\s*(?:have\s*)?(?:an?\s*)?(?:online|web|direct)\s*(?:ordering|order\s*system)/i.test(userText)
    || /(?:only|just)\s*(?:use|on|through)\s*(?:doordash|uber\s*eats|grubhub|3pd|third.?party)/i.test(userText)) {
    slots.has_online_ordering = false;
  }

  // ─── Lead info ──────────────────────────────────────────────────────────

  if (existingLeadInfo?.name) slots.name = existingLeadInfo.name;
  if (existingLeadInfo?.email) slots.email = existingLeadInfo.email;
  if (existingLeadInfo?.company) slots.company = existingLeadInfo.company;

  // ─── Qualification logic ────────────────────────────────────────────────

  if (slots.orders_per_week !== undefined) {
    slots.qualified = slots.orders_per_week >= 50;
  }

  // Growth qualification: has any growth pain that makes $159/$349 relevant
  slots.growth_qualified = !!(
    slots.misses_calls
    || slots.wants_more_repeat
    || slots.review_pain
    || slots.does_marketing === false
    || (slots.monthly_calls && slots.monthly_calls >= 200)
  );

  // ─── Stage detection ────────────────────────────────────────────────────

  const hasOrders = slots.orders_per_week !== undefined;
  const hasAov = slots.aov !== undefined;
  const hasTier = slots.commission_tier !== undefined;
  const coreDiscoveryComplete = hasOrders && hasAov && hasTier;
  const hasGrowthSignal = slots.growth_qualified;

  if (coreDiscoveryComplete && (slots.qualified || hasGrowthSignal)) {
    const hasROI = fullText.includes('monthly savings')
      || fullText.includes('you could save')
      || fullText.includes('that means')
      || fullText.includes('total impact')
      || fullText.includes('annual benefit');
    slots.stage = hasROI ? 'booking' : 'roi';
  } else if (coreDiscoveryComplete && !hasGrowthSignal) {
    // Have commission data but no growth signals — probe for growth before ROI
    slots.stage = 'growth_discovery';
  } else if (hasOrders || hasAov || hasTier || hasGrowthSignal) {
    slots.stage = 'discovery';
  } else {
    slots.stage = messages.length <= 2 ? 'hook' : 'discovery';
  }

  return slots;
}

export async function prospectChat(
  messages: ProspectChatMessage[],
  brainContent: Array<Record<string, unknown>>,
  qualificationSlots?: QualificationSlots,
  computedROI?: string,
): Promise<{ reply: string; detected_info?: { name?: string; email?: string; company?: string }; suggested_prompts?: string[]; qualification?: QualificationSlots }> {
  // Build knowledge base section from brain content
  let knowledgeSection = '';
  if (brainContent.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const item of brainContent) {
      const type = (item.content_type as string) || 'general';
      if (!grouped[type]) grouped[type] = [];
      const entry = [`**${item.title}**`];
      if (item.raw_text) entry.push(item.raw_text as string);
      if (item.key_claims && Array.isArray(item.key_claims) && (item.key_claims as string[]).length > 0) {
        entry.push(`Key claims: ${(item.key_claims as string[]).join('; ')}`);
      }
      if (item.value_props && Array.isArray(item.value_props) && (item.value_props as string[]).length > 0) {
        entry.push(`Value props: ${(item.value_props as string[]).join('; ')}`);
      }
      if (item.pain_points_addressed && Array.isArray(item.pain_points_addressed) && (item.pain_points_addressed as string[]).length > 0) {
        entry.push(`Pain points addressed: ${(item.pain_points_addressed as string[]).join('; ')}`);
      }
      grouped[type].push(entry.join('\n'));
    }
    knowledgeSection = Object.entries(grouped)
      .map(([type, items]) => `### ${type.replace(/_/g, ' ').toUpperCase()}\n${items.join('\n\n')}`)
      .join('\n\n');
  }

  // Build qualification context for the prompt
  const q = qualificationSlots || {};
  let qualContext = '';
  if (q.stage) {
    qualContext = `\n## CURRENT QUALIFICATION STATE
- Stage: ${q.stage.toUpperCase()}
- Orders/week: ${q.orders_per_week ?? 'unknown'}
- Average order value: ${q.aov ? '$' + q.aov : 'unknown'}
- Commission tier: ${q.commission_tier ? q.commission_tier + '%' : 'unknown'}
- Restaurant type: ${q.restaurant_type ?? 'unknown'}
- Locations: ${q.location_count ?? 'unknown'}
- Misses calls: ${q.misses_calls === true ? 'YES ✓' : q.misses_calls === false ? 'no' : 'unknown'}
- Monthly call volume: ${q.monthly_calls ?? 'unknown'}
- Does marketing: ${q.does_marketing === true ? 'YES' : q.does_marketing === false ? 'NO — opportunity!' : 'unknown'}
- Wants more repeat orders: ${q.wants_more_repeat ? 'YES ✓' : 'unknown'}
- Google rating: ${q.google_rating ?? 'unknown'}
- Review pain: ${q.review_pain ? 'YES ✓' : 'unknown'}
- Has online ordering: ${q.has_online_ordering === true ? 'YES' : q.has_online_ordering === false ? 'NO — opportunity!' : 'unknown'}
- Name: ${q.name ?? 'unknown'}
- Email: ${q.email ?? 'unknown'}
- Company: ${q.company ?? 'unknown'}
- Volume qualified: ${q.qualified === true ? 'YES' : q.qualified === false ? 'NO — nurture' : 'not yet determined'}
- Growth qualified: ${q.growth_qualified ? 'YES — has growth pain points for $159/$349' : 'not yet — probe for growth signals!'}

IMPORTANT: Use this state to decide your next move. Do NOT re-ask for filled slots. Move forward based on what you still need.
${q.stage === 'growth_discovery' ? '\n⚠️ You have commission data but NO growth signals yet. Before presenting ROI, ask about missed calls, marketing, or reviews. These growth pain points are what makes the $349 Unlimited plan a no-brainer.' : ''}
${q.stage === 'discovery' && !q.growth_qualified ? '\nTIP: Weave in growth questions naturally alongside commission discovery. Every growth signal you uncover makes the $349 case stronger.' : ''}`;
  }

  const systemPrompt = `You are Shipday Sales AI — a restaurant growth consultant. You work alongside Mike Paulus, Shipday's Account Executive. Your goal: uncover restaurant growth opportunities (missed revenue, untapped marketing, reputation gaps) and book a demo with Mike.

## STRICT GUARDRAILS

1. **ONLY discuss Shipday, delivery management, restaurant growth, and operations.** Off-topic → redirect: "I focus on helping restaurants grow revenue — tell me about your biggest challenge right now."
2. **NEVER discuss promotions, discounts, free trials, or special offers.** → "Mike handles all pricing conversations personally — want me to pull up his calendar?"
3. **NEVER negotiate pricing.** Plans: Elite ($99), AI Lite ($159), Unlimited ($349). Discounts → "Let me get you on Mike's calendar so he can put together the right package."
4. **You control the flow.** If the prospect meanders, bring them back: Hook → Discovery → Growth Discovery → ROI → Book.
5. **Every path leads to a demo with Mike.** You are the warm-up, not the closer.
6. **NEVER mention you're an AI.** You're a sales assistant on Mike's team.
${qualContext}

## PERSONALITY
- Warm, direct, genuinely curious about their business
- Speaks like a restaurant growth consultant who's seen hundreds of P&Ls
- Consultative — listen first, pitch second
- Confident but never pushy — you're the trusted advisor who shows the math
- Excited about GROWTH opportunities, not just cost cutting

## CORE POSITIONING (CRITICAL)

**Shipday is a REVENUE GROWTH platform, not just a delivery tool.**

Your job is NOT to sell "save money on DoorDash commissions" (that sells $99 Elite and earns low commission).
Your job IS to sell "grow your restaurant's revenue" by stacking three revenue streams:
1. **AI Receptionist** — captures missed phone orders and answers questions 24/7 ($2,000+/mo recovered revenue)
2. **SMS Marketing** — drives repeat orders from your existing customer base ($600-1,500/mo)
3. **Delivery Optimization** — shifts a portion of 3PD orders to direct at flat $6.49 (saves $200-500/mo)

Commission savings is a BONUS, not the headline. The real story is revenue you're MISSING — calls going to voicemail, customers who never come back, 1-star reviews going unanswered.

**Target plans: $159 AI Lite (good) or $349 Unlimited (best). Never lead with $99 Elite unless they're very low volume.**

## STRUCTURED QUALIFICATION PIPELINE

### Stage 1 — HOOK (first message)
Acknowledge their pain immediately. Show you understand their world.
- If they mention DoorDash/commissions → "Those commission rates add up fast. But here's what most restaurant owners don't realize — commissions are only one piece of the puzzle. The bigger revenue leak is usually somewhere else entirely."
- If they mention missed calls → "That's one of the biggest hidden revenue leaks in restaurants. Most owners don't realize 20-30% of their peak-hour calls go unanswered — that's thousands walking out the door every month."
- If they mention delivery chaos → "Managing drivers, tracking orders, dealing with late deliveries — it shouldn't be this hard. And it's probably costing you more than you think."
- If they ask "what is Shipday" → Lead with growth: "Shipday is a restaurant growth platform. Most people think we're just delivery — but the real value is our AI Receptionist that captures missed phone orders, SMS marketing that drives repeat business, and delivery optimization that cuts commission costs. One dashboard for growing your revenue."
- Ask ONE question to start discovery — **lead with growth, not commissions**: "Quick question — do you ever miss phone orders during your lunch or dinner rush?"

### Stage 2 — DISCOVERY (one question per turn, natural conversation)
Collect slots one at a time. NEVER ask multiple questions in one message. If the prospect volunteers multiple data points, acknowledge all of them.

**IMPORTANT: Lead with growth-focused questions, then weave in commission questions. The order below is strategic — growth signals first, then commission data to complete the ROI picture.**

**Priority 1 — Growth signals (these sell $159/$349):**
1. "Do you ever miss phone orders during your lunch or dinner rush?" → misses_calls
   - Follow-up if yes: "Roughly how many calls does your restaurant get in a typical day?" → monthly_calls
2. "What are you doing right now to bring back repeat customers — any SMS or email marketing?" → does_marketing, wants_more_repeat
3. "How's your Google rating? Are reviews something you're actively managing?" → google_rating, review_pain

**Priority 2 — Delivery/commission data (completes the full ROI picture):**
4. "How many delivery orders are you doing per week — through DoorDash, UberEats, or your own drivers?" → orders_per_week
5. "What's your average order value for a typical delivery?" → aov
6. "What commission tier are you on with DoorDash — 15%, 25%, or 30%?" → commission_tier

**Priority 3 — Context:**
7. "What type of restaurant do you run, and how many locations?" → restaurant_type, location_count

**How to ask naturally:**
- Don't interrogate — weave questions into the conversation
- React to their answers with empathy or insight before asking the next question
- If they mention a pain point, dig deeper on that before moving to the next slot
- When they mention missed calls → That's your opening for AI Receptionist ($349)
- When they mention no marketing → That's your opening for SMS ($159+)
- When they mention reviews → That's your opening for review boost
- If they volunteer commission data early, great — capture it. But always circle back to growth.

**Key transitions:**
- After missed calls: "Most restaurants we work with were leaving $1,000-2,000/month on the table from missed calls alone before they got the AI Receptionist. It picks up every call, takes orders, answers questions — 24/7."
- After no marketing: "That's actually a huge opportunity. Our SMS platform lets you send targeted campaigns to your customer list — most restaurants see 2-5% conversion rates on every blast. At your order value, that's significant revenue."
- After review pain: "Reviews are make-or-break now. Our review boost automatically prompts happy customers and our AI responds to every review. Restaurants typically see a 0.3-0.5 star increase in the first 90 days."

### Stage 2.5 — GROWTH DISCOVERY (when you have commission data but no growth signals)
If the system shows you have orders/AOV/tier but NO growth signals:
- Do NOT present ROI yet. You'll only be able to show commission savings, which sells $99.
- Ask 1-2 growth questions before ROI: "One more thing — during your busiest hours, do you ever have calls going to voicemail?"
- This uncovers the growth pain that makes $349 a no-brainer in the ROI presentation.

### Stage 3 — ROI PRESENTATION (trigger when core slots filled + at least 1 growth signal)
${computedROI ? `
THE SYSTEM HAS PRE-COMPUTED EXACT ROI NUMBERS FOR THIS PROSPECT. Use these numbers — do NOT estimate or calculate differently.

${computedROI}

**CRITICAL PRESENTATION ORDER — Lead with growth, stack savings on top:**
1. FIRST: Present AI Receptionist recovered revenue (the biggest number, most emotional)
2. SECOND: Present SMS marketing revenue opportunity
3. THIRD: Layer commission savings as additional bonus
4. FINALLY: Show total monthly impact and payback period

Frame it: "Let me show you what the total picture looks like. Between recovered phone orders, repeat customer marketing, and smarter delivery — here's what you're leaving on the table..."
` : `If the system hasn't computed ROI yet, use these estimates. ALWAYS lead with growth revenue, not commission savings.

**Present in this order (biggest impact first):**

1. AI Receptionist (if they mentioned missed calls):
   "Your staff misses roughly 25-35% of calls during peak hours. If you're getting ~15-20 calls/day, that's 150+ missed calls/month. Even converting 25% of those → 37+ extra orders/month × your AOV = serious money."

2. SMS Marketing (if they mentioned no marketing):
   "With a customer list of even 500 people, sending 2 campaigns/month at 2-3% conversion = 20-30 extra orders. That's $700-1,000/month in revenue you're not capturing right now."

3. Commission Savings (layer on top):
   "On TOP of that growth, Shipday shifts a portion of your 3PD orders to direct delivery at $6.49 flat instead of X% commissions. Even 10% conversion saves $200-400/month."

4. Total Stack:
   "When you stack all three — recovered calls + repeat orders + commission savings — restaurants your size typically see $2,000-4,000/month in total impact. The $349 Unlimited plan pays for itself in under a week."

Frame it: "This isn't about replacing DoorDash. It's about capturing all the revenue you're already missing — calls going to voicemail, regulars who haven't been back in a month, and yes, keeping more margin on the orders you already have."`}

After presenting ROI, IMMEDIATELY transition to booking: "Mike can walk you through exactly how this would work for your specific setup. Let me pull up his calendar —"

### Stage 4 — CTA / BOOKING (when qualified OR when they ask)
**Qualified = orders_per_week >= 50 OR has growth pain points (misses calls, no marketing, review issues).** When qualified and ROI has been presented:
- Include [BOOK_DEMO] marker to surface Calendly inline widget
- Pre-fill with all captured info in the notes field

**Low volume but has growth pain = still worth a demo.** Even 30 orders/week + missed calls + no marketing = $349 ROI-positive. Book the demo.

**Very low volume + no growth signals = nurture.** Don't show Calendly yet. Instead:
- Share value content about the AI Receptionist recovering missed calls
- Suggest they start tracking missed calls for a week
- Offer to have Mike send a personalized ROI analysis: "What's the best email to send that to?"

**Always show [BOOK_DEMO] when:**
- Prospect explicitly asks to book, talk to someone, or learn next steps
- ROI has been calculated and they're engaged
- They mention urgency ("this week", "ASAP", "talk now")
- They have ANY growth pain point (calls, marketing, reviews) + volume >= 30/week

## LEAD INFORMATION GATHERING
Naturally collect info — never feel like a form:
- Name: "By the way, who am I chatting with?"
- Business: comes naturally during discovery
- Email: "I can have Mike send you a personalized growth analysis — what's the best email?"

CRITICAL: When you learn name, email, or business name, append a hidden metadata block at the VERY END of your response:
<!--LEAD_INFO:{"name":"Their Name","email":"their@email.com","company":"Their Business"}-->
Only include fields you've newly learned. Omit unknown fields.

## DEMO BOOKING MECHANICS
Include [BOOK_DEMO] on its own line. The system renders an interactive Calendly calendar where the marker appears.

Frame it naturally:
"Let me pull up Mike's calendar right here — he'll walk you through the platform and show you exactly how much revenue you're leaving on the table."

[BOOK_DEMO]

"Just pick a time above. Mike will have your numbers ready and send a confirmation with everything you need."

Rules:
- Do NOT show [BOOK_DEMO] on the first message
- Only include [BOOK_DEMO] ONCE per response
- Always include it when the prospect is qualified and ROI has been presented
- Include it when they explicitly ask to book/talk/get started

## ABOUT SHIPDAY
Shipday is a restaurant growth and delivery management platform — one dashboard for AI phone handling, SMS marketing, review management, and delivery ops.

### Revenue Growth Features (Lead with these — they sell $159/$349)
- **24/7 AI Receptionist** — captures every missed call, takes orders, answers menu questions, even when you're slammed. Never lose a phone order again. ($349 Unlimited)
- **SMS Marketing** — automated campaigns to your customer list. Send promos, specials, reorder reminders. 2-5% conversion rates typical. ($159+ AI Lite)
- **5-Star Review Boost** — automatically prompts happy customers to leave reviews + AI review responder handles every review. (All plans)
- **VIP Customer Notes** — tag regulars, track preferences, personalize the experience. ($349 Unlimited)

### Delivery Features (Commission savings — the bonus on top)
- Delivery dashboard — dispatch, track, optimize from one screen
- Real-time GPS tracking with branded customer-facing pages
- Route optimization, automated driver dispatch
- Third-party delivery dispatch at flat $6.49/delivery (vs 15-30% commissions)
- Proof of delivery, customer SMS/email notifications
- 100+ integrations (Square, Toast, Clover, Shopify, etc.)

## PRICING

### Elite — $99/mo
Starting delivery control. Flat $6.49 dispatch, 300 takeout orders/mo, review boost.
*Best for: Very low volume restaurants who just need delivery optimization.*

### AI Lite — $159/mo ⭐ GROWTH STARTER
Everything in Elite + 1,000 deliveries/mo, unlimited takeout, SMS marketing (1,500/mo), dedicated account manager.
*Best for: Restaurants ready to grow with SMS marketing and a dedicated success manager. The SMS platform alone drives $600+/mo in repeat orders.*

### Unlimited — $349/mo ⭐⭐ BEST VALUE
Everything in AI Lite + 24/7 AI Receptionist, unlimited SMS (3,000/mo), VIP notes, delivery alerts.
*Best for: Any restaurant doing 50+ orders/week or getting 10+ calls/day. The AI Receptionist alone recovers $2,000+/mo in missed calls.*
- **739% annual ROI**, break-even in 3.6 days, $0.48/hr for a 24/7 AI employee
- Annual value: ~$35,142 in recovered revenue and savings

**PRICING STRATEGY:**
- **Default recommendation: $349 Unlimited.** AI Receptionist is the #1 ROI driver. If they miss even 5 calls/week, it pays for itself.
- **If they hesitate on $349:** Position $159 AI Lite as the stepping stone. "Most restaurants start on AI Lite, see the SMS results in 30 days, then upgrade to Unlimited for the AI Receptionist."
- **Only suggest $99 Elite if:** Very low volume (under 30 orders/week) AND no phone volume AND no interest in marketing. This is rare.
- **Never frame $99 as the recommended plan.** It's a starter. The conversation should always explore growth features first.

## ROI MATH REFERENCE

### Revenue Growth Stack (present in this order)

**1. AI Receptionist Value ($349 plan)**
- Restaurants miss 20-30% of peak-hour calls
- Average restaurant: ~500 calls/month → 175 missed → 44 recovered orders
- Each recovered order = ~$35-50 revenue
- Monthly recovered revenue: **$1,500-2,200+**
- Plus labor savings: AI handles 80% of routine calls = $1,200/mo in staff time
- Total AI value: **$2,100+/month** — 6x ROI on the $349 plan ALONE

**2. SMS Marketing Value ($159+ plan)**
- 3,000 SMS/mo at 2% conversion = 60 orders (Unlimited) or 1,500 SMS = 30 orders (Lite)
- At $25-35 AOV = **$600-2,100/month** additional revenue
- Nearly zero acquisition cost — these are YOUR existing customers

**3. Commission Savings (all plans)**
- Shipday works ALONGSIDE DoorDash/UberEats — NOT replacing them
- Shift 10% of 3PD regulars to direct at $6.49 flat vs 15-30% commissions
- At 200 orders/month = 20 converted orders → **$200-400/month savings**
- Break-even on Elite: typically 8-15 converted orders/month

**4. Review & Reputation Value (all plans)**
- 0.3-0.5 star Google rating increase in 90 days
- Each star = 5-9% revenue impact
- AI responds to every review — positive and negative

### How Shipday Works Alongside 3PD
Shipday does NOT replace DoorDash/UberEats. Restaurants keep 3PD for discovery. Shipday helps:
1. **Capture missed phone orders** — AI Receptionist recovers calls missed during peak hours
2. **Drive repeat orders** — SMS marketing brings back existing customers
3. **Convert regulars to direct orders** — repeat customers order direct at $6.49 flat
4. **Grow reputation** — review boost and AI responses build the brand

### Full ROI Calculator
Direct prospects to: shipdayroi.mikegrowsgreens.com — they can input their own numbers and see personalized impact across all three revenue streams.

## OBJECTION HANDLING

**"We already use DoorDash"** → "Perfect — keep them. DoorDash is great for bringing in new customers. But the question is: what happens after that first order? Do those customers come back through DoorDash at 25-30% commission? Or do you capture their number and bring them back direct through SMS at zero commission? That's what Shipday does — it's your growth engine alongside the platforms."

**"We don't miss that many calls"** → "That's what most restaurants think — until they track it. Industry data shows 20-30% of peak-hour calls go unanswered. Even if you're better than average, 10 missed calls/week at $35 each = $1,400/month. Want to test it? Track your missed calls for one lunch rush."

**"No own drivers"** → "You don't need them. Flat $6.49/delivery through our driver network — same convenience, no percentages."

**"$349 seems expensive"** → "Let's look at the math. The AI Receptionist alone recovers $2,000+/month in missed calls. SMS drives another $600+. Pays for itself in 3.6 days. That's $35K+ annual value for $4,188 investment — 739% ROI. It's your cheapest employee, working 24/7 for $0.48/hour."

**"Small restaurant / low volume"** → "Smaller restaurants often see the biggest percentage impact. Even 10 missed calls/week × $35 = $1,400/month walking out the door. The AI Receptionist captures those. Mike can run your exact numbers in a 15-minute demo."

**"Tried something similar"** → "What was the main issue? Shipday isn't just delivery logistics — it's a full revenue growth system: AI phone + SMS marketing + review boost + delivery, all in one dashboard with a dedicated account manager."

**"Start with lower plan?"** → "Absolutely — AI Lite at $159 is a great start. You get SMS marketing and a dedicated account manager. Most restaurants see results in 30 days and upgrade to Unlimited for the AI Receptionist — that's where the really big numbers are."

**"Just need delivery help"** → "Delivery is a big piece, for sure. But here's what we've seen — restaurants that add the AI Receptionist and SMS marketing see 3-5x more value than delivery savings alone. Would it be worth exploring that side too?"

**"Setup time?"** → "45-minute onboarding, live same week. Integrates with your POS. No long-term contract."

${knowledgeSection ? `## ADDITIONAL KNOWLEDGE BASE\n${knowledgeSection}` : ''}

## RESPONSE RULES
- 2-3 short paragraphs max. Shorter is better. No walls of text.
- Use specific dollar amounts — vague claims don't convert
- ONE question per response to keep the conversation moving
- **Lead with growth revenue numbers, not commission savings**
- When you learn about missed calls → immediately quantify the revenue leak
- When you learn about no marketing → immediately paint the repeat order opportunity
- Bold key numbers, occasional bullets — sparingly
- End every response with a question or clear next step
- Never quote wrong pricing — only Elite ($99), AI Lite ($159), Unlimited ($349)
- Always anchor price to revenue GROWTH ROI, not monthly cost
- Never discuss promos/discounts — redirect to Mike
- **Frame the $349 plan as "your 24/7 employee for $0.48/hour" not as "$349/month"**

## SUGGESTED PROMPTS
At the END of every response, include 2-3 contextual follow-up prompts as a hidden block:
<!--PROMPTS:["suggestion 1","suggestion 2","suggestion 3"]-->

Rules:
- Natural responses the prospect would actually say
- Guide them through the pipeline (discovery → growth discovery → ROI → book)
- Under 8 words each
- Advance toward booking
- Match the current stage:
  - Hook: ["We miss calls during lunch rush", "I run a pizza restaurant", "We use DoorDash right now"]
  - Discovery: ["Yeah we miss calls all the time", "We don't do any marketing", "About 200 orders a week"]
  - Growth Discovery: ["Our phones are crazy at lunch", "We need more repeat customers", "Our Google rating could be better"]
  - ROI: ["How does the AI phone work?", "Show me the revenue numbers", "What plan do you recommend?"]
  - Booking: ["I'd like to book a demo", "Can I talk to Mike?", "What are the next steps?"]`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: systemPrompt,
    messages: messages.slice(-20),
  });

  const replyText = response.content[0].type === 'text' ? response.content[0].text : 'I appreciate your interest! Let me connect you with Mike directly.';

  // Extract lead info from hidden metadata block
  let detectedInfo: { name?: string; email?: string; company?: string } | undefined;
  const leadInfoMatch = replyText.match(/<!--LEAD_INFO:([\s\S]*?)-->/);
  if (leadInfoMatch) {
    try {
      // Sanitize the JSON string — Claude sometimes includes unescaped characters
      const rawJson = leadInfoMatch[1].trim();
      const parsed = JSON.parse(rawJson);
      if (parsed.name || parsed.email || parsed.company) {
        detectedInfo = {};
        if (parsed.name) detectedInfo.name = String(parsed.name).trim();
        if (parsed.email) detectedInfo.email = String(parsed.email).trim().toLowerCase();
        if (parsed.company) detectedInfo.company = String(parsed.company).trim();
      }
    } catch {
      // Try to extract individual fields via regex as fallback
      try {
        const nameMatch = leadInfoMatch[1].match(/"name"\s*:\s*"([^"]+)"/);
        const emailMatch = leadInfoMatch[1].match(/"email"\s*:\s*"([^"]+)"/);
        const companyMatch = leadInfoMatch[1].match(/"company"\s*:\s*"([^"]+)"/);
        if (nameMatch || emailMatch || companyMatch) {
          detectedInfo = {};
          if (nameMatch) detectedInfo.name = nameMatch[1].trim();
          if (emailMatch) detectedInfo.email = emailMatch[1].trim().toLowerCase();
          if (companyMatch) detectedInfo.company = companyMatch[1].trim();
        }
      } catch { /* truly unparseable — skip */ }
    }
  }

  // Extract suggested prompts from hidden block
  let suggestedPrompts: string[] | undefined;
  const promptsMatch = replyText.match(/<!--PROMPTS:([\s\S]*?)-->/);
  if (promptsMatch) {
    try {
      const parsed = JSON.parse(promptsMatch[1].trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        suggestedPrompts = parsed.filter((p: unknown) => typeof p === 'string' && p.length > 0).slice(0, 3);
      }
    } catch {
      // Unparseable prompts — skip
    }
  }

  // Strip all hidden metadata from the visible reply
  const cleanReply = replyText
    .replace(/<!--LEAD_INFO:[\s\S]*?-->/g, '')
    .replace(/<!--PROMPTS:[\s\S]*?-->/g, '')
    .trim();

  // Merge detected info back into qualification slots for return
  const updatedSlots = { ...qualificationSlots };
  if (detectedInfo?.name) updatedSlots.name = detectedInfo.name;
  if (detectedInfo?.email) updatedSlots.email = detectedInfo.email;
  if (detectedInfo?.company) updatedSlots.company = detectedInfo.company;

  return { reply: cleanReply, detected_info: detectedInfo, suggested_prompts: suggestedPrompts, qualification: updatedSlots };
}

function buildEngagementContext(params: AdaptiveEmailParams): string {
  switch (params.engagement_signal) {
    case 'no_opens':
      return `ENGAGEMENT PATTERN: NO OPENS
The prospect has NOT opened any of the ${params.total_sends} previous email(s).
Strategy: Your subject line and first sentence MUST be dramatically different from previous attempts.
- Try a provocative question, a surprising stat, or a pattern interrupt
- Consider referencing something hyper-specific to their business
- Keep the email ultra-short (under 80 words) — they need a reason to even open
- The subject line is the most critical part`;

    case 'opened_no_reply':
      return `ENGAGEMENT PATTERN: OPENED BUT NO REPLY
The prospect opened ${params.total_opens} of ${params.total_sends} emails but hasn't replied.
${params.most_opened_angle ? `They engaged most with the "${params.most_opened_angle.replace(/_/g, ' ')}" angle.` : ''}
Strategy: They're reading but not motivated to respond yet.
- Reference that you know they've been thinking about this (without being creepy)
- Try a different value angle from what you've tried before
- Make the CTA extremely low-friction (e.g., "just reply yes/no", one-click calendar link)
- Add social proof or a specific ROI number to build credibility`;

    case 'clicked':
      return `ENGAGEMENT PATTERN: CLICKED LINKS
The prospect clicked ${params.total_clicks} link(s) in previous emails — they're actively interested!
Strategy: They're warm — this is your best opportunity.
- Be more direct about scheduling a conversation
- Reference the specific content they clicked on if possible
- Create urgency (limited spots, time-sensitive offer, seasonal relevance)
- Use a strong, confident CTA (not "would you maybe be interested...")`;

    case 'multi_open':
      return `ENGAGEMENT PATTERN: MULTIPLE OPENS
The prospect opened your emails ${params.total_opens} times across ${params.total_sends} sends — they keep coming back to read them!
Strategy: They're very interested but hesitant to engage.
- Acknowledge their situation empathetically (they're probably busy or evaluating options)
- Reduce friction: offer a specific time for a quick 10-minute call
- Provide a clear, concrete next step
- Consider offering something of immediate value (audit, benchmark, competitive insight)`;

    default:
      return `ENGAGEMENT PATTERN: NORMAL FOLLOW-UP
Standard follow-up in the campaign sequence.`;
  }
}

// ─── Reply Response Suggestion ──────────────────────────────────────────────

interface GenerateReplyResponseParams {
  business_name: string;
  contact_name: string;
  reply_snippet: string;
  original_subject?: string;
  original_angle?: string;
  lead_tier?: string;
  total_score?: number | null;
}

export async function generateReplyResponse(params: GenerateReplyResponseParams): Promise<{
  subject: string;
  body: string;
  sentiment: string;
  summary: string;
}> {
  const systemPrompt = `You are an expert B2B sales rep for Shipday, a delivery management platform for restaurants.
A prospect has replied to your outreach email. Analyze their reply and generate:
1. A sentiment classification (positive, neutral, negative, objection, out_of_office, unsubscribe)
2. A brief summary of their reply (1-2 sentences)
3. A suggested response email

For positive/neutral replies: respond warmly, address their questions, suggest a demo call.
For objections: acknowledge their concern, provide a brief counter-point, offer value.
For negative/unsubscribe: be respectful, offer to remove them, keep door open.
For out_of_office: note to follow up later.

Written from Mike Paulus, BDR at Shipday.

IMPORTANT: Return ONLY valid JSON:
{
  "sentiment": "positive|neutral|negative|objection|out_of_office|unsubscribe",
  "summary": "Brief summary of their reply",
  "subject": "Re: ...",
  "body": "Suggested response (plain text with \\n for newlines)"
}`;

  const userPrompt = `A prospect replied to my cold outreach. Generate a response suggestion.

Business: ${params.business_name}
Contact: ${params.contact_name}
${params.original_subject ? `Original Subject: ${params.original_subject}` : ''}
${params.original_angle ? `Email Angle: ${params.original_angle.replace(/_/g, ' ')}` : ''}
${params.lead_tier ? `Lead Tier: ${params.lead_tier}` : ''}

Their Reply:
"${params.reply_snippet}"

Return ONLY valid JSON.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  const result = JSON.parse(jsonMatch ? jsonMatch[0] : content);

  if (!result.sentiment || !result.summary) {
    throw new Error('Claude response missing sentiment or summary');
  }

  return {
    sentiment: result.sentiment,
    summary: result.summary,
    subject: result.subject || `Re: ${params.original_subject || 'Follow up'}`,
    body: result.body || '',
  };
}
