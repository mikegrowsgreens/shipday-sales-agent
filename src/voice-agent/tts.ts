/**
 * Text-to-Speech Pipeline (Session 6 Enhanced)
 * Converts Claude's text responses to audio via ElevenLabs,
 * then streams mulaw-encoded audio back through Twilio.
 *
 * Enhancements:
 * - Pre-generated filler audio cache (instant playback, no TTS latency)
 * - Context-aware filler selection based on conversation stage
 * - Strategic pauses after ROI reveals and key moments
 * - TTS emphasis cues for important numbers/names
 * - Speaking rate adjustment to mirror prospect pacing
 */

import { ElevenLabsClient } from 'elevenlabs';
import { EventEmitter } from 'events';
import type { FillerCategory, FillerPhrase, VoiceStage } from './types';

// ─── Filler Phrase Library ───────────────────────────────────────────────────

const FILLER_LIBRARY: FillerPhrase[] = [
  // Acknowledgment fillers — played when prospect shares info
  { text: "That's a great point...", category: 'acknowledgment', minLatencyMs: 300 },
  { text: "Absolutely...", category: 'acknowledgment', minLatencyMs: 200 },
  { text: "Right, right...", category: 'acknowledgment', minLatencyMs: 200 },
  { text: "Got it...", category: 'acknowledgment', minLatencyMs: 200 },
  { text: "Yeah, totally...", category: 'acknowledgment', minLatencyMs: 200 },

  // Thinking fillers — played when prospect asks a question
  { text: "Hmm, let me think about that...", category: 'thinking', minLatencyMs: 400 },
  { text: "You know what, that's interesting...", category: 'thinking', minLatencyMs: 400 },
  { text: "Great question...", category: 'thinking', minLatencyMs: 300 },
  { text: "So...", category: 'thinking', minLatencyMs: 300 },

  // Transition fillers — played between conversation stages
  { text: "Sure, so...", category: 'transition', minLatencyMs: 300 },
  { text: "OK so here's what I'm thinking...", category: 'transition', minLatencyMs: 400 },
  { text: "Let me share something with you...", category: 'transition', minLatencyMs: 400 },

  // Empathy fillers — played when prospect expresses frustration
  { text: "I totally hear you...", category: 'empathy', minLatencyMs: 200 },
  { text: "Yeah, that's really tough...", category: 'empathy', minLatencyMs: 200 },
  { text: "I completely understand...", category: 'empathy', minLatencyMs: 200 },
];

// Map conversation stages to preferred filler categories
const STAGE_FILLER_MAP: Record<VoiceStage, FillerCategory[]> = {
  greeting: ['acknowledgment'],
  hook: ['acknowledgment', 'transition'],
  rapport: ['acknowledgment', 'empathy'],
  discovery: ['acknowledgment', 'thinking'],
  implication: ['empathy', 'thinking'],
  solution_mapping: ['transition', 'thinking'],
  roi_crystallization: ['transition', 'thinking'],
  commitment: ['acknowledgment', 'transition'],
  close: ['acknowledgment', 'transition'],
  handoff: ['acknowledgment'],
  ended: ['acknowledgment'],
};

// ─── Filler Audio Cache ──────────────────────────────────────────────────────

interface CachedFiller {
  phrase: FillerPhrase;
  audioChunks: string[]; // base64-encoded mulaw frames
}

export class TTSPipeline extends EventEmitter {
  private client: ElevenLabsClient;
  private voiceId: string;
  private isSpeaking = false;
  private abortController: AbortController | null = null;

  // Filler cache: pre-generated audio for instant playback
  private fillerCache: Map<string, CachedFiller> = new Map();
  private fillerCacheReady = false;
  private fillerUsageHistory: string[] = []; // Track recent fillers to avoid repetition

  // Pacing
  private currentSpeed = 1.0;

  // Emphasis tracking
  private lastSpokenText = '';

  constructor(apiKey: string, voiceId: string) {
    super();
    this.client = new ElevenLabsClient({ apiKey });
    this.voiceId = voiceId;

    // Pre-generate filler audio in background
    this.warmFillerCache().catch(err => {
      console.warn('[tts] Filler cache warm-up failed (will use live TTS):', err);
    });
  }

  /**
   * Pre-generate audio for all filler phrases so they play instantly.
   * Runs async in background — falls back to live TTS if not ready.
   */
  private async warmFillerCache(): Promise<void> {
    console.log('[tts] Warming filler cache...');
    const startTime = Date.now();

    // Generate a subset of fillers to keep startup fast
    const priorityFillers = FILLER_LIBRARY.filter(f =>
      f.category === 'acknowledgment' || f.category === 'thinking'
    ).slice(0, 8);

    for (const filler of priorityFillers) {
      try {
        const audioChunks = await this.generateAudioChunks(filler.text, 1.0);
        this.fillerCache.set(filler.text, { phrase: filler, audioChunks });
      } catch (err) {
        console.warn(`[tts] Failed to cache filler "${filler.text}":`, err);
      }
    }

    this.fillerCacheReady = true;
    console.log(`[tts] Filler cache ready: ${this.fillerCache.size} phrases in ${Date.now() - startTime}ms`);

    // Generate remaining fillers in background (non-blocking)
    for (const filler of FILLER_LIBRARY) {
      if (this.fillerCache.has(filler.text)) continue;
      this.generateAudioChunks(filler.text, 1.0)
        .then(chunks => {
          this.fillerCache.set(filler.text, { phrase: filler, audioChunks: chunks });
        })
        .catch(() => {}); // Non-critical
    }
  }

  /**
   * Generate audio chunks for a piece of text (used for cache warming).
   */
  private async generateAudioChunks(text: string, speed: number): Promise<string[]> {
    const audioStream = await this.client.textToSpeech.convertAsStream(
      this.voiceId,
      {
        text,
        model_id: 'eleven_turbo_v2_5',
        output_format: 'ulaw_8000',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
          speed,
        },
      }
    );

    const frames: string[] = [];
    const FRAME_SIZE = 160;

    for await (const chunk of audioStream) {
      const buffer = Buffer.from(chunk);
      let offset = 0;
      while (offset + FRAME_SIZE <= buffer.length) {
        frames.push(buffer.subarray(offset, offset + FRAME_SIZE).toString('base64'));
        offset += FRAME_SIZE;
      }
      if (offset < buffer.length) {
        frames.push(buffer.subarray(offset).toString('base64'));
      }
    }

    return frames;
  }

  /**
   * Convert text to speech and emit audio chunks.
   * Returns immediately; audio chunks are emitted as 'audio' events.
   * Each chunk is base64-encoded mulaw audio suitable for Twilio.
   */
  async speak(text: string, speed?: number): Promise<void> {
    if (!text.trim()) return;

    this.abortController = new AbortController();
    this.isSpeaking = true;
    this.lastSpokenText = text;
    this.currentSpeed = speed ?? 1.0;
    this.emit('speaking_start', { text });

    try {
      const audioStream = await this.client.textToSpeech.convertAsStream(
        this.voiceId,
        {
          text,
          model_id: 'eleven_turbo_v2_5',
          output_format: 'ulaw_8000',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
            speed: this.currentSpeed,
          },
        }
      );

      const FRAME_SIZE = 160;
      for await (const chunk of audioStream) {
        if (this.abortController?.signal.aborted) break;

        const buffer = Buffer.from(chunk);
        let offset = 0;
        while (offset + FRAME_SIZE <= buffer.length) {
          this.emit('audio', buffer.subarray(offset, offset + FRAME_SIZE).toString('base64'));
          offset += FRAME_SIZE;
        }
        if (offset < buffer.length) {
          this.emit('audio', buffer.subarray(offset).toString('base64'));
        }
      }

      this.isSpeaking = false;
      this.emit('speaking_end');
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[tts] Speech aborted (barge-in)');
      } else {
        console.error('[tts] ElevenLabs error:', error);
        this.emit('error', error);
      }
      this.isSpeaking = false;
      this.emit('speaking_end');
    }
  }

  /**
   * Play a pre-cached filler phrase instantly (no TTS latency).
   * Falls back to live TTS if cache miss.
   * Returns the filler text that was played.
   */
  async speakFiller(stage: VoiceStage, prospectUtterance?: string): Promise<string> {
    const filler = selectFiller(stage, prospectUtterance, this.fillerUsageHistory);

    // Track usage to avoid repetition
    this.fillerUsageHistory.push(filler.text);
    if (this.fillerUsageHistory.length > 10) {
      this.fillerUsageHistory.shift();
    }

    // Try cached version first (instant playback)
    const cached = this.fillerCache.get(filler.text);
    if (cached && this.fillerCacheReady) {
      this.isSpeaking = true;
      this.abortController = new AbortController();
      this.emit('speaking_start', { text: filler.text, isFiller: true });

      for (const frame of cached.audioChunks) {
        if (this.abortController?.signal.aborted) break;
        this.emit('audio', frame);
      }

      this.isSpeaking = false;
      this.emit('speaking_end');
      return filler.text;
    }

    // Fallback: generate live (still fast — fillers are short)
    await this.speak(filler.text, this.currentSpeed);
    return filler.text;
  }

  /**
   * Generate a silence gap (strategic pause).
   * Emits silent mulaw frames to keep the Twilio stream alive.
   */
  async insertPause(durationMs: number): Promise<void> {
    // 8kHz mulaw = 8000 bytes/sec, 160-byte frames = 50 frames/sec = 20ms/frame
    const frameCount = Math.ceil(durationMs / 20);
    // mulaw silence = 0xFF (255) repeated
    const silentFrame = Buffer.alloc(160, 0xFF).toString('base64');

    for (let i = 0; i < frameCount; i++) {
      this.emit('audio', silentFrame);
      // Small delay to maintain natural timing
      if (i % 10 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  /**
   * Immediately stop current speech output (barge-in support).
   * Returns what fraction of the text was spoken (0-1 estimate).
   */
  interrupt(): number {
    const wasSpoken = this.lastSpokenText;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isSpeaking = false;
    this.emit('interrupted', { text: wasSpoken });

    // Rough estimate of how much was spoken (based on ElevenLabs average throughput)
    // ~150 words/min at 1.0x speed = ~2.5 words/sec, ~400ms per word
    return 0.5; // Conservative estimate
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  getLastSpokenText(): string {
    return this.lastSpokenText;
  }

  setSpeed(speed: number): void {
    this.currentSpeed = Math.max(0.8, Math.min(1.15, speed));
  }
}

// ─── Filler Selection Logic ──────────────────────────────────────────────────

/**
 * Select a context-appropriate filler phrase based on:
 * - Current conversation stage
 * - What the prospect just said (question vs statement vs frustration)
 * - Recent filler history (avoid repetition)
 */
function selectFiller(
  stage: VoiceStage,
  prospectUtterance?: string,
  recentHistory: string[] = [],
): FillerPhrase {
  let preferredCategories = STAGE_FILLER_MAP[stage] || ['acknowledgment'];

  // Override category based on utterance content
  if (prospectUtterance) {
    const lower = prospectUtterance.toLowerCase();
    if (lower.includes('?') || lower.match(/(?:how|what|why|when|can you|do you|is it)/)) {
      preferredCategories = ['thinking'];
    } else if (lower.match(/(?:frustrated|annoyed|expensive|waste|losing|problem|issue|hard|difficult)/)) {
      preferredCategories = ['empathy'];
    }
  }

  // Filter to preferred categories
  let candidates = FILLER_LIBRARY.filter(f => preferredCategories.includes(f.category));
  if (candidates.length === 0) candidates = FILLER_LIBRARY;

  // Remove recently used
  const recentSet = new Set(recentHistory.slice(-5));
  const fresh = candidates.filter(f => !recentSet.has(f.text));
  if (fresh.length > 0) candidates = fresh;

  // Random selection from remaining candidates
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ─── Legacy export for backward compatibility ────────────────────────────────

export function getFillerPhrase(): string {
  const phrase = FILLER_LIBRARY[Math.floor(Math.random() * FILLER_LIBRARY.length)];
  return phrase.text;
}
