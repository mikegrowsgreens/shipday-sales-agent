/**
 * Warm Handoff Module (Session 6 Enhanced)
 * Handles transferring calls from the AI voice agent to a human rep.
 * Uses Twilio Conference to bridge the call with full context.
 *
 * Enhancements:
 * - Rich context packet with objections, interests, and suggested actions
 * - Better whisper script with key data points
 * - SSE dashboard context for rep's Sales Hub view
 */

import type {
  HandoffContext,
  EnhancedHandoffContext,
  HandoffTrigger,
  ConversationState,
  ConnectionQuality,
} from './types';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  repPhone: string;
}

/**
 * Build a rich context packet for the human rep receiving the handoff.
 * This appears in the Sales Hub UI via SSE and as a whisper on the call.
 */
export function buildHandoffContext(
  state: ConversationState,
  trigger: HandoffTrigger,
): EnhancedHandoffContext {
  const slots = state.qualificationSlots;
  const callDurationSec = Math.round((Date.now() - state.startedAt.getTime()) / 1000);

  // Summarize qualification
  const qualParts: string[] = [];
  if (slots.orders_per_week) qualParts.push(`${slots.orders_per_week} orders/week`);
  if (slots.aov) qualParts.push(`$${slots.aov} avg order`);
  if (slots.commission_tier) qualParts.push(`${slots.commission_tier}% commission`);
  if (slots.restaurant_type) qualParts.push(slots.restaurant_type);
  if (slots.location_count) qualParts.push(`${slots.location_count} locations`);

  // Extract objections raised during the call
  const objections: string[] = [];
  const interestTopics: string[] = [];

  for (const msg of state.messages) {
    if (msg.role !== 'prospect') continue;
    const lower = msg.content.toLowerCase();

    // Detect objections
    if (lower.match(/(?:too expensive|cost|price|budget|afford|not sure|don't know|concern|worry|risk)/)) {
      const snippet = msg.content.substring(0, 120);
      if (!objections.some(o => o === snippet)) objections.push(snippet);
    }

    // Detect interest topics
    if (lower.match(/(?:interested|tell me more|how does|sounds good|that's cool|love that|want to|need)/)) {
      const snippet = msg.content.substring(0, 100);
      if (!interestTopics.some(t => t === snippet)) interestTopics.push(snippet);
    }
  }

  // Extract conversation highlights (substantive statements)
  const highlights: string[] = [];
  for (const msg of state.messages) {
    if (msg.role === 'prospect' && msg.content.length > 20) {
      const content = msg.content.substring(0, 150);
      if (content.match(/(?:problem|issue|challenge|pain|losing|expensive|cost|frustrated|interested|growth|expand|driver|delivery|order)/i)) {
        highlights.push(content);
      }
    }
  }

  // Detect mood from recent messages
  const recentProspect = state.messages
    .filter(m => m.role === 'prospect')
    .slice(-3)
    .map(m => m.content.toLowerCase())
    .join(' ');

  let mood: HandoffContext['prospectMood'] = 'neutral';
  if (recentProspect.match(/(?:great|awesome|perfect|love|excited|sounds good)/)) {
    mood = 'positive';
  } else if (recentProspect.match(/(?:frustrated|angry|annoyed|upset|waste|ridiculous)/)) {
    mood = trigger === 'emotional_escalation' ? 'angry' : 'frustrated';
  }

  // Determine suggested next action based on trigger and state
  let suggestedNextAction: string;
  switch (trigger) {
    case 'high_intent':
      suggestedNextAction = 'Prospect is ready — walk through pricing and onboarding. Close today.';
      break;
    case 'prospect_request':
      if (recentProspect.match(/(?:discount|cheaper|negotiate|price)/)) {
        suggestedNextAction = 'Prospect wants to discuss pricing. Lead with value before numbers.';
      } else {
        suggestedNextAction = 'Prospect wants human interaction. Build rapport and continue qualification.';
      }
      break;
    case 'emotional_escalation':
      suggestedNextAction = 'Lead with empathy. Acknowledge frustration. Slow down and listen.';
      break;
    case 'stalled_conversation':
      suggestedNextAction = 'Conversation stalled. Re-engage with a fresh angle or direct question.';
      break;
    default:
      suggestedNextAction = 'Continue conversation from where AI left off.';
  }

  return {
    trigger,
    callSid: state.callSid,
    contactName: slots.name || 'Unknown',
    company: slots.company || state.preCallBrief?.businessName || 'Unknown',
    qualificationSummary: qualParts.length > 0
      ? qualParts.join(', ')
      : 'Qualification incomplete',
    roiSummary: state.computedROI,
    conversationHighlights: highlights.slice(0, 5),
    prospectMood: mood,
    // Enhanced fields
    callDurationSec,
    messageCount: state.messages.length,
    objections: objections.slice(0, 5),
    interestTopics: interestTopics.slice(0, 5),
    suggestedNextAction,
    qualificationData: { ...slots },
    callQuality: state.callQuality.quality,
  };
}

/**
 * Execute the warm handoff via Twilio Conference.
 * Steps:
 * 1. Move the prospect's leg to a conference room
 * 2. Call the human rep and add them to the same conference
 * 3. The AI agent disconnects once the rep joins
 */
export async function executeWarmHandoff(
  callSid: string,
  config: TwilioConfig,
  context: EnhancedHandoffContext,
): Promise<{ success: boolean; conferenceSid?: string; error?: string }> {
  const { accountSid, authToken, phoneNumber, repPhone } = config;
  const conferenceName = `handoff_${callSid}_${Date.now()}`;
  const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  try {
    // Step 1: Update the current call to join a conference
    const updateParams = new URLSearchParams({
      Twiml: `<Response><Dial><Conference statusCallback="${process.env.TRACKING_BASE_URL || ''}/api/voice/conference-status" statusCallbackEvent="join leave end" beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" waitUrl="">${conferenceName}</Conference></Dial></Response>`,
    });

    const updateRes = await fetch(
      `${TWILIO_API_BASE}/${accountSid}/Calls/${callSid}.json`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: updateParams.toString(),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.json();
      console.error('[handoff] Failed to update call to conference:', err);
      return { success: false, error: `Failed to move prospect to conference: ${err.message}` };
    }

    // Step 2: Call the human rep and add them to the same conference
    // Include a whisper with context before connecting
    const contextWhisper = buildWhisperTwiml(context);
    const callParams = new URLSearchParams({
      To: repPhone,
      From: phoneNumber,
      Twiml: `<Response><Say voice="Polly.Amy">${contextWhisper}</Say><Dial><Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="true">${conferenceName}</Conference></Dial></Response>`,
      StatusCallback: `${process.env.TRACKING_BASE_URL || ''}/api/twilio/status`,
      StatusCallbackEvent: 'initiated ringing answered completed',
      StatusCallbackMethod: 'POST',
    });

    const callRes = await fetch(
      `${TWILIO_API_BASE}/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: callParams.toString(),
      }
    );

    if (!callRes.ok) {
      const err = await callRes.json();
      console.error('[handoff] Failed to call rep:', err);
      return { success: false, error: `Failed to call rep: ${err.message}` };
    }

    const callData = await callRes.json();
    console.log(`[handoff] Rep call initiated: ${callData.sid}, conference: ${conferenceName}`);

    return { success: true, conferenceSid: conferenceName };
  } catch (error) {
    console.error('[handoff] Error:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Build a brief whisper message for the rep before they join the call.
 * Enhanced with more context — keeps it concise for voice delivery.
 */
function buildWhisperTwiml(context: EnhancedHandoffContext): string {
  const parts = [
    `Incoming transfer from AI agent.`,
    `${context.contactName} from ${context.company}.`,
  ];

  // Call duration context
  if (context.callDurationSec > 60) {
    parts.push(`${Math.round(context.callDurationSec / 60)} minute call.`);
  }

  // Qualification summary
  if (context.qualificationSummary !== 'Qualification incomplete') {
    parts.push(context.qualificationSummary + '.');
  }

  // Mood flag
  if (context.prospectMood === 'frustrated' || context.prospectMood === 'angry') {
    parts.push('Prospect seems frustrated. Lead with empathy.');
  } else if (context.prospectMood === 'positive') {
    parts.push('Prospect is positive and engaged.');
  }

  // ROI highlight
  if (context.roiSummary) {
    const savingsMatch = context.roiSummary.match(/Annual savings.*?\$([0-9,]+)/);
    if (savingsMatch) {
      parts.push(`Estimated annual savings: $${savingsMatch[1]}.`);
    }
  }

  // Key objection
  if (context.objections.length > 0) {
    parts.push(`Main concern: ${context.objections[0].substring(0, 60)}.`);
  }

  // Suggested action
  parts.push(context.suggestedNextAction.substring(0, 80) + '.');

  parts.push('Connecting you now.');

  // Escape for XML
  return parts.join(' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
