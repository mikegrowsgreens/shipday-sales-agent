/**
 * Conversation Guardrails & Control System (Session 8)
 *
 * Provides 5 guardrail fences, real-time conversation quality scoring,
 * length controls, escalation detection, and PII-redacted logging.
 *
 * Used by both chatbot (ai.ts / prospect route) and voice agent.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type GuardrailFence = 'topic' | 'pricing' | 'competitor' | 'promise' | 'pii';

export interface GuardrailViolation {
  fence: GuardrailFence;
  trigger: string;
  redirect: string;
  severity: 'soft' | 'hard';
}

export interface ConversationQualityScore {
  relevance: number;        // 0-100: how on-topic the conversation is
  pipelineAdvancement: number; // 0-100: progress through sales stages
  questionQuality: number;  // 0-100: are we asking good discovery questions
  overall: number;          // 0-100: weighted composite
  shouldSimplify: boolean;  // true when quality drops below threshold
  trend: 'improving' | 'stable' | 'declining';
}

export interface EscalationSignal {
  detected: boolean;
  level: 'none' | 'mild' | 'moderate' | 'severe';
  indicators: string[];
  recommendation: 'continue' | 'adjust_tone' | 'offer_human' | 'immediate_handoff';
  toneAdjustment?: string;
}

export interface LengthControlResult {
  withinLimits: boolean;
  messageCount: number;
  maxMessages: number;
  callDurationSec?: number;
  maxDurationSec?: number;
  action: 'continue' | 'pivot_to_close' | 'offer_human' | 'force_handoff';
  injectedPrompt?: string;
}

export interface PIIRedactionResult {
  redactedText: string;
  redactionsApplied: number;
  redactedTypes: string[];
}

// ─── PII Patterns ───────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ pattern: RegExp; type: string; replacement: string }> = [
  // SSN
  { pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g, type: 'ssn', replacement: '[SSN_REDACTED]' },
  // Credit card numbers (13-19 digits, with optional separators)
  { pattern: /\b(?:\d{4}[-.\s]?){3,4}\d{1,4}\b/g, type: 'credit_card', replacement: '[CARD_REDACTED]' },
  // Bank account / routing numbers (8-17 digits)
  { pattern: /\b(?:account|routing|acct|rtn)[\s#:]*\d{8,17}\b/gi, type: 'bank_account', replacement: '[BANK_REDACTED]' },
  // Dates of birth in common formats
  { pattern: /\b(?:dob|date of birth|born on|birthday)[\s:]*\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/gi, type: 'dob', replacement: '[DOB_REDACTED]' },
  // Driver's license patterns (state codes + numbers)
  { pattern: /\b(?:dl|driver'?s?\s*(?:license|lic))[\s#:]*[A-Z]?\d{5,12}\b/gi, type: 'drivers_license', replacement: '[DL_REDACTED]' },
  // Passport numbers
  { pattern: /\b(?:passport)[\s#:]*[A-Z]?\d{6,9}\b/gi, type: 'passport', replacement: '[PASSPORT_REDACTED]' },
  // Tax ID / EIN
  { pattern: /\b(?:ein|tax\s*id|tin)[\s#:]*\d{2}[-.]?\d{7}\b/gi, type: 'tax_id', replacement: '[TAXID_REDACTED]' },
];

// Allowed contact PII (we collect these intentionally)
const ALLOWED_PII_PATTERNS = [
  /[\w.-]+@[\w.-]+\.\w{2,}/g,  // email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, // US phone (10 digits)
];

// ─── Guardrail Fence Definitions ────────────────────────────────────────────

const TOPIC_OFF_LIMITS: RegExp[] = [
  /\b(politic|democrat|republican|trump|biden|election|vote|liberal|conservative|maga|woke)\b/i,
  /\b(religion|church|pray|god|jesus|allah|bible|quran|atheist)\b/i,
  /\b(personal\s+advice|relationship|dating|therapy|medical\s+advice|diagnos)/i,
  /\b(stock\s+tip|invest(?:ment)?|crypto|bitcoin|nft|gambling|bet(?:ting)?)\b/i,
  /\b(gun|firearm|weapon|drug|marijuana|cannabis)\b/i,
  /\b(lawsuit|legal\s+advice|sue|attorney)\b/i,
];

const PRICING_NEGOTIATE: RegExp[] = [
  /\b(discount|coupon|promo(?:tion)?|free\s+trial|special\s+(?:offer|deal|price|rate))\b/i,
  /\b(cheaper|lower\s+(?:the\s+)?price|price\s+match|negotiate|haggle)\b/i,
  /\b(too\s+(?:expensive|much|costly|pricey)|can(?:'t|\s+not)\s+afford|budget\s+(?:is|won't))\b/i,
  /\b(competitor\s+(?:charges|offers|gives)\s+(?:less|cheaper)|beat\s+(?:their|that)\s+price)\b/i,
  /\b(waive\s+(?:the\s+)?fee|no\s+(?:setup|activation)\s+fee|free\s+month)\b/i,
];

const COMPETITOR_DISPARAGE: RegExp[] = [
  /\b(doordash|uber\s*eats|grubhub|postmates|toast|square|olo|chowbus|revel)\b/i,
];

const PROMISE_GUARANTEE: RegExp[] = [
  /\b(guarantee|promise|ensure|warrant|certif)\b/i,
  /\b(definitely\s+will|100\s*%\s*(?:going|sure|certain))\b/i,
  /\b(never\s+(?:fail|break|go\s+down)|always\s+(?:work|available))\b/i,
];

const SENSITIVE_PII_INPUT: RegExp[] = [
  /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, // SSN
  /\b(?:\d{4}[-.\s]?){3}\d{4}\b/, // Credit card (16 digits)
  /\b(?:account|routing|acct)\s*(?:#|number|num)?\s*:?\s*\d{8,}\b/i, // Bank
  /\b(?:cvv|cvc|csv)\s*:?\s*\d{3,4}\b/i, // CVV
  /\b(?:expir|exp)\s*:?\s*\d{2}\s*[/\-]\s*\d{2,4}\b/i, // Expiration date
];

// ─── Guardrail Check Functions ──────────────────────────────────────────────

/**
 * Check all guardrail fences against a prospect message.
 * Returns the first violation found, or null if clean.
 */
export function checkGuardrails(
  prospectMessage: string,
  companyName: string = 'Shipday',
  repName: string = 'Mike',
  industry: string = 'restaurant',
): GuardrailViolation | null {
  // PII fence (hard) — check first, highest priority
  for (const pattern of SENSITIVE_PII_INPUT) {
    if (pattern.test(prospectMessage)) {
      return {
        fence: 'pii',
        trigger: 'sensitive_pii_detected',
        redirect: "I appreciate you sharing that, but I don't need any sensitive financial or personal ID information. I just need your name, email, and business info to get you connected. What's the best email for you?",
        severity: 'hard',
      };
    }
  }

  // Pricing fence (hard) — redirect to human rep
  for (const pattern of PRICING_NEGOTIATE) {
    const match = prospectMessage.match(pattern);
    if (match) {
      return {
        fence: 'pricing',
        trigger: match[0],
        redirect: `Great question on pricing! ${repName} handles all pricing conversations personally and can put together the right package for your specific situation. Want me to pull up their calendar?`,
        severity: 'hard',
      };
    }
  }

  // Topic fence (soft) — redirect back to business
  for (const pattern of TOPIC_OFF_LIMITS) {
    const match = prospectMessage.match(pattern);
    if (match) {
      return {
        fence: 'topic',
        trigger: match[0],
        redirect: `Ha, that's a whole other conversation! My expertise is really in helping ${industry} businesses grow their revenue and cut costs. What's the biggest challenge you're facing with your delivery operation right now?`,
        severity: 'soft',
      };
    }
  }

  return null;
}

/**
 * Check if the AI's response violates output guardrails.
 * Runs AFTER Claude generates a response, before sending to prospect.
 */
export function checkResponseGuardrails(
  aiResponse: string,
  companyName: string = 'Shipday',
): { clean: boolean; violations: GuardrailViolation[]; cleanedResponse?: string } {
  const violations: GuardrailViolation[] = [];
  let cleaned = aiResponse;

  // Check for competitor disparagement in AI output
  for (const pattern of COMPETITOR_DISPARAGE) {
    const match = aiResponse.match(pattern);
    if (match) {
      // Check if it's disparaging vs neutral mention
      const context = aiResponse.substring(
        Math.max(0, aiResponse.indexOf(match[0]) - 50),
        Math.min(aiResponse.length, aiResponse.indexOf(match[0]) + match[0].length + 50),
      );
      const disparaging = /\b(worse|bad|terrible|slow|unreliable|poor|awful|overcharge|rip\s*off|problem)\b/i;
      if (disparaging.test(context)) {
        violations.push({
          fence: 'competitor',
          trigger: match[0],
          redirect: 'differentiate_on_value',
          severity: 'soft',
        });
      }
    }
  }

  // Check for promises/guarantees in AI output
  for (const pattern of PROMISE_GUARANTEE) {
    const match = aiResponse.match(pattern);
    if (match) {
      const context = aiResponse.substring(
        Math.max(0, aiResponse.indexOf(match[0]) - 30),
        Math.min(aiResponse.length, aiResponse.indexOf(match[0]) + match[0].length + 30),
      );
      // Only flag if it's promising results, not quoting stats
      if (!/based on|data|similar businesses|on average|typically/i.test(context)) {
        violations.push({
          fence: 'promise',
          trigger: match[0],
          redirect: 'use_data_framing',
          severity: 'soft',
        });
      }
    }
  }

  // Check for sensitive PII in AI output (should never happen but defense in depth)
  for (const piiPattern of PII_PATTERNS) {
    if (piiPattern.pattern.test(cleaned)) {
      cleaned = cleaned.replace(piiPattern.pattern, piiPattern.replacement);
      violations.push({
        fence: 'pii',
        trigger: piiPattern.type,
        redirect: 'pii_stripped_from_response',
        severity: 'hard',
      });
    }
  }

  return {
    clean: violations.length === 0,
    violations,
    cleanedResponse: violations.length > 0 ? cleaned : undefined,
  };
}

// ─── Conversation Quality Scoring ───────────────────────────────────────────

const QUALITY_SIMPLIFY_THRESHOLD = 40;

/**
 * Score the quality of the current conversation in real-time.
 */
export function scoreConversationQuality(
  messages: Array<{ role: string; content: string }>,
  currentStage: string,
  qualificationSlots: Record<string, unknown>,
  previousScore?: ConversationQualityScore,
): ConversationQualityScore {
  const userMessages = messages.filter(m => m.role === 'user');
  const assistantMessages = messages.filter(m => m.role === 'assistant' || m.role === 'agent');
  const msgCount = messages.length;

  // Relevance: are messages on-topic?
  let relevance = 80; // assume mostly relevant
  const recentUserMsgs = userMessages.slice(-3);
  for (const msg of recentUserMsgs) {
    const lower = msg.content.toLowerCase();
    // Off-topic penalty
    for (const pattern of TOPIC_OFF_LIMITS) {
      if (pattern.test(lower)) relevance -= 20;
    }
    // Very short / unclear messages
    if (msg.content.length < 5) relevance -= 10;
    // Repetitive "what?" / "huh?" / "I don't understand"
    if (/\b(what|huh|confused|don'?t understand|what do you mean)\b/i.test(lower)) relevance -= 15;
  }
  relevance = Math.max(0, Math.min(100, relevance));

  // Pipeline advancement: are we progressing through stages?
  const stageOrder = ['hook', 'rapport', 'discovery', 'implication', 'solution_mapping', 'roi_crystallization', 'commitment', 'close'];
  const stageIndex = stageOrder.indexOf(currentStage);
  const expectedStageByMsgCount = Math.min(stageOrder.length - 1, Math.floor(msgCount / 3));
  const stageDelta = stageIndex - expectedStageByMsgCount;
  let pipelineAdvancement = 60;
  if (stageDelta >= 0) pipelineAdvancement = 70 + (stageDelta * 10);
  if (stageDelta < -1) pipelineAdvancement = 40 + (stageDelta * 10);
  pipelineAdvancement = Math.max(0, Math.min(100, pipelineAdvancement));

  // Question quality: are we asking good discovery questions?
  let questionQuality = 50;
  const recentAssistant = assistantMessages.slice(-3);
  for (const msg of recentAssistant) {
    // Has a question mark — asking questions is good
    if (msg.content.includes('?')) questionQuality += 10;
    // Has ROI/financial content
    if (/\$\d+/.test(msg.content)) questionQuality += 10;
    // Uses SPIN language
    if (/what happens|how much|what would|impact|cost you/i.test(msg.content)) questionQuality += 5;
    // Too many questions in one message — bad
    const qCount = (msg.content.match(/\?/g) || []).length;
    if (qCount > 2) questionQuality -= 10;
  }
  questionQuality = Math.max(0, Math.min(100, questionQuality));

  // Qualification progress bonus
  const slotsFilled = Object.values(qualificationSlots).filter(v => v !== undefined && v !== null).length;
  const qualBonus = Math.min(20, slotsFilled * 3);
  pipelineAdvancement = Math.min(100, pipelineAdvancement + qualBonus);

  // Weighted composite
  const overall = Math.round(
    relevance * 0.3 +
    pipelineAdvancement * 0.4 +
    questionQuality * 0.3
  );

  // Trend detection
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (previousScore) {
    const delta = overall - previousScore.overall;
    if (delta > 5) trend = 'improving';
    else if (delta < -10) trend = 'declining';
  }

  return {
    relevance,
    pipelineAdvancement,
    questionQuality,
    overall,
    shouldSimplify: overall < QUALITY_SIMPLIFY_THRESHOLD,
    trend,
  };
}

// ─── Escalation Detection ───────────────────────────────────────────────────

const FRUSTRATION_PATTERNS = [
  { pattern: /\b(frustrated|annoying|annoyed|irritated|waste\s+(?:of\s+)?(?:my\s+)?time)\b/i, weight: 2 },
  { pattern: /\b(ridiculous|absurd|stupid|dumb|pointless|useless)\b/i, weight: 3 },
  { pattern: /\b(angry|furious|pissed|unacceptable|outrageous)\b/i, weight: 3 },
  { pattern: /\b(stop\s+(?:calling|emailing|messaging|contacting)|leave\s+me\s+alone|take\s+me\s+off|unsubscribe|remove\s+me)\b/i, weight: 3 },
  { pattern: /\b(not\s+interested|go\s+away|no\s+thanks|don'?t\s+(?:want|need|care)|bye|goodbye)\b/i, weight: 1 },
  { pattern: /\b(scam|spam|fake|fraud|shady|sketchy)\b/i, weight: 3 },
  { pattern: /!{2,}/, weight: 1 }, // Multiple exclamation marks
  { pattern: /[A-Z]{5,}/, weight: 1 }, // ALL CAPS words (5+ chars)
];

const CONFUSION_PATTERNS = [
  { pattern: /\b(confused|don'?t\s+(?:understand|get\s+it)|what\s+(?:do\s+you\s+mean|is\s+that)|huh\??)\b/i, weight: 2 },
  { pattern: /\b(can\s+you\s+(?:explain|clarify)|not\s+(?:sure|clear)|what\s+are\s+you\s+(?:saying|talking))\b/i, weight: 2 },
  { pattern: /\?\s*\?/, weight: 1 }, // Multiple question marks
  { pattern: /\b(this\s+(?:doesn'?t|does\s+not)\s+make\s+sense|I'?m\s+lost)\b/i, weight: 2 },
];

/**
 * Detect frustration or confusion in the prospect's message.
 * Returns escalation level and recommended action.
 */
export function detectEscalation(
  currentMessage: string,
  recentMessages: Array<{ role: string; content: string }>,
  interruptionCount: number = 0,
): EscalationSignal {
  const indicators: string[] = [];
  let score = 0;

  // Check current message for frustration
  for (const { pattern, weight } of FRUSTRATION_PATTERNS) {
    if (pattern.test(currentMessage)) {
      score += weight;
      indicators.push(`frustration: ${pattern.source}`);
    }
  }

  // Check current message for confusion
  for (const { pattern, weight } of CONFUSION_PATTERNS) {
    if (pattern.test(currentMessage)) {
      score += weight;
      indicators.push(`confusion: ${pattern.source}`);
    }
  }

  // Check for escalation trend in recent messages
  const recentUserMsgs = recentMessages
    .filter(m => m.role === 'user')
    .slice(-5);

  let escalatingTrend = 0;
  for (const msg of recentUserMsgs) {
    for (const { pattern, weight } of [...FRUSTRATION_PATTERNS, ...CONFUSION_PATTERNS]) {
      if (pattern.test(msg.content)) {
        escalatingTrend += weight * 0.5; // Half weight for historical
      }
    }
  }
  score += escalatingTrend;

  // High interruption count in voice contributes to escalation
  if (interruptionCount >= 4) {
    score += 1;
    indicators.push(`high_interruptions: ${interruptionCount}`);
  }

  // Shortening messages over time = losing interest
  if (recentUserMsgs.length >= 3) {
    const lengths = recentUserMsgs.map(m => m.content.length);
    const avgRecent = lengths.slice(-2).reduce((a, b) => a + b, 0) / 2;
    const avgOlder = lengths.slice(0, -2).reduce((a, b) => a + b, 0) / Math.max(1, lengths.length - 2);
    if (avgRecent < avgOlder * 0.4 && avgRecent < 20) {
      score += 1;
      indicators.push('declining_engagement');
    }
  }

  // Determine level and recommendation
  let level: EscalationSignal['level'] = 'none';
  let recommendation: EscalationSignal['recommendation'] = 'continue';
  let toneAdjustment: string | undefined;

  if (score >= 6) {
    level = 'severe';
    recommendation = 'immediate_handoff';
    toneAdjustment = 'Be very brief, empathetic, and immediately offer to connect with a human.';
  } else if (score >= 4) {
    level = 'moderate';
    recommendation = 'offer_human';
    toneAdjustment = 'Slow down. Show empathy. Acknowledge their frustration. Offer human connection.';
  } else if (score >= 2) {
    level = 'mild';
    recommendation = 'adjust_tone';
    toneAdjustment = 'Be more empathetic and concise. Address their concern directly before continuing.';
  }

  return {
    detected: score >= 2,
    level,
    indicators,
    recommendation,
    toneAdjustment,
  };
}

// ─── Length Controls ────────────────────────────────────────────────────────

const CHATBOT_MAX_MESSAGES = 15;
const CHATBOT_PIVOT_MESSAGES = 12; // Start pivoting at this point
const VOICE_MAX_DURATION_SEC = 480; // 8 minutes
const VOICE_PIVOT_DURATION_SEC = 360; // 6 minutes — start pivoting

/**
 * Check length controls for chatbot conversations.
 */
export function checkChatbotLengthControl(
  messages: Array<{ role: string; content: string }>,
  hasProgressedSinceLastCheck: boolean,
): LengthControlResult {
  const userMsgCount = messages.filter(m => m.role === 'user').length;

  if (userMsgCount >= CHATBOT_MAX_MESSAGES) {
    return {
      withinLimits: false,
      messageCount: userMsgCount,
      maxMessages: CHATBOT_MAX_MESSAGES,
      action: 'force_handoff',
      injectedPrompt: `\n\n## LENGTH CONTROL — CONVERSATION LIMIT REACHED
This conversation has reached ${userMsgCount} messages without sufficient progress. You MUST:
1. Summarize the key value points discussed
2. Directly surface [BOOK_DEMO]
3. Offer to connect with a human rep
Do NOT continue discovery. Close NOW.`,
    };
  }

  if (userMsgCount >= CHATBOT_PIVOT_MESSAGES && !hasProgressedSinceLastCheck) {
    return {
      withinLimits: true,
      messageCount: userMsgCount,
      maxMessages: CHATBOT_MAX_MESSAGES,
      action: 'pivot_to_close',
      injectedPrompt: `\n\n## LENGTH CONTROL — PIVOT TO CLOSE
This conversation is getting long (${userMsgCount} messages). Start transitioning:
- Summarize what you've learned about their business
- Present ROI if you haven't already
- Push toward a demo booking or human connection
You have ${CHATBOT_MAX_MESSAGES - userMsgCount} messages left before auto-handoff.`,
    };
  }

  return {
    withinLimits: true,
    messageCount: userMsgCount,
    maxMessages: CHATBOT_MAX_MESSAGES,
    action: 'continue',
  };
}

/**
 * Check length controls for voice conversations.
 */
export function checkVoiceLengthControl(
  callDurationSec: number,
  messageCount: number,
  hasAdvancedStage: boolean,
): LengthControlResult {
  if (callDurationSec >= VOICE_MAX_DURATION_SEC) {
    return {
      withinLimits: false,
      messageCount,
      maxMessages: 0,
      callDurationSec,
      maxDurationSec: VOICE_MAX_DURATION_SEC,
      action: 'force_handoff',
      injectedPrompt: `## TIME LIMIT REACHED
Call has been going for ${Math.round(callDurationSec / 60)} minutes. Wrap up NOW:
- Thank them for their time
- Summarize key points
- Offer to connect with a rep for next steps
Keep it under 2 sentences.`,
    };
  }

  if (callDurationSec >= VOICE_PIVOT_DURATION_SEC && !hasAdvancedStage) {
    return {
      withinLimits: true,
      messageCount,
      maxMessages: 0,
      callDurationSec,
      maxDurationSec: VOICE_MAX_DURATION_SEC,
      action: 'pivot_to_close',
      injectedPrompt: `## TIME CHECK
Call is at ${Math.round(callDurationSec / 60)} minutes. Start moving toward close:
- Present ROI if you haven't
- Seek a commitment
- Offer demo or human handoff
~${Math.round((VOICE_MAX_DURATION_SEC - callDurationSec) / 60)} minutes remaining.`,
    };
  }

  return {
    withinLimits: true,
    messageCount,
    maxMessages: 0,
    callDurationSec,
    maxDurationSec: VOICE_MAX_DURATION_SEC,
    action: 'continue',
  };
}

// ─── PII Redaction for Logging ──────────────────────────────────────────────

/**
 * Redact sensitive PII from conversation text for compliance logging.
 * Preserves allowed contact info (name, email, phone, company).
 */
export function redactPII(text: string): PIIRedactionResult {
  let redacted = text;
  let redactionsApplied = 0;
  const redactedTypes: string[] = [];

  for (const { pattern, type, replacement } of PII_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    if (pattern.test(redacted)) {
      pattern.lastIndex = 0;
      redacted = redacted.replace(pattern, replacement);
      redactionsApplied++;
      if (!redactedTypes.includes(type)) redactedTypes.push(type);
    }
  }

  return { redactedText: redacted, redactionsApplied, redactedTypes };
}

/**
 * Redact an entire conversation for compliance logging.
 */
export function redactConversation(
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string; redacted: boolean }> {
  return messages.map(msg => {
    const result = redactPII(msg.content);
    return {
      role: msg.role,
      content: result.redactedText,
      redacted: result.redactionsApplied > 0,
    };
  });
}

// ─── Guardrail System Prompt Sections ───────────────────────────────────────

/**
 * Build the guardrail section to inject into the chatbot system prompt.
 * This supplements the existing guardrails in the prompt with stronger enforcement.
 */
export function buildChatGuardrailPrompt(
  companyName: string,
  repName: string,
  industry: string,
  escalation?: EscalationSignal,
  qualityScore?: ConversationQualityScore,
  lengthControl?: LengthControlResult,
): string {
  let prompt = `
## HARD GUARDRAILS — NEVER VIOLATE

### FENCE 1: TOPIC CONTROL
You ONLY discuss ${companyName}, ${industry}-related operations, and growth opportunities.
If the prospect raises politics, religion, personal advice, legal matters, investments, or any off-topic subject:
→ Acknowledge briefly, then redirect: "Ha, that's a whole other conversation! My expertise is helping ${industry} businesses grow. What's the biggest challenge you're facing with your operation right now?"

### FENCE 2: PRICING PROTECTION
NEVER negotiate pricing, offer discounts, mention promotions, free trials, or special deals.
If asked about pricing flexibility:
→ "${repName} handles all pricing conversations personally — want me to pull up their calendar?"

### FENCE 3: COMPETITOR RESPECT
NEVER disparage competitors by name. Acknowledge what they do, then differentiate on value.
→ "They serve a different segment. Where ${companyName} really shines is [specific value for their situation]."

### FENCE 4: NO PROMISES
NEVER guarantee specific results or outcomes.
→ Always use data-based framing: "Based on data from similar businesses..." or "Businesses like yours typically see..."
→ NEVER say "I guarantee" / "I promise" / "you will definitely" / "100% certain"

### FENCE 5: PII PROTECTION
Only collect: name, email, company name, phone number.
If prospect shares SSN, credit card, bank account, or other sensitive info:
→ "I appreciate you sharing that, but I don't need any sensitive financial or ID information. Just your name and email is perfect."
NEVER include sensitive PII in your responses.`;

  // Add escalation-specific guidance
  if (escalation?.detected) {
    prompt += `\n
## ⚠️ ESCALATION DETECTED — ${escalation.level.toUpperCase()}
${escalation.toneAdjustment || ''}
${escalation.recommendation === 'immediate_handoff' ? `IMMEDIATE ACTION: Empathize in one sentence, then say "Let me connect you with ${repName} directly — they can help much better than I can."` : ''}
${escalation.recommendation === 'offer_human' ? `ACTION: After addressing their concern, offer: "Would you prefer to chat with ${repName} directly? I can get them on the line."` : ''}`;
  }

  // Add quality-aware guidance
  if (qualityScore?.shouldSimplify) {
    prompt += `\n
## QUALITY ALERT — SIMPLIFY APPROACH
Conversation quality is declining (score: ${qualityScore.overall}/100, trend: ${qualityScore.trend}).
- Use simpler language
- Shorter responses (1-2 sentences)
- Ask clearer, more direct questions
- Consider pivoting approach — current strategy isn't resonating`;
  }

  // Add length control guidance
  if (lengthControl?.injectedPrompt) {
    prompt += lengthControl.injectedPrompt;
  }

  return prompt;
}

/**
 * Build guardrail section for the voice agent system prompt.
 */
export function buildVoiceGuardrailPrompt(
  escalation?: EscalationSignal,
  qualityScore?: ConversationQualityScore,
  lengthControl?: LengthControlResult,
): string {
  let prompt = '';

  if (escalation?.detected) {
    prompt += `\n## ⚠️ ESCALATION — ${escalation.level.toUpperCase()}
${escalation.toneAdjustment || ''}
${escalation.recommendation === 'immediate_handoff' ? 'IMMEDIATE: Empathize briefly, then transfer to human rep NOW.' : ''}
${escalation.recommendation === 'offer_human' ? 'After addressing their concern, offer to connect with a human.' : ''}`;
  }

  if (qualityScore?.shouldSimplify) {
    prompt += `\n## QUALITY DROP — SIMPLIFY
Keep responses to 1 sentence. Ask clearer questions. The current approach isn't landing.`;
  }

  if (lengthControl?.injectedPrompt) {
    prompt += '\n' + lengthControl.injectedPrompt;
  }

  return prompt;
}
