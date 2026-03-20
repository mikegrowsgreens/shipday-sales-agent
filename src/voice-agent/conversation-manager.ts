/**
 * Conversation Manager (Session 6 Enhanced)
 * Orchestrates the AI sales conversation. Reuses the elite sales prompt
 * architecture from Session 2, adapted for voice interactions.
 * Tracks qualification state, detects handoff triggers, computes ROI.
 *
 * Enhancements:
 * - Pacing state tracking and TTS speed adjustment
 * - Barge-in context awareness (knows what was interrupted)
 * - Call quality degraded mode (shorter responses when audio is bad)
 * - Strategic pauses after ROI reveals
 * - Enhanced stage advancement with pacing signals
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ConversationState,
  ConversationMessage,
  ContextCallback,
  VoiceStage,
  QualificationSlots,
  HandoffTrigger,
  PreCallBrief,
  PacingState,
  BargeInState,
} from './types';
import { createCallQualityState, getDegradedModeInstructions } from './call-quality';
import { query, queryOne } from './db';
import {
  checkGuardrails,
  checkResponseGuardrails,
  detectEscalation,
  scoreConversationQuality,
  checkVoiceLengthControl,
  buildVoiceGuardrailPrompt,
  redactConversation,
} from '../lib/guardrails';

// ─── Calendar Tool Definitions for Voice Agent ──────────────────────────────

const VOICE_CALENDAR_TOOLS = [
  {
    name: 'check_availability',
    description: 'Check available time slots for booking a demo. Call this when the prospect wants to book or mentions a specific day.',
    input_schema: {
      type: 'object' as const,
      properties: {
        date: { type: 'string', description: 'Date to check in YYYY-MM-DD format' },
        timezone: { type: 'string', description: 'IANA timezone string, e.g. America/New_York' },
        preferred_time: { type: 'string', description: 'Preferred time in HH:MM 24h format, e.g. 14:00 for 2pm' },
      },
      required: ['date', 'timezone'],
    },
  },
  {
    name: 'book_demo',
    description: 'Book a demo meeting at a specific time. Call this after the prospect chooses a time slot.',
    input_schema: {
      type: 'object' as const,
      properties: {
        starts_at: { type: 'string', description: 'ISO 8601 timestamp for the meeting start time' },
        name: { type: 'string', description: 'Prospect name' },
        email: { type: 'string', description: 'Prospect email address' },
        phone: { type: 'string', description: 'Prospect phone number (optional)' },
      },
      required: ['starts_at', 'name', 'email'],
    },
  },
];

/**
 * Execute a calendar tool via HTTP calls to the main Sales Hub app.
 * The voice agent runs as a separate process, so it calls the scheduling
 * API endpoints rather than importing the scheduling library directly.
 */
async function executeVoiceCalendarTool(
  toolName: string,
  input: Record<string, unknown>,
  eventTypeId: number,
): Promise<string> {
  const apiBase = process.env.SALESHUB_API_BASE || 'http://localhost:3000';
  const internalKey = process.env.INTERNAL_API_KEY || '';
  const internalHeaders: Record<string, string> = internalKey ? { 'x-internal-key': internalKey } : {};

  if (toolName === 'check_availability') {
    const date = input.date as string;
    const tz = (input.timezone as string) || 'America/New_York';
    try {
      const url = `${apiBase}/api/scheduling/slots?event_type_id=${eventTypeId}&date=${date}&timezone=${encodeURIComponent(tz)}`;
      const res = await fetch(url, { headers: internalHeaders });
      if (!res.ok) {
        return JSON.stringify({ error: 'Could not check availability. Ask for their contact info for manual follow-up.' });
      }
      const data = await res.json();
      const slots = (data.slots || []).slice(0, 6).map((s: { start: string }) => s.start);
      if (slots.length === 0) {
        return JSON.stringify({ available: false, message: 'No slots available on this date', slots: [] });
      }
      return JSON.stringify({ available: true, slots, timezone: tz });
    } catch (err) {
      console.error('[voice] check_availability error:', err);
      return JSON.stringify({ error: 'Could not check availability.' });
    }
  }

  if (toolName === 'book_demo') {
    try {
      const res = await fetch(`${apiBase}/api/scheduling/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalHeaders },
        body: JSON.stringify({
          event_type_id: eventTypeId,
          starts_at: input.starts_at,
          timezone: (input.timezone as string) || 'America/New_York',
          name: input.name,
          email: input.email,
          phone: input.phone || undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return JSON.stringify({ error: (errData as Record<string, string>).error || 'Booking failed. Ask for their contact info.' });
      }
      const data = await res.json();
      return JSON.stringify({
        success: true,
        booking_id: data.booking_id,
        meeting_url: data.meeting_url,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
      });
    } catch (err) {
      console.error('[voice] book_demo error:', err);
      return JSON.stringify({ error: 'Booking failed. Ask for their contact info.' });
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${toolName}` });
}

// ─── Conversation State Store ───────────────────────────────────────────────

const activeCalls = new Map<string, ConversationState>();

export function getConversation(callSid: string): ConversationState | undefined {
  return activeCalls.get(callSid);
}

export function getAllActiveCalls(): Map<string, ConversationState> {
  return activeCalls;
}

function createPacingState(): PacingState {
  return {
    prospectWpm: 150,
    avgUtteranceDurationMs: 0,
    sampleCount: 0,
    ttsSpeed: 1.0,
    insertPauseBeforeNext: false,
    pauseDurationMs: 0,
  };
}

function createBargeInState(): BargeInState {
  return {
    active: false,
    speechBuffer: [],
    interruptedAgentText: '',
    interruptionPoint: 0,
    detectedAt: null,
  };
}

export async function initConversation(
  callSid: string,
  contactId?: number,
  orgId?: number,
  customParams?: Record<string, string>,
): Promise<ConversationState> {
  const sessionId = `voice_${callSid}_${Date.now()}`;

  // Load brain content
  let brainContent: Array<Record<string, unknown>> = [];
  try {
    brainContent = await query(
      `SELECT content_type, title, raw_text, key_claims, value_props, pain_points_addressed
       FROM brain.internal_content
       WHERE is_active = true
       ORDER BY updated_at DESC
       LIMIT 10`
    );
  } catch (e) {
    console.warn('[conversation] Failed to load brain content:', e);
  }

  // Load pre-call brief if we have a contact
  let preCallBrief: PreCallBrief | undefined;
  if (contactId) {
    try {
      preCallBrief = await loadPreCallBrief(contactId);
    } catch (e) {
      console.warn('[conversation] Failed to load pre-call brief:', e);
    }
  }

  // Load call patterns for sales intelligence
  let callPatterns: Array<Record<string, unknown>> = [];
  try {
    callPatterns = await query(
      `SELECT pattern_type, pattern_text, context, effectiveness_score
       FROM brain.call_patterns
       WHERE effectiveness_score > 0.5
       ORDER BY effectiveness_score DESC
       LIMIT 15`
    );
    brainContent.push(...callPatterns.map(p => ({
      content_type: `call_pattern_${p.pattern_type}`,
      title: p.pattern_type as string,
      raw_text: p.pattern_text as string,
    })));
  } catch {
    // call_patterns table may not exist yet
  }

  // Resolve scheduling event type for calendar tool calling
  let schedulingEventTypeId: number | undefined;
  try {
    const eventTypes = await query<{ event_type_id: number }>(
      `SELECT event_type_id FROM crm.scheduling_event_types
       WHERE org_id = $1 AND is_active = true
       ORDER BY created_at ASC LIMIT 1`,
      [orgId || 1]
    );
    if (eventTypes.length > 0) {
      schedulingEventTypeId = eventTypes[0].event_type_id;
    }
  } catch {
    // crm schema may not be accessible from voice agent DB, will fall back to HTTP
  }

  const state: ConversationState = {
    callSid,
    sessionId,
    stage: 'greeting',
    messages: [],
    qualificationSlots: {},
    startedAt: new Date(),
    lastActivityAt: new Date(),
    handoffTriggered: false,
    contactId,
    orgId,
    brainContent,
    preCallBrief,
    interruptionCount: 0,
    silenceCount: 0,
    pacing: createPacingState(),
    bargeIn: createBargeInState(),
    callQuality: createCallQualityState(),
    lastResponseHadROI: false,
    contextCallbacks: [],
    nameConfirmed: false,
    schedulingEventTypeId,
  };

  activeCalls.set(callSid, state);
  return state;
}

export function endConversation(callSid: string): ConversationState | undefined {
  const state = activeCalls.get(callSid);
  if (state) {
    state.stage = 'ended';
    activeCalls.delete(callSid);

    // Session 8: PII-redacted conversation logging for compliance
    logRedactedVoiceConversation(state).catch(err => {
      console.error('[conversation] redacted voice logging failed:', err);
    });
  }
  return state;
}

/**
 * Session 8: Log PII-redacted voice conversation for compliance.
 */
async function logRedactedVoiceConversation(state: ConversationState): Promise<void> {
  try {
    const messages = state.messages.map(m => ({
      role: m.role === 'agent' ? 'assistant' : 'user',
      content: m.content,
    }));
    const redacted = redactConversation(messages);
    const hadRedactions = redacted.some(m => m.redacted);

    await query(
      `INSERT INTO brain.conversation_logs
        (conversation_id, org_id, messages_redacted, message_count, had_pii_redactions, channel, logged_at)
       VALUES ($1, $2, $3, $4, $5, 'voice', NOW())
       ON CONFLICT (conversation_id) DO UPDATE SET
         messages_redacted = $3,
         message_count = $4,
         had_pii_redactions = $5,
         logged_at = NOW()`,
      [
        state.sessionId,
        state.orgId || 1,
        JSON.stringify(redacted),
        redacted.length,
        hadRedactions,
      ],
    );
  } catch (err) {
    console.error('[conversation] redacted logging error:', err);
  }
}

// ─── Pacing ──────────────────────────────────────────────────────────────────

/**
 * Update pacing state from STT speaking rate data.
 */
export function updatePacing(callSid: string, wpm: number): void {
  const state = activeCalls.get(callSid);
  if (!state) return;

  state.prospectSpeakingRate = wpm;
  state.pacing.prospectWpm = wpm;

  // Map WPM to TTS speed multiplier
  // Slow speakers (<110 WPM) → AI speaks slower (0.85)
  // Normal speakers (110-170 WPM) → AI matches (0.95-1.05)
  // Fast speakers (>170 WPM) → AI speeds up slightly (1.1)
  if (wpm < 100) {
    state.pacing.ttsSpeed = 0.85;
  } else if (wpm < 120) {
    state.pacing.ttsSpeed = 0.9;
  } else if (wpm < 140) {
    state.pacing.ttsSpeed = 0.95;
  } else if (wpm < 170) {
    state.pacing.ttsSpeed = 1.0;
  } else if (wpm < 200) {
    state.pacing.ttsSpeed = 1.05;
  } else {
    state.pacing.ttsSpeed = 1.1;
  }
}

/**
 * Mark that the next response should include a strategic pause.
 */
export function requestPause(callSid: string, durationMs: number): void {
  const state = activeCalls.get(callSid);
  if (!state) return;
  state.pacing.insertPauseBeforeNext = true;
  state.pacing.pauseDurationMs = durationMs;
}

// ─── Barge-In Context ────────────────────────────────────────────────────────

/**
 * Record a barge-in event with context about what was interrupted.
 */
export function recordBargeIn(
  callSid: string,
  interruptedText: string,
  interruptionPoint: number,
): void {
  const state = activeCalls.get(callSid);
  if (!state) return;

  state.bargeIn = {
    active: true,
    speechBuffer: [],
    interruptedAgentText: interruptedText,
    interruptionPoint,
    detectedAt: new Date(),
  };
  state.interruptionCount++;
}

/**
 * Add buffered speech from during the barge-in.
 */
export function addBargeInSpeech(callSid: string, text: string): void {
  const state = activeCalls.get(callSid);
  if (!state || !state.bargeIn.active) return;
  state.bargeIn.speechBuffer.push(text);
}

/**
 * Clear barge-in state after processing.
 */
export function clearBargeIn(callSid: string): void {
  const state = activeCalls.get(callSid);
  if (!state) return;
  state.bargeIn = createBargeInState();
}

// ─── AI Response Generation ─────────────────────────────────────────────────

const anthropic = new Anthropic();

export async function generateResponse(
  callSid: string,
  prospectUtterance: string,
): Promise<{ text: string; handoffTriggered: boolean; handoffTrigger?: HandoffTrigger; shouldPauseAfter: boolean }> {
  const state = activeCalls.get(callSid);
  if (!state) throw new Error(`No active conversation for ${callSid}`);

  // Record prospect message
  state.messages.push({
    role: 'prospect',
    content: prospectUtterance,
    timestamp: new Date(),
  });
  state.lastActivityAt = new Date();

  // Session 8: Input guardrail check — PII and hard fences
  const inputGuardrail = checkGuardrails(prospectUtterance);
  if (inputGuardrail && inputGuardrail.severity === 'hard') {
    state.messages.push({ role: 'agent', content: inputGuardrail.redirect, timestamp: new Date() });
    return { text: inputGuardrail.redirect, handoffTriggered: false, shouldPauseAfter: false };
  }

  // Check for handoff triggers before generating response
  const handoffCheck = detectHandoffTrigger(state, prospectUtterance);
  if (handoffCheck) {
    state.handoffTriggered = true;
    state.handoffReason = handoffCheck;
    state.stage = 'handoff';
    return {
      text: getHandoffTransitionPhrase(handoffCheck, state),
      handoffTriggered: true,
      handoffTrigger: handoffCheck,
      shouldPauseAfter: false,
    };
  }

  // Session 8: Escalation detection
  const voiceMessages = state.messages.map(m => ({
    role: m.role === 'agent' ? 'assistant' : 'user',
    content: m.content,
  }));
  const escalation = detectEscalation(prospectUtterance, voiceMessages, state.interruptionCount);

  // Session 8: If severe escalation, force handoff
  if (escalation.recommendation === 'immediate_handoff') {
    state.handoffTriggered = true;
    state.handoffReason = 'emotional_escalation';
    state.stage = 'handoff';
    return {
      text: getHandoffTransitionPhrase('emotional_escalation', state),
      handoffTriggered: true,
      handoffTrigger: 'emotional_escalation',
      shouldPauseAfter: false,
    };
  }

  // Update qualification slots from latest utterance
  updateQualificationSlots(state, prospectUtterance);

  // Session 10: Extract contextual callbacks for wow moments
  extractContextCallbacks(state, prospectUtterance);

  // Track previous stage for transition detection
  const previousStage = state.stage;
  state.previousStage = previousStage;

  // Advance stage based on qualification state
  advanceStage(state);

  // Session 8: Voice length control
  const callDurationSec = Math.round((Date.now() - state.startedAt.getTime()) / 1000);
  const hasAdvancedStage = state.stage !== previousStage;
  const lengthControl = checkVoiceLengthControl(callDurationSec, state.messages.length, hasAdvancedStage);

  // Session 8: Conversation quality scoring
  const qualityScore = scoreConversationQuality(
    voiceMessages,
    state.stage,
    state.qualificationSlots as Record<string, unknown>,
  );

  // Build system prompt (now includes degraded mode instructions if needed)
  let systemPrompt = buildVoiceSystemPrompt(state);

  // Session 8: Append dynamic guardrail context
  const guardrailSection = buildVoiceGuardrailPrompt(escalation, qualityScore, lengthControl);
  if (guardrailSection) {
    systemPrompt += guardrailSection;
  }

  // Build message history for Claude
  const claudeMessages = state.messages.map(m => ({
    role: (m.role === 'agent' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content,
  }));

  // If barge-in happened, add context about what was interrupted
  if (state.bargeIn.active && state.bargeIn.interruptedAgentText) {
    // Prepend context about the interruption
    const bargeInContext = `[Note: The prospect interrupted your previous response. You were saying: "${state.bargeIn.interruptedAgentText.substring(0, 100)}..." They want to say something. Address their point directly.]`;
    claudeMessages.push({
      role: 'user' as const,
      content: bargeInContext + '\n\n' + prospectUtterance,
    });
    // Remove the duplicate last user message
    claudeMessages.splice(-2, 1);
    clearBargeIn(callSid);
  }

  try {
    // Use shorter max_tokens in degraded mode
    const maxTokens = state.callQuality.degradedMode ? 150 : 300;
    const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

    // Build API params with calendar tools if event type is resolved
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseParams: any = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
    };
    if (state.schedulingEventTypeId) {
      baseParams.tools = VOICE_CALENDAR_TOOLS;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let loopMessages: any[] = [...claudeMessages];
    let response = await anthropic.messages.create({ ...baseParams, messages: loopMessages });

    // Tool execution loop (max 3 iterations)
    let usedCalendarTools = false;
    for (let i = 0; i < 3 && response.stop_reason === 'tool_use' && state.schedulingEventTypeId; i++) {
      usedCalendarTools = true;
      const assistantContent = response.content;
      loopMessages = [...loopMessages, { role: 'assistant', content: assistantContent }];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolResults: any[] = [];
      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          const result = await executeVoiceCalendarTool(
            block.name,
            block.input as Record<string, unknown>,
            state.schedulingEventTypeId,
          );
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        }
      }

      loopMessages = [...loopMessages, { role: 'user', content: toolResults }];
      response = await anthropic.messages.create({ ...baseParams, messages: loopMessages });
    }

    const textBlock = response.content.find((b: { type: string }) => b.type === 'text');
    let text = textBlock && textBlock.type === 'text' ? (textBlock as { type: 'text'; text: string }).text : '';

    // Prepend natural filler when calendar tools were used (covers the API latency gap)
    if (usedCalendarTools && text) {
      text = `Let me check that for you. ${text}`;
    }

    // Session 8: Check AI response for guardrail violations (output side)
    const responseCheck = checkResponseGuardrails(text);
    if (responseCheck.cleanedResponse) {
      text = responseCheck.cleanedResponse;
      if (responseCheck.violations.length > 0) {
        console.warn('[conversation] Response guardrail violations cleaned:', responseCheck.violations.map(v => `${v.fence}:${v.trigger}`).join(', '));
      }
    }

    // Clean response for voice (remove markdown, links, etc.)
    const cleanedText = cleanForVoice(text);

    // Record agent message
    state.messages.push({
      role: 'agent',
      content: cleanedText,
      timestamp: new Date(),
    });

    // Determine if this response includes ROI data (triggers strategic pause)
    const hasROI = cleanedText.match(/\$[\d,]+/) !== null && state.stage === 'roi_crystallization';
    state.lastResponseHadROI = hasROI;

    // Determine if we just entered ROI stage (trigger pause after ROI reveal)
    const shouldPauseAfter = hasROI || (previousStage !== 'roi_crystallization' && state.stage === 'roi_crystallization');

    return { text: cleanedText, handoffTriggered: false, shouldPauseAfter };
  } catch (error) {
    console.error('[conversation] Claude API error:', error);
    return {
      text: "I appreciate your patience. Let me connect you with someone who can help right away.",
      handoffTriggered: true,
      handoffTrigger: 'stalled_conversation',
      shouldPauseAfter: false,
    };
  }
}

/**
 * Generate the initial greeting when the call connects.
 */
export async function generateGreeting(callSid: string): Promise<string> {
  const state = activeCalls.get(callSid);
  if (!state) return "Hi there! Thanks for calling.";

  if (state.preCallBrief) {
    const brief = state.preCallBrief;
    const greeting = `Hey ${brief.contactName}, this is Shipday. ${brief.opener}`;
    state.messages.push({ role: 'agent', content: greeting, timestamp: new Date() });
    state.stage = 'hook';
    return greeting;
  }

  const defaultGreeting = "Hey, this is Shipday's sales line. What can I help you with?";
  state.messages.push({ role: 'agent', content: defaultGreeting, timestamp: new Date() });
  state.stage = 'hook';
  return defaultGreeting;
}

// ─── Voice System Prompt Builder ────────────────────────────────────────────

function buildVoiceSystemPrompt(state: ConversationState): string {
  const brief = state.preCallBrief;
  const slots = state.qualificationSlots;

  // Build knowledge section from brain content
  let knowledgeSection = '';
  if (state.brainContent.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const item of state.brainContent) {
      const type = (item.content_type as string) || 'general';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push((item.raw_text as string) || '');
    }
    knowledgeSection = Object.entries(grouped)
      .map(([type, items]) => `### ${type.replace(/_/g, ' ').toUpperCase()}\n${items.join('\n')}`)
      .join('\n\n');
  }

  // Build qualification state
  let qualState = '';
  if (Object.keys(slots).length > 0) {
    qualState = `
## CURRENT QUALIFICATION STATE
- Stage: ${state.stage.toUpperCase()}
- Name: ${slots.name ?? 'unknown'}
- Company: ${slots.company ?? 'unknown'}
- Orders/week: ${slots.orders_per_week ?? 'unknown'}
- Average order value: ${slots.aov ? '$' + slots.aov : 'unknown'}
- Commission tier: ${slots.commission_tier ? slots.commission_tier + '%' : 'unknown'}
- Restaurant type: ${slots.restaurant_type ?? 'unknown'}
- Qualified: ${slots.qualified === true ? 'YES' : 'not yet'}

DO NOT re-ask for filled slots. Advance the conversation.`;
  }

  // Pacing instructions based on prospect's speaking rate
  let pacingInstructions = '';
  if (state.pacing.prospectWpm < 110) {
    pacingInstructions = `
## PACING NOTE
The prospect speaks slowly (~${state.pacing.prospectWpm} WPM). Match their pace:
- Use shorter, simpler sentences
- Pause naturally between thoughts
- Do not rush. Let them process`;
  } else if (state.pacing.prospectWpm > 180) {
    pacingInstructions = `
## PACING NOTE
The prospect speaks quickly (~${state.pacing.prospectWpm} WPM). Keep up:
- Be concise and direct
- Skip pleasantries when appropriate
- Match their energy`;
  }

  // Call quality degraded mode instructions
  const degradedInstructions = getDegradedModeInstructions(state.callQuality);

  // Interruption awareness
  let interruptionNote = '';
  if (state.interruptionCount >= 3) {
    interruptionNote = `
## INTERRUPTION NOTE
The prospect has interrupted ${state.interruptionCount} times. They may be:
- Eager and engaged (positive sign)
- Impatient with long responses (keep it shorter)
- Frustrated (check in: "Am I addressing your question?")`;
  }

  // Session 10: Wow moments section
  let wowMoments = `
## WOW MOMENTS. Make the conversation feel personal and human.

### HUMOR ACKNOWLEDGMENT
If the prospect laughs, chuckles, or makes a joke:
- Laugh briefly and naturally. "Ha! That's a good one" or "I love that"
- If they are self-deprecating about their tech skills: "Hey, you are running a restaurant, that is way harder than tech"
- Mirror their humor style. Do not force jokes. A brief, warm acknowledgment is perfect.
- NEVER ignore laughter. Dead silence after a joke kills rapport instantly.

### NAME PRONUNCIATION
${!state.nameConfirmed && state.qualificationSlots.name ? `You learned the prospect's name is "${state.qualificationSlots.name}". If the name could be tricky to pronounce, ask ONCE early: "I want to make sure I am saying your name right, is it ${state.qualificationSlots.name}?" Then use their name naturally 2-3 times during the call. Never ask twice.` : state.nameConfirmed ? `Prospect's name confirmed: ${state.qualificationSlots.name}. Use it naturally 2-3 times.` : 'When you learn their name, use it naturally throughout the call.'}`;

  // Contextual callbacks
  if (state.contextCallbacks.length > 0) {
    wowMoments += `\n\n### CONTEXTUAL CALLBACKS. Reference earlier topics naturally.
The prospect mentioned these topics earlier. Weave them back in when relevant:`;
    for (const cb of state.contextCallbacks) {
      const callbackTips: Record<string, string> = {
        rush_period: `They mentioned "${cb.detail}", reference it: "You know, especially during that rush you mentioned..."`,
        third_party_platform: `They are using ${cb.detail}, callback: "And unlike ${cb.detail} where you are losing control..."`,
        missed_opportunities: `Pain point: ${cb.detail}, amplify: "Going back to those missed orders you mentioned..."`,
        staffing: `Staffing challenge: ${cb.detail}, connect: "And since you mentioned being short-staffed, this handles it automatically"`,
        expansion: `Growth plans: ${cb.detail}, tie in: "Especially as you are looking at expanding..."`,
        reputation: `Reviews concern: ${cb.detail}, link: "And for your online reputation..."`,
        cost_pain: `Cost sensitivity: ${cb.detail}, validate: "That is exactly the kind of cost we help eliminate"`,
        catering: `Catering interest: ${cb.detail}, connect: "For those catering orders you mentioned, this is huge..."`,
        customer_retention: `Retention focus: ${cb.detail}, weave: "And those repeat customers you care about..."`,
        online_presence: `Online ordering: ${cb.detail}, reference: "For your online ordering setup..."`,
      };
      wowMoments += `\n- ${callbackTips[cb.topic] || `Topic "${cb.detail}", reference naturally when relevant`}`;
    }
    wowMoments += `\n\nDO: Reference ONE callback per response max. Space them out naturally.
DON'T: List them all at once or say "you mentioned earlier" every response.`;
  }

  return `You are on a live phone call representing Shipday. You help restaurant owners understand how Shipday saves them money on delivery.

## VOICE RULES (non-negotiable)
1. Every response is 1-2 sentences MAX. This is a phone call, not a chat.
2. No formatting. No bullets. No markdown. No URLs. Just spoken words.
3. Never use em dashes. Use commas or periods.
4. Ask ONE question, then stop and wait for the answer.
5. Confirm details out loud before moving on: "So about 200 orders a week, most through DoorDash, that right?"
6. Use natural connectors: "Got it.", "Makes sense.", "Interesting.", "Okay so..."
7. NEVER say: "Certainly", "Absolutely", "Of course", "Great question", "I'd be happy to"
8. Do not repeat what they said word for word. Paraphrase to show you understood.
9. If they ask whether you are AI, be honest: "Yeah, I am Shipday's AI assistant. I can answer most questions, or I can connect you with Mike who handles all the account setup."
10. If the call goes cold, make one offer and exit: "No problem. If you want to revisit, just give us a call back." Then stop.
11. Never use markdown, links, emojis, or any text formatting. This is spoken audio.
12. Mirror their energy. If they are casual, be casual. If formal, be professional.

## YOUR JOB
Qualify the prospect, show them their ROI, and either book a demo or connect them with Mike.

## FLOW
GREETING: Short and warm. "Hey, this is Shipday's sales line. What can I help you with?"
DISCOVERY: One question at a time. Orders per week, average order value, current delivery setup, commission rate. React before each new question.
PAIN: Quantify their loss. "So at those numbers, you are giving up about $4,500 a month to third-party platforms. That is $54K a year."
ROI: Present savings. Pause after the big number. Let it land.
BOOK: "Want me to find a time for you to talk with Mike? He can walk you through the whole setup."

${qualState}

${brief ? `## INTEL
Talking to ${brief.contactName} from ${brief.businessName}.
${brief.closeStrategy}
${brief.keyPoints.length > 0 ? `Key context: ${brief.keyPoints.join('; ')}` : ''}
${brief.riskFlags.length > 0 ? `Watch out for: ${brief.riskFlags.join('; ')}` : ''}` : ''}

## GUARDRAILS
- Never discuss exact pricing. "Mike handles pricing. Want me to get you on his calendar?"
- Never guarantee results. "Restaurants like yours typically see..."
- Never trash competitors by name. Differentiate on value.
- If they get frustrated or ask for a human, connect immediately: "Let me get you connected with Mike."
- If 8 plus minutes with no progress, offer the exit: "Sounds like you have a lot going on. Want me to have Mike reach out when it is more convenient?"
- Never discuss off-topic subjects. Redirect to business.
- TERMINOLOGY: Always say "automated marketing" or "automated text marketing." Never say just "marketing" alone.
- PII protection: only collect name, email, company, phone.

## HANDOFF TRIGGERS
Connect to Mike when: prospect requests a human, pricing negotiation starts, strong buying intent with qualification complete, or prospect is frustrated.

${wowMoments}

${pacingInstructions}
${degradedInstructions}
${interruptionNote}

${knowledgeSection ? `## KNOWLEDGE\n${knowledgeSection}` : ''}

${state.computedROI ? `## ROI\n${state.computedROI}` : ''}`;
}

// ─── Qualification Slot Extraction ──────────────────────────────────────────

function updateQualificationSlots(state: ConversationState, utterance: string): void {
  const slots = state.qualificationSlots;
  const lower = utterance.toLowerCase();

  // Orders per week
  const orderMatch = lower.match(/(\d+)\s*(?:orders?|deliveries?)\s*(?:per|a|each)?\s*(?:week|day)/);
  if (orderMatch) {
    const num = parseInt(orderMatch[1]);
    if (lower.includes('day')) {
      slots.orders_per_week = num * 7;
    } else {
      slots.orders_per_week = num;
    }
  }

  // AOV
  const aovMatch = lower.match(/(?:average|avg|about|around)\s*\$?(\d+(?:\.\d+)?)/);
  if (aovMatch && lower.includes('order')) {
    slots.aov = parseFloat(aovMatch[1]);
  }

  // Commission tier
  const commMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:percent|%)\s*(?:commission|fee)/);
  if (commMatch) {
    slots.commission_tier = parseFloat(commMatch[1]);
  }

  // Restaurant type
  const types = ['pizza', 'chinese', 'mexican', 'indian', 'thai', 'sushi', 'burger', 'bbq', 'italian', 'seafood', 'bakery', 'cafe', 'deli', 'catering'];
  for (const type of types) {
    if (lower.includes(type)) {
      slots.restaurant_type = type;
      break;
    }
  }

  // Company name (basic extraction)
  const nameMatch = utterance.match(/(?:called|named|it's|we're)\s+([A-Z][A-Za-z'\s]{2,30})/);
  if (nameMatch && !slots.company) {
    slots.company = nameMatch[1].trim();
  }

  // Personal name
  const personalMatch = utterance.match(/(?:I'm|my name is|this is|I am)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  if (personalMatch && !slots.name) {
    slots.name = personalMatch[1];
  }

  // Session 10: Detect name pronunciation confirmation
  if (slots.name && lower.includes('you can call me') || lower.includes('it\'s pronounced') || lower.includes('yeah that\'s right') || lower.includes('yes, ')) {
    state.nameConfirmed = true;
  }

  // Qualification check
  if (slots.orders_per_week && slots.orders_per_week >= 50) {
    slots.qualified = true;
  } else if (slots.orders_per_week && slots.orders_per_week < 50) {
    slots.qualified = false;
  }

  // Growth signals
  if (lower.includes('grow') || lower.includes('expand') || lower.includes('more customers') ||
      lower.includes('marketing') || lower.includes('repeat') || lower.includes('loyalty')) {
    slots.growth_qualified = true;
  }
}

// ─── Session 10: Contextual Callback Extraction ─────────────────────────────

const CALLBACK_PATTERNS: Array<{ regex: RegExp; topic: string }> = [
  { regex: /(?:lunch|dinner|breakfast)\s*rush/i, topic: 'rush_period' },
  { regex: /(?:doordash|uber\s*eats?|grubhub|postmates)/i, topic: 'third_party_platform' },
  { regex: /(?:miss(?:ed|ing)?|lost)\s+(?:calls?|orders?|customers?)/i, topic: 'missed_opportunities' },
  { regex: /(?:short[-\s]?staffed|can't find|hiring|understaffed)/i, topic: 'staffing' },
  { regex: /(?:opening|new location|second location|expanding)/i, topic: 'expansion' },
  { regex: /(?:reviews?|yelp|google rating|reputation)/i, topic: 'reputation' },
  { regex: /(?:commission|fees?|paying too much|expensive)/i, topic: 'cost_pain' },
  { regex: /(?:catering|large orders?|corporate)/i, topic: 'catering' },
  { regex: /(?:repeat customers?|regulars?|loyalty)/i, topic: 'customer_retention' },
  { regex: /(?:website|online ordering|web orders?)/i, topic: 'online_presence' },
];

function extractContextCallbacks(state: ConversationState, utterance: string): void {
  for (const { regex, topic } of CALLBACK_PATTERNS) {
    const match = utterance.match(regex);
    if (match && !state.contextCallbacks.some(cb => cb.topic === topic)) {
      state.contextCallbacks.push({
        topic,
        detail: match[0],
        mentionedAt: new Date(),
        stage: state.stage,
      });
    }
  }
}

// ─── Stage Advancement ──────────────────────────────────────────────────────

function advanceStage(state: ConversationState): void {
  const slots = state.qualificationSlots;
  const msgCount = state.messages.length;

  const hasOrders = slots.orders_per_week !== undefined;
  const hasAov = slots.aov !== undefined;
  const hasTier = slots.commission_tier !== undefined;
  const coreDiscoveryComplete = hasOrders && hasAov && hasTier;

  if (state.handoffTriggered) {
    state.stage = 'handoff';
  } else if (coreDiscoveryComplete && state.computedROI) {
    state.stage = 'roi_crystallization';
  } else if (coreDiscoveryComplete) {
    state.stage = 'solution_mapping';
    // Compute ROI when we have enough data
    computeROI(state);
  } else if (hasOrders || hasAov) {
    state.stage = 'discovery';
  } else if (msgCount <= 2) {
    state.stage = 'hook';
  } else if (msgCount <= 4) {
    state.stage = 'rapport';
  } else {
    state.stage = 'discovery';
  }
}

function computeROI(state: ConversationState): void {
  const slots = state.qualificationSlots;
  if (!slots.orders_per_week || !slots.aov) return;

  const ordersPerMonth = slots.orders_per_week * 4.3;
  const commission = (slots.commission_tier || 25) / 100;
  const monthlyRevenue = ordersPerMonth * (slots.aov || 30);
  const monthlySavings = monthlyRevenue * commission;
  const annualSavings = monthlySavings * 12;

  state.computedROI = `Based on ${slots.orders_per_week} orders/week at $${slots.aov} avg:
- Monthly delivery revenue: $${monthlyRevenue.toLocaleString()}
- Current commission loss: $${monthlySavings.toLocaleString()}/month (${(commission * 100).toFixed(0)}%)
- Annual savings with Shipday: $${annualSavings.toLocaleString()}
- Break-even: ~${Math.ceil(99 / (monthlySavings / 30))} days`;
}

// ─── Handoff Detection ──────────────────────────────────────────────────────

function detectHandoffTrigger(state: ConversationState, utterance: string): HandoffTrigger | null {
  const lower = utterance.toLowerCase();

  // Prospect explicitly requests human
  if (lower.match(/(?:talk to|speak with|connect me|real person|human|manager|supervisor|someone else)/)) {
    return 'prospect_request';
  }

  // Pricing negotiation
  if (lower.match(/(?:discount|cheaper|negotiate|lower price|too expensive|can you do better)/)) {
    return 'prospect_request'; // Route pricing to human
  }

  // High intent + qualification complete
  const slots = state.qualificationSlots;
  if (slots.qualified && state.computedROI &&
      lower.match(/(?:sign up|get started|ready|let's do it|sounds good|i'm in|when can we start)/)) {
    return 'high_intent';
  }

  // Emotional escalation
  if (lower.match(/(?:frustrated|angry|waste of time|not interested|stop calling|leave me alone|ridiculous)/)) {
    state.interruptionCount++;
    if (state.interruptionCount >= 2) {
      return 'emotional_escalation';
    }
  }

  // Stalled conversation (handled in server.ts via timeout)

  return null;
}

function getHandoffTransitionPhrase(trigger: HandoffTrigger, state: ConversationState): string {
  const repName = 'Mike';
  const contactName = state.qualificationSlots.name || 'there';

  switch (trigger) {
    case 'prospect_request':
      return `Sure thing, ${contactName}. Let me connect you with ${repName} right now. He handles all the account setup. One moment.`;
    case 'high_intent':
      return `That sounds great, ${contactName}. Let me get you connected with ${repName}. He will walk you through the full setup. Connecting you now.`;
    case 'emotional_escalation':
      return `I hear you, ${contactName}. Let me connect you with ${repName} directly, he can help with this. One moment.`;
    case 'stalled_conversation':
      return `${contactName}, I think the best next step is to connect you with ${repName}. He can give you a personalized walkthrough. Transferring you now.`;
    default:
      return `Let me connect you with ${repName} who can help with this directly. One moment.`;
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function cleanForVoice(text: string): string {
  return text
    .replace(/\[.*?\]/g, '') // Remove [BOOK_DEMO] etc.
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
    .replace(/\*(.*?)\*/g, '$1') // Remove italic
    .replace(/#{1,6}\s/g, '') // Remove headers
    .replace(/\n{2,}/g, '. ') // Double newlines to period
    .replace(/\n/g, ' ') // Single newlines to space
    .replace(/\s{2,}/g, ' ') // Multiple spaces
    .replace(/https?:\/\/\S+/g, '') // Remove URLs
    .trim();
}

// ─── Pre-Call Brief Loader ──────────────────────────────────────────────────

async function loadPreCallBrief(contactId: number): Promise<PreCallBrief | undefined> {
  const contact = await queryOne<{
    first_name: string | null;
    last_name: string | null;
    business_name: string | null;
    lifecycle_stage: string;
    lead_score: number;
    engagement_score: number;
  }>(
    `SELECT first_name, last_name, business_name, lifecycle_stage, lead_score, engagement_score
     FROM crm.contacts WHERE contact_id = $1`,
    [contactId]
  );

  if (!contact) return undefined;

  const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'there';

  // Get email engagement
  const emailEngagement = await query<{ event_type: string; count: number }>(
    `SELECT event_type, COUNT(*)::int as count
     FROM crm.touchpoints
     WHERE contact_id = $1 AND channel = 'email'
     GROUP BY event_type`,
    [contactId]
  );

  const emailStats = emailEngagement.reduce((acc, e) => {
    acc[e.event_type] = e.count;
    return acc;
  }, {} as Record<string, number>);

  return {
    contactName,
    businessName: contact.business_name || 'Unknown Business',
    opener: emailStats.email_opened
      ? "I noticed you have been checking out some of our info. Was there something specific that caught your eye?"
      : "I would love to learn about your delivery operation and see if we can help.",
    keyPoints: [
      `Contact is in ${contact.lifecycle_stage} stage`,
      `Lead score: ${contact.lead_score}`,
      `Engagement score: ${contact.engagement_score}`,
    ],
    objectionPrep: [],
    closeStrategy: contact.lead_score > 70
      ? 'High intent, push for demo booking'
      : 'Build value first, then suggest demo',
    riskFlags: contact.lead_score < 30 ? ['Low lead score, may need more nurturing'] : [],
    emailEngagement: emailStats,
    lifecycleStage: contact.lifecycle_stage,
    leadScore: contact.lead_score,
  };
}
