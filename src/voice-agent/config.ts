/**
 * Voice Agent Configuration
 * Loads config from environment variables with validation.
 */

import type { VoiceAgentConfig } from './types';

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`[voice-agent] Missing required env var: ${name}`);
  return val;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export function loadConfig(): VoiceAgentConfig {
  return {
    port: parseInt(optionalEnv('VOICE_AGENT_PORT', '3006')),
    deepgramApiKey: requireEnv('DEEPGRAM_API_KEY'),
    elevenLabsApiKey: requireEnv('ELEVENLABS_API_KEY'),
    anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
    claudeModel: optionalEnv('CLAUDE_MODEL', 'claude-sonnet-4-5-20250929'),
    elevenLabsVoiceId: optionalEnv('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL'), // "Sarah" - warm, professional
    twilioAccountSid: requireEnv('TWILIO_ACCOUNT_SID'),
    twilioAuthToken: requireEnv('TWILIO_AUTH_TOKEN'),
    twilioPhoneNumber: requireEnv('TWILIO_PHONE_NUMBER'),
    databaseUrl: requireEnv('DATABASE_URL_WINCALL'),
    ssePort: parseInt(optionalEnv('VOICE_SSE_PORT', '3007')),
    maxCallDurationMs: parseInt(optionalEnv('MAX_CALL_DURATION_MS', '1800000')), // 30 minutes
    maxSilenceMs: parseInt(optionalEnv('MAX_SILENCE_MS', '30000')), // 30 seconds
    bargeInThresholdMs: parseInt(optionalEnv('BARGE_IN_THRESHOLD_MS', '200')), // 200ms
    fillerMinLatencyMs: parseInt(optionalEnv('FILLER_MIN_LATENCY_MS', '400')), // Don't play fillers if response comes in <400ms
    qualityCheckIntervalMs: parseInt(optionalEnv('QUALITY_CHECK_INTERVAL_MS', '10000')), // Assess quality every 10s
    sttConfidenceThreshold: parseFloat(optionalEnv('STT_CONFIDENCE_THRESHOLD', '0.6')), // Below this = low confidence
    lowConfidenceMaxStreak: parseInt(optionalEnv('LOW_CONFIDENCE_MAX_STREAK', '5')), // 5 consecutive low-confidence = degraded
    roiPauseDurationMs: parseInt(optionalEnv('ROI_PAUSE_DURATION_MS', '1500')), // 1.5s pause after ROI reveal
  };
}
