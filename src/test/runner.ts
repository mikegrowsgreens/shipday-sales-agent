/**
 * Session 10: End-to-End Test Runner
 * Runs each test persona through the chatbot API and validates behavior.
 * Run with: npx tsx src/test/runner.ts
 *
 * Outputs a summary report with pass/fail for each persona.
 */

import { TEST_PERSONAS, type TestPersona } from './personas';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface TurnResult {
  personaMessage: string;
  agentReply: string;
  roiPresented: boolean;
  qualification: Record<string, unknown> | null;
  latencyMs: number;
  error?: string;
}

interface PersonaResult {
  persona: TestPersona;
  turns: TurnResult[];
  passed: boolean;
  failures: string[];
  totalLatencyMs: number;
}

// ─── Run a single persona through the chatbot ───────────────────────────────

async function runPersona(persona: TestPersona): Promise<PersonaResult> {
  const turns: TurnResult[] = [];
  const failures: string[] = [];
  let history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let roiEverPresented = false;
  let lastQualification: Record<string, unknown> | null = null;

  for (const step of persona.script) {
    const start = Date.now();

    try {
      const res = await fetch(`${BASE_URL}/api/chat/prospect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: step.message,
          history,
          lead_info: {
            name: persona.name,
            email: persona.email,
            company: persona.company,
          },
          demo_mode: true,
          demo_qualification: persona.qualification,
        }),
      });

      const latencyMs = Date.now() - start;
      const data = await res.json();

      if (data.error) {
        turns.push({
          personaMessage: step.message,
          agentReply: '',
          roiPresented: false,
          qualification: null,
          latencyMs,
          error: data.error,
        });
        failures.push(`Turn ${turns.length}: API error — ${data.error}`);
        continue;
      }

      const hasROI = data.roi_chart || /\$[\d,]+/.test(data.reply || '');
      if (hasROI) roiEverPresented = true;

      if (data.qualification) lastQualification = data.qualification;

      turns.push({
        personaMessage: step.message,
        agentReply: data.reply || '',
        roiPresented: hasROI,
        qualification: data.qualification || null,
        latencyMs,
      });

      // Update history for next turn
      history.push({ role: 'user', content: step.message });
      history.push({ role: 'assistant', content: data.reply || '' });

      // Validate latency — chatbot should respond within 8 seconds
      if (latencyMs > 8000) {
        failures.push(`Turn ${turns.length}: Slow response (${latencyMs}ms > 8000ms)`);
      }

      // Validate agent didn't return empty
      if (!data.reply?.trim()) {
        failures.push(`Turn ${turns.length}: Empty agent reply`);
      }

      // Validate agent didn't say it's an AI
      if (/i('m| am) an? (ai|artificial|language model|bot|chatbot)/i.test(data.reply || '')) {
        failures.push(`Turn ${turns.length}: Agent revealed it's an AI`);
      }

    } catch (err) {
      const latencyMs = Date.now() - start;
      turns.push({
        personaMessage: step.message,
        agentReply: '',
        roiPresented: false,
        qualification: null,
        latencyMs,
        error: String(err),
      });
      failures.push(`Turn ${turns.length}: Network error — ${err}`);
    }
  }

  // Validate expected outcomes
  const expected = persona.expectedOutcome;

  if (expected.roiPresented && !roiEverPresented) {
    failures.push('Expected ROI to be presented but it was not');
  }

  return {
    persona,
    turns,
    passed: failures.length === 0,
    failures,
    totalLatencyMs: turns.reduce((sum, t) => sum + t.latencyMs, 0),
  };
}

// ─── Run all personas ───────────────────────────────────────────────────────

async function runAllPersonas(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SalesHub Session 10 — End-to-End Persona Test Run');
  console.log('═══════════════════════════════════════════════════════\n');

  const chatbotPersonas = TEST_PERSONAS.filter(p => p.channel === 'chatbot' || p.channel === 'both');
  console.log(`Running ${chatbotPersonas.length} personas through chatbot API...\n`);

  const results: PersonaResult[] = [];

  for (const persona of chatbotPersonas) {
    process.stdout.write(`  [${persona.id}] ${persona.name} (${persona.company})... `);
    const result = await runPersona(persona);
    results.push(result);

    if (result.passed) {
      console.log(`PASS (${result.totalLatencyMs}ms, ${result.turns.length} turns)`);
    } else {
      console.log(`FAIL (${result.failures.length} issues)`);
      for (const f of result.failures) {
        console.log(`    - ${f}`);
      }
    }
  }

  // ─── Summary Report ──────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTurns = results.reduce((sum, r) => sum + r.turns.length, 0);
  const avgLatency = Math.round(
    results.reduce((sum, r) => sum + r.totalLatencyMs, 0) / totalTurns
  );
  const roiCount = results.filter(r => r.turns.some(t => t.roiPresented)).length;

  console.log(`  Personas tested: ${results.length}`);
  console.log(`  Passed: ${passed}  |  Failed: ${failed}`);
  console.log(`  Total conversation turns: ${totalTurns}`);
  console.log(`  Average response latency: ${avgLatency}ms`);
  console.log(`  ROI presented: ${roiCount}/${results.length} personas`);

  if (failed > 0) {
    console.log('\n  FAILED PERSONAS:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`    - ${r.persona.id}: ${r.failures.join('; ')}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════\n');

  // Exit with non-zero if any failed
  if (failed > 0) {
    process.exit(1);
  }
}

// ─── Entrypoint ─────────────────────────────────────────────────────────────

runAllPersonas().catch(err => {
  console.error('Test runner crashed:', err);
  process.exit(1);
});
