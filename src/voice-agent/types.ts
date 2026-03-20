/**
 * Voice Agent Types
 * Shared types for the real-time voice AI agent pipeline.
 */

// ─── Conversation State ─────────────────────────────────────────────────────

export type VoiceStage =
  | 'greeting'
  | 'hook'
  | 'rapport'
  | 'discovery'
  | 'implication'
  | 'solution_mapping'
  | 'roi_crystallization'
  | 'commitment'
  | 'close'
  | 'handoff'
  | 'ended';

export interface QualificationSlots {
  name?: string;
  email?: string;
  company?: string;
  orders_per_week?: number;
  aov?: number;
  commission_tier?: number;
  restaurant_type?: string;
  location_count?: number;
  misses_calls?: boolean;
  monthly_calls?: number;
  does_marketing?: boolean;
  wants_more_repeat?: boolean;
  google_rating?: number;
  review_pain?: boolean;
  has_online_ordering?: boolean;
  qualified?: boolean;
  growth_qualified?: boolean;
  stage?: string;
}

export interface ConversationState {
  callSid: string;
  sessionId: string;
  stage: VoiceStage;
  messages: ConversationMessage[];
  qualificationSlots: QualificationSlots;
  computedROI?: string;
  startedAt: Date;
  lastActivityAt: Date;
  handoffTriggered: boolean;
  handoffReason?: string;
  contactId?: number;
  orgId?: number;
  brainContent: Array<Record<string, unknown>>;
  preCallBrief?: PreCallBrief;
  interruptionCount: number;
  silenceCount: number;
  prospectSpeakingRate?: number; // words per minute estimate
  /** Pacing state for mirroring prospect speed */
  pacing: PacingState;
  /** Barge-in processing state */
  bargeIn: BargeInState;
  /** Call quality monitoring state */
  callQuality: CallQualityState;
  /** Whether the last response included ROI (triggers strategic pause) */
  lastResponseHadROI: boolean;
  /** Previous stage before current — used for barge-in context */
  previousStage?: VoiceStage;
  /** Session 10: Key topics the prospect mentioned — for contextual callbacks */
  contextCallbacks: ContextCallback[];
  /** Session 10: Whether prospect's name pronunciation has been confirmed */
  nameConfirmed: boolean;
  /** Scheduling event type ID for calendar tool calling */
  schedulingEventTypeId?: number;
}

/** Session 10: Tracked topic for contextual callback references */
export interface ContextCallback {
  topic: string;
  detail: string;
  mentionedAt: Date;
  stage: VoiceStage;
}

export interface ConversationMessage {
  role: 'agent' | 'prospect';
  content: string;
  timestamp: Date;
  durationMs?: number;
}

// ─── Pre-Call Brief ─────────────────────────────────────────────────────────

export interface PreCallBrief {
  contactName: string;
  businessName: string;
  opener: string;
  keyPoints: string[];
  objectionPrep: Array<{ objection: string; response: string }>;
  closeStrategy: string;
  riskFlags: string[];
  emailEngagement: Record<string, number>;
  lifecycleStage: string;
  leadScore: number;
}

// ─── Audio Pipeline ─────────────────────────────────────────────────────────

export interface AudioChunk {
  payload: string; // base64-encoded audio
  timestamp: number;
}

export interface STTResult {
  transcript: string;
  isFinal: boolean;
  confidence: number;
  speechFinal: boolean; // end of utterance
  words?: Array<{ word: string; start: number; end: number }>;
}

export interface TTSRequest {
  text: string;
  voiceId?: string;
  speed?: number;
}

// ─── Twilio Media Stream ────────────────────────────────────────────────────

export interface TwilioMediaMessage {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark';
  sequenceNumber?: string;
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
    customParameters?: Record<string, string>;
  };
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string; // base64 mulaw audio
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
  mark?: {
    name: string;
  };
}

// ─── Handoff ────────────────────────────────────────────────────────────────

export type HandoffTrigger = 'prospect_request' | 'high_intent' | 'emotional_escalation' | 'stalled_conversation';

export interface HandoffContext {
  trigger: HandoffTrigger;
  callSid: string;
  contactName: string;
  company: string;
  qualificationSummary: string;
  roiSummary?: string;
  conversationHighlights: string[];
  prospectMood: 'positive' | 'neutral' | 'frustrated' | 'angry';
  recommendedRep?: string;
}

// ─── SSE Events ─────────────────────────────────────────────────────────────

export type SSEEventType =
  | 'call_started'
  | 'transcript_update'
  | 'stage_change'
  | 'qualification_update'
  | 'roi_computed'
  | 'handoff_triggered'
  | 'call_ended'
  | 'error';

export interface SSEEvent {
  type: SSEEventType;
  callSid: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

// ─── Pacing & Speaking Rate ──────────────────────────────────────────────────

export interface PacingState {
  /** Estimated prospect words-per-minute based on recent utterances */
  prospectWpm: number;
  /** Running average of utterance durations in ms */
  avgUtteranceDurationMs: number;
  /** Number of samples used for the running average */
  sampleCount: number;
  /** TTS speed multiplier derived from prospect pacing (0.8 - 1.15) */
  ttsSpeed: number;
  /** Whether to insert a strategic pause before the next response */
  insertPauseBeforeNext: boolean;
  /** Pause duration in ms (0 = no pause) */
  pauseDurationMs: number;
}

// ─── Filler System ──────────────────────────────────────────────────────────

export type FillerCategory = 'acknowledgment' | 'thinking' | 'transition' | 'empathy';

export interface FillerPhrase {
  text: string;
  category: FillerCategory;
  /** Minimum delay before playing (ms) — avoids fillers on fast responses */
  minLatencyMs: number;
}

// ─── Call Quality ───────────────────────────────────────────────────────────

export type ConnectionQuality = 'excellent' | 'good' | 'degraded' | 'poor';

export interface CallQualityState {
  /** Current assessed connection quality */
  quality: ConnectionQuality;
  /** STT confidence rolling average (0-1) */
  avgSttConfidence: number;
  /** Number of STT errors since call start */
  sttErrorCount: number;
  /** Number of TTS errors since call start */
  ttsErrorCount: number;
  /** Number of WebSocket reconnect attempts */
  wsReconnectAttempts: number;
  /** Whether degraded mode is active (shorter responses, simpler TTS) */
  degradedMode: boolean;
  /** Timestamp of last quality assessment */
  lastAssessedAt: Date;
  /** Consecutive low-confidence transcripts */
  lowConfidenceStreak: number;
}

// ─── Barge-In ───────────────────────────────────────────────────────────────

export interface BargeInState {
  /** Whether a barge-in is currently being processed */
  active: boolean;
  /** Buffered speech fragments captured during barge-in */
  speechBuffer: string[];
  /** The agent text that was interrupted */
  interruptedAgentText: string;
  /** How far into the agent's response the barge-in occurred (0-1) */
  interruptionPoint: number;
  /** Timestamp when barge-in was detected */
  detectedAt: Date | null;
}

// ─── Enhanced Handoff Context ───────────────────────────────────────────────

export interface EnhancedHandoffContext extends HandoffContext {
  /** Duration of call at handoff point in seconds */
  callDurationSec: number;
  /** Number of messages exchanged */
  messageCount: number;
  /** Prospect's key objections during the call */
  objections: string[];
  /** Topics the prospect showed interest in */
  interestTopics: string[];
  /** Suggested next action for the rep */
  suggestedNextAction: string;
  /** Full qualification data */
  qualificationData: QualificationSlots;
  /** Call quality at time of handoff */
  callQuality: ConnectionQuality;
}

// ─── Voice Agent Config ─────────────────────────────────────────────────────

export interface VoiceAgentConfig {
  port: number;
  deepgramApiKey: string;
  elevenLabsApiKey: string;
  anthropicApiKey: string;
  claudeModel: string;
  elevenLabsVoiceId: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  databaseUrl: string;
  ssePort: number;
  maxCallDurationMs: number;
  maxSilenceMs: number;
  bargeInThresholdMs: number;
  /** Minimum latency (ms) before playing filler audio */
  fillerMinLatencyMs: number;
  /** How often to reassess call quality (ms) */
  qualityCheckIntervalMs: number;
  /** STT confidence threshold for degraded mode */
  sttConfidenceThreshold: number;
  /** Maximum low-confidence transcripts before degraded mode */
  lowConfidenceMaxStreak: number;
  /** Duration of strategic pause after ROI reveal (ms) */
  roiPauseDurationMs: number;
}
