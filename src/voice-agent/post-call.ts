/**
 * Post-Call Processing Pipeline
 * After a voice agent call ends, this module:
 * 1. Saves the full transcript to the database
 * 2. Records the call in phone_calls + touchpoints
 * 3. Feeds the conversation through the brain learning pipeline
 * 4. Updates contact qualification data
 */

import Anthropic from '@anthropic-ai/sdk';
import { query, queryOne } from './db';
import type { ConversationState } from './types';

const anthropic = new Anthropic();

export async function processCompletedCall(state: ConversationState): Promise<void> {
  const startTime = Date.now();
  console.log(`[post-call] Processing call ${state.callSid}...`);

  try {
    // 1. Build full transcript
    const transcript = state.messages
      .map(m => `${m.role === 'agent' ? 'AGENT' : 'PROSPECT'}: ${m.content}`)
      .join('\n\n');

    const durationSeconds = Math.round((Date.now() - state.startedAt.getTime()) / 1000);

    // 2. Save to voice_agent_calls table
    await query(
      `INSERT INTO crm.voice_agent_calls
       (call_sid, session_id, contact_id, org_id, direction, status,
        duration_seconds, messages_count, transcript, qualification_slots,
        computed_roi, final_stage, handoff_triggered, handoff_reason,
        started_at, ended_at)
       VALUES ($1, $2, $3, $4, 'inbound', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
      [
        state.callSid,
        state.sessionId,
        state.contactId || null,
        state.orgId || null,
        state.handoffTriggered ? 'transferred' : 'completed',
        durationSeconds,
        state.messages.length,
        transcript,
        JSON.stringify(state.qualificationSlots),
        state.computedROI || null,
        state.stage,
        state.handoffTriggered,
        state.handoffReason || null,
        state.startedAt,
      ]
    );

    // 3. Update phone_calls if linked to existing call record
    await query(
      `UPDATE crm.phone_calls
       SET status = 'completed',
           duration_seconds = $1,
           notes = $2,
           disposition = $3,
           ended_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb
       WHERE twilio_sid = $5`,
      [
        durationSeconds,
        `AI Voice Agent call - ${state.stage} stage`,
        state.handoffTriggered ? 'transferred' : (state.qualificationSlots.qualified ? 'qualified' : 'nurture'),
        JSON.stringify({
          voice_agent: true,
          session_id: state.sessionId,
          final_stage: state.stage,
          messages_count: state.messages.length,
          qualification: state.qualificationSlots,
        }),
        state.callSid,
      ]
    );

    // 4. Create touchpoint record
    if (state.contactId) {
      await query(
        `INSERT INTO crm.touchpoints
         (contact_id, channel, event_type, direction, source_system, subject, body_preview, metadata, occurred_at)
         VALUES ($1, 'phone', 'ai_voice_call', 'inbound', 'voice-agent', $2, $3, $4, $5)`,
        [
          state.contactId,
          `AI Voice Call - ${state.stage} (${durationSeconds}s)`,
          transcript.substring(0, 500),
          JSON.stringify({
            call_sid: state.callSid,
            session_id: state.sessionId,
            duration_seconds: durationSeconds,
            messages_count: state.messages.length,
            final_stage: state.stage,
            handoff: state.handoffTriggered,
            qualified: state.qualificationSlots.qualified,
          }),
          state.startedAt,
        ]
      );
    }

    // 5. Feed through brain learning pipeline (extract patterns)
    await extractAndLearnPatterns(state, transcript);

    // 6. Update contact qualification if we have new data
    if (state.contactId && Object.keys(state.qualificationSlots).length > 0) {
      await updateContactFromCall(state);
    }

    console.log(`[post-call] Completed processing for ${state.callSid} in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error(`[post-call] Error processing call ${state.callSid}:`, error);
  }
}

/**
 * Extract sales patterns from the call and feed into the brain.
 */
async function extractAndLearnPatterns(state: ConversationState, transcript: string): Promise<void> {
  try {
    const response = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Analyze this AI sales call transcript and extract actionable patterns.

TRANSCRIPT:
${transcript.substring(0, 3000)}

CALL OUTCOME:
- Final stage: ${state.stage}
- Qualified: ${state.qualificationSlots.qualified ?? 'unknown'}
- Handoff triggered: ${state.handoffTriggered}
- Duration: ${Math.round((Date.now() - state.startedAt.getTime()) / 1000)}s

Extract patterns as JSON array. Each pattern:
{
  "pattern_type": "objection_handling" | "discovery_question" | "roi_story" | "closing_technique" | "competitor_counter" | "prospect_pain_verbatim",
  "pattern_text": "description of the pattern",
  "effectiveness_score": 0.0 to 1.0 based on outcome,
  "context": { "stage": "...", "outcome": "..." }
}

Return ONLY the JSON array. If no meaningful patterns, return [].`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const patterns = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(patterns) || patterns.length === 0) return;

    for (const pattern of patterns) {
      if (!pattern.pattern_type || !pattern.pattern_text) continue;

      try {
        await query(
          `INSERT INTO brain.call_patterns
           (pattern_type, pattern_text, context, effectiveness_score, times_referenced, owner_email)
           VALUES ($1, $2, $3, $4, 1, 'voice-agent')
           ON CONFLICT (pattern_type, md5(pattern_text))
           DO UPDATE SET
             effectiveness_score = (brain.call_patterns.effectiveness_score + $4) / 2,
             times_referenced = brain.call_patterns.times_referenced + 1,
             updated_at = NOW()`,
          [
            pattern.pattern_type,
            pattern.pattern_text,
            JSON.stringify({
              ...pattern.context,
              call_sid: state.callSid,
              source: 'voice_agent',
            }),
            pattern.effectiveness_score || 0.5,
          ]
        );
      } catch {
        // Ignore individual pattern insert failures (table may not have constraint)
        try {
          await query(
            `INSERT INTO brain.call_patterns
             (pattern_type, pattern_text, context, effectiveness_score, times_referenced, owner_email)
             VALUES ($1, $2, $3, $4, 1, 'voice-agent')`,
            [
              pattern.pattern_type,
              pattern.pattern_text,
              JSON.stringify({ ...pattern.context, call_sid: state.callSid, source: 'voice_agent' }),
              pattern.effectiveness_score || 0.5,
            ]
          );
        } catch (e2) {
          console.warn('[post-call] Failed to insert pattern:', e2);
        }
      }
    }

    console.log(`[post-call] Extracted ${patterns.length} patterns from call ${state.callSid}`);
  } catch (error) {
    console.warn('[post-call] Pattern extraction failed:', error);
  }
}

/**
 * Update the contact record with qualification data gathered during the call.
 */
async function updateContactFromCall(state: ConversationState): Promise<void> {
  const slots = state.qualificationSlots;
  if (!state.contactId) return;

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (slots.name) {
    const parts = slots.name.split(' ');
    if (parts[0]) {
      updates.push(`first_name = COALESCE(first_name, $${paramIdx})`);
      params.push(parts[0]);
      paramIdx++;
    }
    if (parts[1]) {
      updates.push(`last_name = COALESCE(last_name, $${paramIdx})`);
      params.push(parts[1]);
      paramIdx++;
    }
  }

  if (slots.company) {
    updates.push(`business_name = COALESCE(business_name, $${paramIdx})`);
    params.push(slots.company);
    paramIdx++;
  }

  if (slots.qualified === true) {
    updates.push(`lifecycle_stage = CASE WHEN lifecycle_stage IN ('raw', 'enriched', 'outreach') THEN 'engaged' ELSE lifecycle_stage END`);
  }

  // Store qualification data in metadata
  updates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${paramIdx}::jsonb`);
  params.push(JSON.stringify({
    voice_agent_qualification: {
      orders_per_week: slots.orders_per_week,
      aov: slots.aov,
      commission_tier: slots.commission_tier,
      restaurant_type: slots.restaurant_type,
      qualified: slots.qualified,
      growth_qualified: slots.growth_qualified,
      last_call: new Date().toISOString(),
    },
  }));
  paramIdx++;

  if (updates.length === 0) return;

  params.push(state.contactId);
  await query(
    `UPDATE crm.contacts SET ${updates.join(', ')}, updated_at = NOW() WHERE contact_id = $${paramIdx}`,
    params
  );

  console.log(`[post-call] Updated contact ${state.contactId} with voice agent qualification data`);
}
