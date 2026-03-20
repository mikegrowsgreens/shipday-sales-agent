# Session 6: Outbound Campaign Intelligence Overhaul

## Problem Statement

The current tier-based campaign system generates emails that are **contextually disconnected** and **generically pitched**. Three core failures:

1. **No email threading** -- follow-up emails don't reference what was said in previous steps. The AI gets `previous_subject` and `previous_body` during regeneration, but the initial sequence generation builds each step in isolation. A prospect getting email #3 has no sense that it's part of a conversation.

2. **Generic copy that misses the value story** -- the prebuilt angles (`missed_calls`, `commission_savings`, `delivery_ops`, `tech_consolidation`, `customer_experience`) are narrow feature pitches. They don't sell the **transformation**: Shipday as the 24/7 employee that costs less than $12/day ($0.48/hour). The copy needs to lead with business outcomes, not product features.

3. **No test send capability** -- there's no way to send a test email to a personal address to preview exactly what a prospect will see. You have to approve a real lead and hope it looks right.

---

## Current Architecture (Reference)

### Where Email Copy Gets Generated

| Layer | Location | What It Does |
|-------|----------|-------------|
| **Campaign Templates** | `bdr.campaign_templates` | Defines the sequence skeleton: step count, delays, channels, angles, tones, branch rules per tier |
| **AI Generation** | `src/lib/ai.ts` → `generateEmail()` | Claude generates subject + body using lead data, angle config, brain context |
| **Org Config** | `src/lib/org-config.ts` | Supplies angle descriptions, value props, sender persona to the AI prompt |
| **Brain Context** | `src/lib/ai.ts` → `loadEmailBrainContext()` | Pulls winning phrases, auto-learned patterns, industry snippets from DB |
| **Sequence Builder** | `src/app/api/bdr/campaigns/generate-sequence/route.ts` | Loops through template steps, calls `generateEmail()` per step, inserts into `bdr.campaign_emails` |
| **Adaptive Regen** | `src/app/api/bdr/campaigns/process-scheduled/route.ts` | On follow-up steps, regenerates based on engagement signal (no_opens, clicked, etc.) |

### The Threading Gap

In `generate-sequence/route.ts`, each step is generated independently:
```
for (const step of template.steps) {
  if (step.channel === 'email') {
    const email = await generateEmail({...step, lead});
    // No reference to previously generated steps in this batch
  }
}
```

The `previous_subject` / `previous_body` fields only get populated during **regeneration** (process-scheduled), not during initial sequence generation. So the first batch of 5 emails is built blind to itself.

### The Copy Problem

In `org-config.ts`, angles are defined like:
```
missed_calls: "Focus on how many calls go unanswered..."
commission_savings: "Calculate commission savings vs marketplace fees..."
```

These are **feature-level prompts**. The system prompt in `generateEmail()` includes value props, but they're listed as bullet points the AI cherry-picks from. There's no narrative arc across the sequence -- no storytelling framework that builds urgency step by step.

---

## Overhaul Plan

### 1. Conversational Threading (email context awareness)

**Goal**: Every email in a sequence should feel like the next beat in a conversation, not a cold start.

**Changes needed in `generate-sequence/route.ts`**:
```
// Current: each step generated independently
// New: pass accumulating context through the loop

let conversationContext = [];

for (const step of template.steps) {
  if (step.channel === 'email') {
    const email = await generateEmail({
      ...step,
      lead,
      conversationContext,  // All previous steps in this sequence
      stepPosition: {
        current: step.step_number,
        total: template.steps.length
      }
    });

    conversationContext.push({
      step: step.step_number,
      subject: email.subject,
      body: email.body,
      angle: step.angle,
      delay_days: step.delay_days
    });
  }
}
```

**Changes needed in `ai.ts` → `generateEmail()`**:
- Add `conversationContext` to the system prompt so Claude knows exactly what the prospect has already received
- Add `stepPosition` so Claude knows where in the arc this email sits
- Add explicit instructions: "This is email {N} of {total}. The prospect has received the following prior emails: [summaries]. Build on these -- reference prior points, don't repeat them, escalate the narrative."

### 2. Value Narrative Framework (kill the generic angles)

**Goal**: Replace narrow feature angles with a storytelling arc that sells the transformation.

**New angle system** -- instead of 5 static angles, define **narrative arcs** that span the full sequence:

```typescript
const NARRATIVE_ARCS = {
  '24_7_employee': {
    thesis: 'Shipday is your 24/7 delivery employee for less than $12/day ($0.48/hour)',
    arc: [
      { beat: 'pain', frame: 'The hidden cost of missed deliveries and unhappy customers' },
      { beat: 'contrast', frame: 'What if you had a delivery manager who never sleeps, never calls in sick, never quits' },
      { beat: 'proof', frame: 'Here is how {similar_business} transformed their delivery ops' },
      { beat: 'math', frame: 'The actual math: $0.48/hour vs what you are paying now' },
      { beat: 'urgency', frame: 'Every day without this is money walking out the door' }
    ]
  },
  'growth_unlock': {
    thesis: 'You are leaving delivery revenue on the table -- Shipday captures it',
    arc: [
      { beat: 'opportunity', frame: 'Your competitors are growing delivery 30% YoY. Are you?' },
      { beat: 'bottleneck', frame: 'The #1 thing holding back delivery growth for {cuisine_type} restaurants' },
      { beat: 'solution', frame: 'How Shipday removes the bottleneck without adding headcount' },
      { beat: 'roi', frame: 'The revenue you are missing: a real calculation for {business_name}' },
      { beat: 'close', frame: 'Let me show you this in 15 minutes' }
    ]
  },
  'marketplace_escape': {
    thesis: 'Stop giving 30% to DoorDash -- own your delivery channel',
    arc: [
      { beat: 'wake_up', frame: 'How much did you pay in marketplace commissions last month?' },
      { beat: 'alternative', frame: 'Restaurants like yours are building direct delivery and keeping the margin' },
      { beat: 'how', frame: 'The exact playbook: from marketplace-dependent to owning your delivery' },
      { beat: 'economics', frame: '$12/day vs 30% of every order -- the math is not close' },
      { beat: 'action', frame: 'Start keeping your margins this week' }
    ]
  }
};
```

**Changes needed**:
- Update `org-config.ts` to store narrative arcs instead of (or alongside) flat angle descriptions
- Update `generateEmail()` prompt to receive the full arc + current beat position
- Update `TierCampaignEditor.tsx` to let users pick narrative arcs and customize beats per tier
- Update `bdr.campaign_templates.steps` schema to include `narrative_arc` and `beat` fields

### 3. Tier-Specific Intelligence

**Goal**: Tiers shouldn't just change priority -- they should change the entire approach.

| Tier | Current Behavior | New Behavior |
|------|-----------------|-------------|
| **Tier 1** (hot) | Same copy, just sent first | Hyper-personalized, reference specific business data (ratings, cuisine, location), shorter sequences (3 steps), direct CTA, include the $0.48/hr math customized to their likely order volume |
| **Tier 2** (warm) | Same copy, sent second | Education-focused, longer sequences (5 steps), build the case gradually, include social proof from similar businesses in their area/cuisine |
| **Tier 3** (cold) | Same copy, sent last | Volume-optimized, shorter copy, pattern-interrupt subject lines, focus on curiosity not detail, 4-step sequences with faster escalation to call/LinkedIn |

**Changes needed**:
- Add tier-specific prompt modifiers in `generateEmail()`
- Add tier-specific copy length targets (Tier 1: 2-3 sentences, Tier 3: 1-2 sentences)
- Add tier-specific subject line strategies

### 4. Test Send to Personal Email

**Goal**: Preview exactly what a prospect sees by sending a test to any email address.

**New API endpoint**: `POST /api/bdr/campaigns/test-send`

```typescript
// Request
{
  email_id?: number,        // Existing campaign_email ID to send
  template_id?: number,     // OR generate fresh from template
  step_number?: number,     // Which step to test (default: 1)
  lead_id?: number,         // Lead to use as sample data
  to_email: string,         // Where to send the test (personal email)
  narrative_arc?: string,   // Optional override
  beat?: string,            // Optional override
  send_mode: 'new' | 'reply' | 'thread',  // How to send
  thread_message_id?: string // Gmail Message-ID to reply to (for reply/thread modes)
}

// Response
{
  success: true,
  sent_to: "mike@personalemail.com",
  subject: "...",
  body: "...",
  preview_text: "...",       // First 100 chars as it appears in inbox
  message_id: "...",         // Gmail Message-ID (use to chain subsequent test steps)
  thread_id: "..."           // Gmail Thread ID
}
```

**Send modes**:
- **`new`** (default): Fresh email, new thread. Use for testing step 1 in isolation.
- **`reply`**: Sends as a reply to `thread_message_id`. Gmail shows it as a reply with `>` quoted text. Use for testing how step 2+ looks when a prospect sees it as a reply in their inbox.
- **`thread`**: Sends in the same thread (same `References` / `In-Reply-To` headers) but WITHOUT quoting the previous email body. Appears grouped in Gmail/Outlook but reads as a standalone message. This is the mode real campaigns should use -- follow-ups land in the same conversation without the clutter of quoted text.

**Thread chaining for full sequence preview**:
```
1. Send step 1 as 'new'         → get back message_id: "abc123"
2. Send step 2 as 'thread',     thread_message_id: "abc123" → get back message_id: "def456"
3. Send step 3 as 'thread',     thread_message_id: "def456" → get back message_id: "ghi789"
// Now your personal inbox has the full 3-step sequence in one Gmail thread
```

**Implementation**:
- If `email_id` provided: fetch existing `bdr.campaign_emails` row, send as-is
- If `template_id` provided: generate fresh using `generateEmail()` with the sample lead's data
- Send via the same n8n webhook used for real sends, but with a `[TEST]` prefix on subject
- Pass `send_mode` + `thread_message_id` to the n8n webhook so it sets the correct Gmail headers:
  - `new`: no threading headers
  - `reply`: set `In-Reply-To` and `References` to `thread_message_id`, prefix subject with `Re: `
  - `thread`: set `In-Reply-To` and `References` to `thread_message_id`, keep original subject (no `Re: `)
- Return `message_id` and `thread_id` from Gmail API response so subsequent test sends can chain
- Do NOT create `bdr.email_sends` tracking record (or mark as `is_test: true`)
- Do NOT update lead status or touchpoints

**This also applies to real campaign sends** -- update `process-scheduled/route.ts`:
- Store `message_id` on `bdr.campaign_emails` after each send
- When sending step 2+, look up the previous step's `message_id` and send in the same thread
- Default to `thread` mode (grouped conversation, no quoted text) for production sends
- Add `threading_mode` column to `bdr.campaign_templates` so it's configurable per template

**UI addition in `TierCampaignEditor.tsx`**:
- "Send Test" button on each step in the template editor
- Email input field (default to user's email from session)
- Option to pick a sample lead for personalization
- Send mode toggle: "New Thread" / "Reply" / "Same Thread"
- "Send Full Sequence" button that chains all steps into one thread automatically
- Shows send confirmation with subject/body preview and thread status

### 5. Smart Defaults & Guardrails

**Copy length enforcement**:
- Subject lines: 6-10 words max, no emojis, no ALL CAPS
- Body: 3-5 sentences max (enforce in prompt + post-generation validation)
- No em dashes (already enforced via sanitization, but add to prompt)
- No "I hope this email finds you well" or similar filler

**Post-generation validation** (add to `generateEmail()` return):
```typescript
function validateEmailCopy(subject: string, body: string): ValidationResult {
  const issues = [];
  if (subject.split(' ').length > 10) issues.push('subject_too_long');
  if (body.split('. ').length > 6) issues.push('body_too_long');
  if (/\u2014/.test(body)) issues.push('contains_em_dash');
  if (/hope this email|just wanted to|circling back/i.test(body))
    issues.push('generic_filler');
  if (!/\$0\.48|\$12|24\/7|less than/i.test(body) && !body.includes('Shipday'))
    issues.push('missing_value_anchor');
  return { valid: issues.length === 0, issues };
}
```

---

## File Change Map

| File | Changes |
|------|---------|
| `src/lib/ai.ts` | Add `conversationContext` param to `generateEmail()`, update system prompt with narrative arc framework, add tier-specific prompt modifiers, add `validateEmailCopy()` |
| `src/lib/org-config.ts` | Add `NARRATIVE_ARCS` definitions, update angle config structure |
| `src/app/api/bdr/campaigns/generate-sequence/route.ts` | Pass accumulating context through step loop, include step position |
| `src/app/api/bdr/campaigns/process-scheduled/route.ts` | Update adaptive regen to use narrative arc context, add thread chaining (lookup previous step's `message_id`, send in same thread) |
| `src/app/api/bdr/campaigns/test-send/route.ts` | **NEW** -- test send endpoint with `new` / `reply` / `thread` modes and chain support |
| `src/app/api/bdr/campaign-templates/route.ts` | Update template schema for narrative arcs |
| `src/app/api/bdr/campaign-templates/test/route.ts` | Update to use new generation params |
| `src/components/outbound/TierCampaignEditor.tsx` | Add narrative arc picker, test send UI, beat customization |
| `src/components/outbound/TestSendModal.tsx` | **NEW** -- modal for test send flow |

---

## Database Changes

```sql
-- Add narrative arc fields to campaign templates
ALTER TABLE bdr.campaign_templates
  ADD COLUMN narrative_arc TEXT DEFAULT '24_7_employee',
  ADD COLUMN arc_config JSONB DEFAULT '{}',
  ADD COLUMN threading_mode TEXT DEFAULT 'thread' CHECK (threading_mode IN ('new', 'reply', 'thread'));

-- Update steps JSON schema to include beat reference
-- Each step: { ..., beat: 'pain' | 'contrast' | 'proof' | 'math' | 'urgency', ... }

-- Add Gmail message/thread IDs for thread chaining
ALTER TABLE bdr.campaign_emails
  ADD COLUMN gmail_message_id TEXT,
  ADD COLUMN gmail_thread_id TEXT;

-- Add test send tracking
ALTER TABLE bdr.email_sends
  ADD COLUMN is_test BOOLEAN DEFAULT FALSE;
```

---

### 6. Bulk Campaign Generation by Type/Tier/Cuisine

**Problem**: Currently `generate-sequence` requires explicit `lead_ids[]`. The UI only shows "Generate All" for `enriched`/`scored` status leads. There's no way to say "generate campaigns for all Tier 1 pizza restaurants" or "send to all enriched leads in Texas" without manually filtering and selecting.

**New API endpoint**: `POST /api/bdr/campaigns/generate-bulk`

```typescript
// Request -- generate by filter criteria instead of explicit IDs
{
  filters: {
    tiers?: ('tier_1' | 'tier_2' | 'tier_3')[],
    statuses?: ('enriched' | 'scored')[],     // Only allow pre-campaign statuses
    cuisine_types?: string[],                  // e.g. ['pizza', 'sushi', 'indian']
    states?: string[],                         // e.g. ['CA', 'TX', 'NY']
    cities?: string[],
    min_score?: number,                        // total_score >= X
    max_score?: number,
    has_email?: boolean,                       // Only leads with contact_email
    exclude_previously_contacted?: boolean     // Default true
  },
  template_id?: number,        // Specific template, or auto-select by tier
  narrative_arc?: string,      // Override arc for all
  dry_run?: boolean            // Preview count + sample leads without generating
}

// Response (dry_run: true)
{
  dry_run: true,
  total_matching: 847,
  by_tier: { tier_1: 112, tier_2: 340, tier_3: 395 },
  by_cuisine: { pizza: 203, mexican: 187, chinese: 142, ... },
  sample_leads: [ ... first 5 leads that would be generated ... ]
}

// Response (dry_run: false)
{
  generated: 847,
  skipped_no_email: 23,
  skipped_previously_contacted: 91,
  by_tier: { tier_1: 112, tier_2: 340, tier_3: 395 },
  batch_id: "batch_abc123"     // For tracking this bulk run
}
```

**UI additions**:
- New "Bulk Generate" panel in Outbound tab with filter dropdowns for tier, cuisine, state, score range
- "Preview" button runs `dry_run: true` so you see exactly how many leads match before committing
- "Generate" button kicks off the batch
- Progress indicator for large batches (process in chunks of 50)

**Changes needed**:
- `src/app/api/bdr/campaigns/generate-bulk/route.ts` -- **NEW** endpoint
- `src/components/outbound/BulkGeneratePanel.tsx` -- **NEW** UI component
- Update `generate-sequence/route.ts` to accept a `batch_id` for grouping
- Add `batch_id` column to `bdr.campaign_emails` for tracking bulk runs

---

## Build Order

1. **Test Send endpoint + UI** (quick win, unblocks testing everything else)
2. **Conversational threading** in sequence generation (fixes the disconnected follow-ups)
3. **Narrative arc framework** in org-config + ai.ts (fixes generic copy)
4. **Tier-specific intelligence** (makes tiers meaningful)
5. **Bulk generate by type/tier/cuisine** (unlocks targeted campaigns at scale)
6. **Copy validation guardrails** (prevents regression)
7. **Template editor updates** (UI for managing arcs and beats)

---

## File Change Map (updated)

| File | Changes |
|------|---------|
| `src/lib/ai.ts` | Add `conversationContext` param to `generateEmail()`, update system prompt with narrative arc framework, add tier-specific prompt modifiers, add `validateEmailCopy()` |
| `src/lib/org-config.ts` | Add `NARRATIVE_ARCS` definitions, update angle config structure |
| `src/app/api/bdr/campaigns/generate-sequence/route.ts` | Pass accumulating context through step loop, include step position, accept `batch_id` |
| `src/app/api/bdr/campaigns/generate-bulk/route.ts` | **NEW** -- bulk generation by filter criteria with dry-run support |
| `src/app/api/bdr/campaigns/process-scheduled/route.ts` | Update adaptive regen to use narrative arc context, add thread chaining (lookup previous step's `message_id`, send in same thread) |
| `src/app/api/bdr/campaigns/test-send/route.ts` | **NEW** -- test send endpoint with `new` / `reply` / `thread` modes and chain support |
| `src/app/api/bdr/campaign-templates/route.ts` | Update template schema for narrative arcs |
| `src/app/api/bdr/campaign-templates/test/route.ts` | Update to use new generation params |
| `src/components/outbound/TierCampaignEditor.tsx` | Add narrative arc picker, test send UI, beat customization |
| `src/components/outbound/TestSendModal.tsx` | **NEW** -- modal for test send flow |
| `src/components/outbound/BulkGeneratePanel.tsx` | **NEW** -- filter-based bulk generation UI with preview |

---

## Database Changes

```sql
-- Add narrative arc fields to campaign templates
ALTER TABLE bdr.campaign_templates
  ADD COLUMN narrative_arc TEXT DEFAULT '24_7_employee',
  ADD COLUMN arc_config JSONB DEFAULT '{}',
  ADD COLUMN threading_mode TEXT DEFAULT 'thread' CHECK (threading_mode IN ('new', 'reply', 'thread'));

-- Update steps JSON schema to include beat reference
-- Each step: { ..., beat: 'pain' | 'contrast' | 'proof' | 'math' | 'urgency', ... }

-- Add Gmail message/thread IDs for thread chaining
ALTER TABLE bdr.campaign_emails
  ADD COLUMN gmail_message_id TEXT,
  ADD COLUMN gmail_thread_id TEXT,
  ADD COLUMN batch_id TEXT;

-- Add test send tracking
ALTER TABLE bdr.email_sends
  ADD COLUMN is_test BOOLEAN DEFAULT FALSE;

-- Index for bulk batch tracking
CREATE INDEX idx_campaign_emails_batch ON bdr.campaign_emails(batch_id) WHERE batch_id IS NOT NULL;
```

---

## Success Criteria

- [ ] Test send works -- can send any campaign step to personal email and see exactly what prospect sees
- [ ] "Send Full Sequence" chains all steps into one Gmail thread so you can preview the entire conversation
- [ ] Real campaign sends thread follow-ups into the same Gmail conversation (no orphaned emails)
- [ ] Threading mode is configurable per template (new thread / reply / same thread)
- [ ] Email #3 in a sequence references themes from emails #1 and #2 naturally
- [ ] Every email includes at least one Shipday value anchor ($0.48/hr, 24/7 employee, $12/day)
- [ ] Tier 1 emails feel hyper-personalized with business-specific data
- [ ] Tier 3 emails are short, punchy, curiosity-driven
- [ ] No em dashes, no generic filler phrases, no subject lines over 10 words
- [ ] Copy validation catches violations before emails enter the queue
- [ ] Narrative arcs are configurable per tier in the template editor
- [ ] Can bulk-generate campaigns by tier + cuisine + state + score range
- [ ] Dry-run preview shows exact lead count and breakdown before committing
- [ ] Bulk runs are tracked by batch_id for monitoring and rollback
