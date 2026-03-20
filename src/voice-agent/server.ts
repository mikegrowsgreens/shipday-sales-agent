/**
 * Voice Agent WebSocket Server (Session 6 Enhanced)
 * Main entry point for the real-time AI voice agent.
 *
 * Architecture:
 *   Inbound call → Twilio Media Stream → This WebSocket Server
 *                                             ↓
 *                                        Deepgram STT (streaming)
 *                                             ↓
 *                                        Claude API (sales prompt)
 *                                             ↓
 *                                        ElevenLabs TTS
 *                                             ↓
 *                                        Audio back through Twilio
 *
 * Session 6 Enhancements:
 * - Pre-cached filler audio for instant playback during Claude latency
 * - Context-aware filler selection based on conversation stage
 * - Conversation pacing that mirrors prospect speaking speed
 * - Strategic pauses after ROI reveals
 * - Robust barge-in with speech buffering and context-aware resumption
 * - Call quality monitoring with degraded mode fallback
 * - Enhanced warm handoff with rich context packets
 *
 * Runs as a separate PM2 process, NOT inside Next.js.
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import { loadConfig } from './config';
import { STTPipeline } from './stt';
import { TTSPipeline } from './tts';
import {
  initConversation,
  generateResponse,
  generateGreeting,
  endConversation,
  getConversation,
  getAllActiveCalls,
  updatePacing,
  recordBargeIn,
  addBargeInSpeech,
  clearBargeIn,
  requestPause,
} from './conversation-manager';
import { buildHandoffContext, executeWarmHandoff } from './handoff';
import { processCompletedCall } from './post-call';
import { startSSEServer, broadcastEvent } from './sse';
import { closePool } from './db';
import {
  updateSttConfidence,
  recordSttError,
  recordTtsError,
  recordReconnect,
  assessQuality,
} from './call-quality';
import type { TwilioMediaMessage } from './types';

// ─── Config ─────────────────────────────────────────────────────────────────

const config = loadConfig();

// ─── HTTP + WebSocket Server ────────────────────────────────────────────────

const httpServer = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    const activeCalls = getAllActiveCalls();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      activeCalls: activeCalls.size,
      uptime: process.uptime(),
    }));
    return;
  }

  // Status endpoint
  if (req.url === '/status') {
    const activeCalls = getAllActiveCalls();
    const calls = Array.from(activeCalls.values()).map(c => ({
      callSid: c.callSid,
      stage: c.stage,
      duration: Math.round((Date.now() - c.startedAt.getTime()) / 1000),
      messages: c.messages.length,
      qualified: c.qualificationSlots.qualified,
      pacing: {
        prospectWpm: c.pacing.prospectWpm,
        ttsSpeed: c.pacing.ttsSpeed,
      },
      callQuality: c.callQuality.quality,
      interruptions: c.interruptionCount,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ activeCalls: calls }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server: httpServer });

// ─── WebSocket Connection Handler ───────────────────────────────────────────

wss.on('connection', (ws: WebSocket) => {
  console.log('[server] New WebSocket connection');

  let callSid: string | null = null;
  let streamSid: string | null = null;
  let sttPipeline: STTPipeline | null = null;
  let ttsPipeline: TTSPipeline | null = null;
  let utteranceBuffer = '';
  let utteranceTimer: ReturnType<typeof setTimeout> | null = null;
  let isProcessing = false;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;
  let callDurationTimer: ReturnType<typeof setTimeout> | null = null;
  let qualityCheckTimer: ReturnType<typeof setInterval> | null = null;
  let fillerTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── Send audio back to Twilio via Media Stream ─────────────────────────

  function sendAudioToTwilio(audioBase64: string): void {
    if (ws.readyState !== WebSocket.OPEN || !streamSid) return;

    ws.send(JSON.stringify({
      event: 'media',
      streamSid,
      media: { payload: audioBase64 },
    }));
  }

  function sendMarkToTwilio(markName: string): void {
    if (ws.readyState !== WebSocket.OPEN || !streamSid) return;

    ws.send(JSON.stringify({
      event: 'mark',
      streamSid,
      mark: { name: markName },
    }));
  }

  function clearTwilioAudio(): void {
    if (ws.readyState !== WebSocket.OPEN || !streamSid) return;

    ws.send(JSON.stringify({
      event: 'clear',
      streamSid,
    }));
  }

  // ─── Process complete utterance ──────────────────────────────────────────

  async function processUtterance(text: string): Promise<void> {
    if (!callSid || !text.trim() || isProcessing) return;

    isProcessing = true;
    resetSilenceTimer();

    const state = getConversation(callSid);

    // Broadcast transcript update
    broadcastEvent('transcript_update', callSid, {
      role: 'prospect',
      text,
      timestamp: new Date(),
    });

    // Start a delayed filler — only plays if Claude takes >fillerMinLatencyMs
    const fillerStartTime = Date.now();
    let fillerPlayed = false;

    fillerTimer = setTimeout(async () => {
      if (!isProcessing || !ttsPipeline || !callSid) return;

      const currentStage = state?.stage || 'discovery';
      try {
        await ttsPipeline.speakFiller(currentStage, text);
        fillerPlayed = true;
      } catch {
        // Filler failed — not critical
      }
    }, config.fillerMinLatencyMs);

    try {
      const result = await generateResponse(callSid, text);

      // Cancel filler timer if response came fast enough
      if (fillerTimer) {
        clearTimeout(fillerTimer);
        fillerTimer = null;
      }

      // Stop any filler audio that's still playing
      if (fillerPlayed && ttsPipeline?.getIsSpeaking()) {
        ttsPipeline.interrupt();
        clearTwilioAudio();
        // Small pause after stopping filler before real response
        await new Promise(r => setTimeout(r, 100));
      }

      // Broadcast agent response
      broadcastEvent('transcript_update', callSid, {
        role: 'agent',
        text: result.text,
        timestamp: new Date(),
      });

      // Update stage
      if (state) {
        broadcastEvent('stage_change', callSid, {
          stage: state.stage,
          qualification: state.qualificationSlots,
        });

        if (state.computedROI) {
          broadcastEvent('roi_computed', callSid, { roi: state.computedROI });
        }

        // Update TTS speed based on pacing
        if (ttsPipeline) {
          ttsPipeline.setSpeed(state.pacing.ttsSpeed);
        }
      }

      // Strategic pause before ROI reveals
      if (result.shouldPauseAfter && ttsPipeline) {
        // Speak the response first
        await ttsPipeline.speak(result.text, state?.pacing.ttsSpeed);
        // Then insert a strategic pause to let the numbers sink in
        await ttsPipeline.insertPause(config.roiPauseDurationMs);
        sendMarkToTwilio('response_complete_with_pause');
      } else if (ttsPipeline) {
        // Normal response
        await ttsPipeline.speak(result.text, state?.pacing.ttsSpeed);
        sendMarkToTwilio('response_complete');
      }

      // Handle handoff
      if (result.handoffTriggered && result.handoffTrigger && state) {
        const context = buildHandoffContext(state, result.handoffTrigger);

        // Broadcast rich context to dashboard
        broadcastEvent('handoff_triggered', callSid, {
          context: {
            ...context,
            // Include extra dashboard-friendly data
            callDuration: `${Math.round(context.callDurationSec / 60)}m ${context.callDurationSec % 60}s`,
            triggerDescription: getHandoffTriggerDescription(result.handoffTrigger),
          },
        });

        const handoffResult = await executeWarmHandoff(callSid, {
          accountSid: config.twilioAccountSid,
          authToken: config.twilioAuthToken,
          phoneNumber: config.twilioPhoneNumber,
          repPhone: process.env.TWILIO_REP_PHONE || config.twilioPhoneNumber,
        }, context);

        if (!handoffResult.success) {
          console.error('[server] Handoff failed:', handoffResult.error);
          // Fallback: tell prospect we'll follow up
          if (ttsPipeline) {
            await ttsPipeline.speak("I'm having a little trouble connecting you right now. Let me have Mike reach out to you directly. What's the best number to reach you?");
          }
        }
      }
    } catch (error) {
      console.error('[server] Error processing utterance:', error);
    } finally {
      isProcessing = false;
      if (fillerTimer) {
        clearTimeout(fillerTimer);
        fillerTimer = null;
      }
    }
  }

  // ─── Silence detection ───────────────────────────────────────────────────

  function resetSilenceTimer(): void {
    if (silenceTimer) clearTimeout(silenceTimer);

    silenceTimer = setTimeout(() => {
      if (!callSid) return;
      const state = getConversation(callSid);
      if (!state) return;

      state.silenceCount++;

      // After extended silence, prompt the prospect
      if (state.silenceCount >= 3) {
        processUtterance(''); // Will trigger a gentle follow-up
      }
    }, config.maxSilenceMs);
  }

  // ─── Message Handler ────────────────────────────────────────────────────

  ws.on('message', async (data: Buffer) => {
    let message: TwilioMediaMessage;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    switch (message.event) {
      case 'connected':
        console.log('[server] Twilio Media Stream connected');
        break;

      case 'start': {
        const startData = message.start!;
        callSid = startData.callSid;
        streamSid = startData.streamSid;
        const customParams = startData.customParameters || {};

        console.log(`[server] Call started: ${callSid}, stream: ${streamSid}`);

        // Initialize conversation
        const contactId = customParams.contact_id ? parseInt(customParams.contact_id) : undefined;
        const orgId = customParams.org_id ? parseInt(customParams.org_id) : undefined;

        const state = await initConversation(callSid, contactId, orgId, customParams);

        // Broadcast call started
        broadcastEvent('call_started', callSid, {
          contactId,
          orgId,
          startedAt: state.startedAt,
        });

        // Initialize STT
        sttPipeline = new STTPipeline(config.deepgramApiKey);

        sttPipeline.on('transcript', (result) => {
          if (!result.transcript.trim()) return;

          if (result.isFinal) {
            utteranceBuffer += (utteranceBuffer ? ' ' : '') + result.transcript;

            // If barge-in is active, buffer the speech
            if (state.bargeIn.active) {
              addBargeInSpeech(callSid!, result.transcript);
            }

            // Wait for speech_final or timeout to process complete utterance
            if (result.speechFinal) {
              if (utteranceTimer) clearTimeout(utteranceTimer);
              const fullUtterance = utteranceBuffer.trim();
              utteranceBuffer = '';
              if (fullUtterance) {
                processUtterance(fullUtterance);
              }
            } else {
              // Set a timeout in case speechFinal doesn't fire
              if (utteranceTimer) clearTimeout(utteranceTimer);
              utteranceTimer = setTimeout(() => {
                const fullUtterance = utteranceBuffer.trim();
                utteranceBuffer = '';
                if (fullUtterance) {
                  processUtterance(fullUtterance);
                }
              }, 1500);
            }
          }
        });

        sttPipeline.on('speech_started', () => {
          // Barge-in: prospect started talking while AI is speaking
          if (ttsPipeline?.getIsSpeaking()) {
            console.log(`[server] Barge-in detected for ${callSid}`);

            // Record what was interrupted and how far along it was
            const interruptedText = ttsPipeline.getLastSpokenText();
            const interruptionPoint = ttsPipeline.interrupt();
            clearTwilioAudio();

            // Record barge-in context
            if (callSid) {
              recordBargeIn(callSid, interruptedText, interruptionPoint);
            }
          }
          resetSilenceTimer();
        });

        // Speaking rate tracking
        sttPipeline.on('speaking_rate', ({ wpm }: { wpm: number }) => {
          if (callSid) {
            updatePacing(callSid, wpm);
          }
        });

        // Confidence tracking for call quality
        sttPipeline.on('confidence_update', ({ current }: { current: number }) => {
          if (callSid) {
            const convState = getConversation(callSid);
            if (convState) {
              updateSttConfidence(
                convState.callQuality,
                current,
                config.sttConfidenceThreshold,
              );
            }
          }
        });

        sttPipeline.on('error', (error) => {
          console.error(`[server] STT error for ${callSid}:`, error);
          if (callSid) {
            const convState = getConversation(callSid);
            if (convState) {
              recordSttError(convState.callQuality);
            }
          }
        });

        sttPipeline.on('reconnecting', () => {
          if (callSid) {
            const convState = getConversation(callSid);
            if (convState) {
              recordReconnect(convState.callQuality);
            }
          }
        });

        await sttPipeline.start();

        // Initialize TTS
        ttsPipeline = new TTSPipeline(config.elevenLabsApiKey, config.elevenLabsVoiceId);

        ttsPipeline.on('audio', (audioBase64: string) => {
          sendAudioToTwilio(audioBase64);
        });

        ttsPipeline.on('error', (error) => {
          console.error(`[server] TTS error for ${callSid}:`, error);
          if (callSid) {
            const convState = getConversation(callSid);
            if (convState) {
              recordTtsError(convState.callQuality);
            }
          }
        });

        // Generate and speak greeting
        const greeting = await generateGreeting(callSid);
        await ttsPipeline.speak(greeting);
        sendMarkToTwilio('greeting_complete');

        // Start silence timer
        resetSilenceTimer();

        // Start call quality monitoring
        qualityCheckTimer = setInterval(() => {
          if (!callSid) return;
          const convState = getConversation(callSid);
          if (!convState) return;

          const { quality, degradedMode } = assessQuality(
            convState.callQuality,
            config.lowConfidenceMaxStreak,
          );

          // Broadcast quality changes to dashboard
          if (quality !== convState.callQuality.quality) {
            broadcastEvent('quality_change' as never, callSid, {
              quality,
              degradedMode,
              avgConfidence: convState.callQuality.avgSttConfidence,
            });
          }

          // If quality drops to poor, notify via TTS
          if (quality === 'poor' && !convState.callQuality.degradedMode) {
            console.warn(`[server] Call quality POOR for ${callSid}`);
          }
        }, config.qualityCheckIntervalMs);

        // Set max call duration timer
        callDurationTimer = setTimeout(async () => {
          if (!callSid) return;
          console.log(`[server] Max call duration reached for ${callSid}`);
          const convState = getConversation(callSid);
          if (convState && !convState.handoffTriggered) {
            if (ttsPipeline) {
              await ttsPipeline.speak("I've really enjoyed our conversation. Let me get you connected with our team to discuss next steps. One moment.");
            }
            convState.handoffTriggered = true;
            convState.handoffReason = 'max_duration';
          }
        }, config.maxCallDurationMs);

        break;
      }

      case 'media': {
        // Forward audio to Deepgram STT
        if (sttPipeline && message.media?.payload) {
          sttPipeline.sendAudio(message.media.payload);
        }
        break;
      }

      case 'mark': {
        console.log(`[server] Mark received: ${message.mark?.name} for ${callSid}`);
        break;
      }

      case 'stop': {
        console.log(`[server] Call ended: ${callSid}`);

        // Clean up timers
        if (utteranceTimer) clearTimeout(utteranceTimer);
        if (silenceTimer) clearTimeout(silenceTimer);
        if (callDurationTimer) clearTimeout(callDurationTimer);
        if (qualityCheckTimer) clearInterval(qualityCheckTimer);
        if (fillerTimer) clearTimeout(fillerTimer);

        // Stop pipelines
        if (sttPipeline) await sttPipeline.stop();
        if (ttsPipeline) ttsPipeline.interrupt();

        // Process completed call
        if (callSid) {
          const finalState = endConversation(callSid);
          if (finalState) {
            broadcastEvent('call_ended', callSid, {
              duration: Math.round((Date.now() - finalState.startedAt.getTime()) / 1000),
              finalStage: finalState.stage,
              messagesCount: finalState.messages.length,
              qualified: finalState.qualificationSlots.qualified,
              handoff: finalState.handoffTriggered,
              callQuality: finalState.callQuality.quality,
              interruptionCount: finalState.interruptionCount,
              prospectWpm: finalState.pacing.prospectWpm,
            });

            // Post-call processing (async — don't block)
            processCompletedCall(finalState).catch(err => {
              console.error(`[server] Post-call processing error:`, err);
            });
          }
        }

        break;
      }
    }
  });

  ws.on('close', () => {
    console.log(`[server] WebSocket closed for ${callSid}`);
    if (utteranceTimer) clearTimeout(utteranceTimer);
    if (silenceTimer) clearTimeout(silenceTimer);
    if (callDurationTimer) clearTimeout(callDurationTimer);
    if (qualityCheckTimer) clearInterval(qualityCheckTimer);
    if (fillerTimer) clearTimeout(fillerTimer);
    if (sttPipeline) sttPipeline.stop();
    if (ttsPipeline) ttsPipeline.interrupt();
  });

  ws.on('error', (error) => {
    console.error(`[server] WebSocket error for ${callSid}:`, error);
  });
});

// ─── Utility ─────────────────────────────────────────────────────────────────

function getHandoffTriggerDescription(trigger: string): string {
  switch (trigger) {
    case 'prospect_request': return 'Prospect requested human rep';
    case 'high_intent': return 'Qualified + high buying intent';
    case 'emotional_escalation': return 'Emotional escalation detected';
    case 'stalled_conversation': return 'Conversation stalled / max duration';
    default: return trigger;
  }
}

// ─── Start Server ───────────────────────────────────────────────────────────

httpServer.listen(config.port, () => {
  console.log(`[voice-agent] WebSocket server listening on port ${config.port}`);
  console.log(`[voice-agent] Config: model=${config.claudeModel}, voice=${config.elevenLabsVoiceId}`);
  console.log(`[voice-agent] Session 6 features: fillers, pacing, barge-in, call quality`);
});

// Start SSE server for dashboard updates
startSSEServer(config.ssePort);

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  console.log(`[voice-agent] Received ${signal}, shutting down...`);

  // End all active calls
  const activeCalls = getAllActiveCalls();
  for (const [sid] of activeCalls) {
    const state = endConversation(sid);
    if (state) {
      await processCompletedCall(state).catch(() => {});
    }
  }

  // Close servers
  wss.close();
  httpServer.close();
  await closePool();

  console.log('[voice-agent] Shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { httpServer, wss };
