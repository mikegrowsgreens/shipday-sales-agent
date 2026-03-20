/**
 * Call Quality Monitor (Session 6)
 * Monitors connection quality and triggers degraded mode when needed.
 *
 * Tracks:
 * - STT confidence (low confidence = poor audio quality)
 * - STT/TTS errors (failures = connection issues)
 * - WebSocket reconnects (instability)
 *
 * Degraded mode:
 * - Shorter, simpler responses from Claude
 * - Slower speaking rate for clarity
 * - More explicit acknowledgments
 */

import type { CallQualityState, ConnectionQuality } from './types';

/**
 * Create a fresh call quality state.
 */
export function createCallQualityState(): CallQualityState {
  return {
    quality: 'excellent',
    avgSttConfidence: 1.0,
    sttErrorCount: 0,
    ttsErrorCount: 0,
    wsReconnectAttempts: 0,
    degradedMode: false,
    lastAssessedAt: new Date(),
    lowConfidenceStreak: 0,
  };
}

/**
 * Update quality state with a new STT confidence reading.
 */
export function updateSttConfidence(
  state: CallQualityState,
  confidence: number,
  threshold: number,
): void {
  // Exponential moving average
  state.avgSttConfidence = state.avgSttConfidence * 0.8 + confidence * 0.2;

  if (confidence < threshold) {
    state.lowConfidenceStreak++;
  } else {
    state.lowConfidenceStreak = Math.max(0, state.lowConfidenceStreak - 1);
  }
}

/**
 * Record an STT error.
 */
export function recordSttError(state: CallQualityState): void {
  state.sttErrorCount++;
}

/**
 * Record a TTS error.
 */
export function recordTtsError(state: CallQualityState): void {
  state.ttsErrorCount++;
}

/**
 * Record a WebSocket reconnect attempt.
 */
export function recordReconnect(state: CallQualityState): void {
  state.wsReconnectAttempts++;
}

/**
 * Assess overall call quality based on all signals.
 * Returns the new quality level and whether degraded mode should be active.
 */
export function assessQuality(
  state: CallQualityState,
  maxLowConfStreak: number,
): { quality: ConnectionQuality; degradedMode: boolean } {
  state.lastAssessedAt = new Date();

  const totalErrors = state.sttErrorCount + state.ttsErrorCount;
  const reconnects = state.wsReconnectAttempts;
  const avgConf = state.avgSttConfidence;
  const streak = state.lowConfidenceStreak;

  let quality: ConnectionQuality;
  let degradedMode = false;

  if (reconnects >= 3 || totalErrors >= 10 || avgConf < 0.3) {
    quality = 'poor';
    degradedMode = true;
  } else if (reconnects >= 2 || totalErrors >= 5 || streak >= maxLowConfStreak || avgConf < 0.5) {
    quality = 'degraded';
    degradedMode = true;
  } else if (totalErrors >= 2 || avgConf < 0.7 || streak >= 2) {
    quality = 'good';
    degradedMode = false;
  } else {
    quality = 'excellent';
    degradedMode = false;
  }

  state.quality = quality;
  state.degradedMode = degradedMode;

  return { quality, degradedMode };
}

/**
 * Get a quality-appropriate instruction modifier for the Claude system prompt.
 */
export function getDegradedModeInstructions(state: CallQualityState): string {
  if (!state.degradedMode) return '';

  if (state.quality === 'poor') {
    return `
## CONNECTION QUALITY: POOR
The call has connection issues. Adjust your behavior:
- Use VERY SHORT responses (1 sentence max)
- Speak slowly and clearly
- Repeat key numbers
- Confirm what you heard: "I think you said X — is that right?"
- If quality doesn't improve, suggest: "The connection seems a bit rough. Would you prefer to continue over text? I can send you a link."`;
  }

  return `
## CONNECTION QUALITY: DEGRADED
Audio quality is inconsistent. Adjust your behavior:
- Keep responses to 1-2 sentences
- Confirm important details: "Just to make sure I got that right..."
- Speak at a measured pace
- Avoid complex sentences`;
}
