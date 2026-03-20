/**
 * Speech-to-Text Pipeline (Session 6 Enhanced)
 * Streams audio from Twilio Media Stream to Deepgram for real-time transcription.
 * Uses Deepgram's WebSocket API directly for maximum control and compatibility.
 *
 * Enhancements:
 * - Speaking rate estimation from word timings
 * - Confidence tracking for call quality monitoring
 * - Reconnection logic for degraded connections
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { STTResult } from './types';

export class STTPipeline extends EventEmitter {
  private ws: WebSocket | null = null;
  private apiKey: string;
  private isConnected = false;

  // Speaking rate tracking
  private recentWordTimings: Array<{ wordCount: number; durationSec: number }> = [];
  private currentEstimatedWpm = 150; // Default average

  // Confidence tracking for call quality
  private recentConfidences: number[] = [];
  private errorCount = 0;

  // Reconnection
  private reconnectAttempts = 0;
  private maxReconnects = 3;
  private audioBuffer: Buffer[] = []; // Buffer audio during reconnection

  constructor(apiKey: string) {
    super();
    this.apiKey = apiKey;
  }

  async start(): Promise<void> {
    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en-US',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      utterance_end_ms: '1000',
      vad_events: 'true',
      encoding: 'mulaw',
      sample_rate: '8000',
      channels: '1',
      endpointing: '300',
    });

    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;

    this.ws = new WebSocket(url, {
      headers: { Authorization: `Token ${this.apiKey}` },
    });

    this.ws.on('open', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('[stt] Deepgram WebSocket connected');
      this.emit('ready');

      // Flush any buffered audio from reconnection
      if (this.audioBuffer.length > 0) {
        console.log(`[stt] Flushing ${this.audioBuffer.length} buffered audio packets`);
        for (const buf of this.audioBuffer) {
          this.ws?.send(buf);
        }
        this.audioBuffer = [];
      }
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'Results') {
          const alt = msg.channel?.alternatives?.[0];
          if (!alt) return;

          const result: STTResult = {
            transcript: alt.transcript || '',
            isFinal: msg.is_final || false,
            confidence: alt.confidence || 0,
            speechFinal: msg.speech_final || false,
            words: alt.words?.map((w: { word: string; start: number; end: number }) => ({
              word: w.word,
              start: w.start,
              end: w.end,
            })),
          };

          // Track confidence for call quality
          if (result.isFinal && result.transcript.trim()) {
            this.recentConfidences.push(result.confidence);
            if (this.recentConfidences.length > 20) this.recentConfidences.shift();
            this.emit('confidence_update', {
              current: result.confidence,
              average: this.getAverageConfidence(),
            });
          }

          // Estimate speaking rate from word timings
          if (result.isFinal && result.words && result.words.length >= 2) {
            const firstWord = result.words[0];
            const lastWord = result.words[result.words.length - 1];
            const durationSec = lastWord.end - firstWord.start;
            if (durationSec > 0.5) {
              this.updateSpeakingRate(result.words.length, durationSec);
            }
          }

          if (result.transcript.trim()) {
            this.emit('transcript', result);
          }
        } else if (msg.type === 'UtteranceEnd') {
          this.emit('utterance_end');
        } else if (msg.type === 'SpeechStarted') {
          this.emit('speech_started');
        }
      } catch (e) {
        console.warn('[stt] Failed to parse Deepgram message:', e);
      }
    });

    this.ws.on('error', (error) => {
      this.errorCount++;
      console.error('[stt] Deepgram WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', (code) => {
      this.isConnected = false;
      console.log(`[stt] Deepgram WebSocket closed (code: ${code})`);

      // Auto-reconnect on unexpected close
      if (code !== 1000 && this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        console.log(`[stt] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnects})...`);
        this.emit('reconnecting', { attempt: this.reconnectAttempts });

        setTimeout(() => {
          this.start().catch(err => {
            console.error('[stt] Reconnect failed:', err);
            this.emit('reconnect_failed');
          });
        }, 500 * this.reconnectAttempts); // Exponential backoff
      } else {
        this.emit('closed');
      }
    });
  }

  /**
   * Send raw mulaw audio bytes from Twilio to Deepgram.
   */
  sendAudio(audioPayload: string): void {
    const buffer = Buffer.from(audioPayload, 'base64');

    if (!this.ws || !this.isConnected) {
      // Buffer audio during reconnection (up to 2 seconds worth)
      if (this.audioBuffer.length < 400) { // ~2s at 8kHz
        this.audioBuffer.push(buffer);
      }
      return;
    }

    this.ws.send(buffer);
  }

  async stop(): Promise<void> {
    this.maxReconnects = 0; // Prevent reconnection on intentional close
    if (this.ws) {
      this.ws.close(1000);
      this.ws = null;
      this.isConnected = false;
    }
  }

  // ─── Speaking Rate Estimation ─────────────────────────────────────────────

  private updateSpeakingRate(wordCount: number, durationSec: number): void {
    const wpm = (wordCount / durationSec) * 60;

    // Only accept reasonable rates (70-250 WPM)
    if (wpm < 70 || wpm > 250) return;

    this.recentWordTimings.push({ wordCount, durationSec });
    if (this.recentWordTimings.length > 10) this.recentWordTimings.shift();

    // Weighted average favoring recent utterances
    let totalWords = 0;
    let totalDuration = 0;
    for (let i = 0; i < this.recentWordTimings.length; i++) {
      const weight = 1 + (i / this.recentWordTimings.length); // More recent = higher weight
      totalWords += this.recentWordTimings[i].wordCount * weight;
      totalDuration += this.recentWordTimings[i].durationSec * weight;
    }

    this.currentEstimatedWpm = totalDuration > 0
      ? Math.round((totalWords / totalDuration) * 60)
      : 150;

    this.emit('speaking_rate', { wpm: this.currentEstimatedWpm });
  }

  /**
   * Get the estimated prospect speaking rate in WPM.
   */
  getEstimatedWpm(): number {
    return this.currentEstimatedWpm;
  }

  /**
   * Get the rolling average STT confidence (0-1).
   */
  getAverageConfidence(): number {
    if (this.recentConfidences.length === 0) return 1.0;
    return this.recentConfidences.reduce((a, b) => a + b, 0) / this.recentConfidences.length;
  }

  /**
   * Get the total number of STT errors.
   */
  getErrorCount(): number {
    return this.errorCount;
  }

  /**
   * Get the number of reconnect attempts.
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}
