# Outbound > Tier Redesign — Sessions Breakdown

## Problem Statement

The current outbound email generation system produces disconnected, context-free emails. Each step generates independently without awareness of prior steps, brain knowledge, ROI data, or Fathom call intelligence. Campaign setup requires too much manual work, there are no pre-built A/B campaigns for auto-assignment, and the voice doesn't feel human (em dashes, generic phrasing).

## Current Architecture (What's Broken)

```
Lead → generateEmail() → Claude API → raw email text
                ↑
        brainContext (INCOMPLETE):
          - phrase_stats (win rate > 15%)
          - brain.auto_learned (confidence >= 0.7)
          - brain.industry_snippets (cuisine-matched)

        MISSING from brainContext:
          - brain.internal_content (20 entries: value props, objections, pricing, case studies, call intel)
          - shipday.newsletter_insights (industry talking points)
          - roi.ts computeROI() / formatROIForChat()
          - Fathom transcript knowledge
          - Prior step content (each step generates blind)
```

## Target Architecture

```
Lead → enriched context builder → generateEmail() → em dash filter → final email
                ↑
        FULL brainContext:
          - phrase_stats + auto_learned + industry_snippets (existing)
          - brain.internal_content (value props, objections, pricing, case studies)
          - shipday.newsletter_insights (relevant industry talking points)
          - ROI projection (computeROI for lead's order volume/drivers)
          - Fathom call summaries (if lead has prior calls)
          - Prior step content + angle tracking (sequence continuity)
          - Org config product knowledge + angles

        Pre-built campaigns:
          - Tier 1/2/3 A/B templates ready for auto-assignment
          - Each template = full multi-step sequence with angle progression
          - Auto-assigned on lead enrichment based on tier + business context
```

---

## Session 1: Brain Context Expansion + Em Dash Fix

**Goal:** Every generated email draws from the full knowledge base, not just 3 tables. Strip em dashes from all output.

### Files to Modify

| File | Changes |
|---|---|
| `src/lib/ai.ts` | Expand `loadEmailBrainContext()` to query `brain.internal_content` and `shipday.newsletter_insights` |
| `src/lib/ai.ts` | Add `loadROIContext(lead)` helper that calls `computeROI()` with lead's business data |
| `src/lib/ai.ts` | Add em dash replacement in `generateEmail()` return — replace `—` with ` - ` or rewrite |
| `src/lib/ai.ts` | Update system prompt in `generateEmail()` to explicitly ban em dashes and enforce conversational tone |
| `src/lib/roi.ts` | No changes needed — `computeROI()` and `formatROIForChat()` already exist |

### Implementation Details

**1a. Expand `loadEmailBrainContext()`** (ai.ts ~line 100-150)

Current function queries 3 tables. Add:

```sql
-- Pull value props, objections, pricing, case studies, call intelligence
SELECT content_type, title, body, metadata
FROM brain.internal_content
WHERE org_id = $1
ORDER BY updated_at DESC

-- Pull relevant newsletter insights
SELECT insight_text, tags, source_sender, source_date
FROM shipday.newsletter_insights
WHERE relevance_score >= 60
ORDER BY source_date DESC
LIMIT 10
```

Format these into the brainContext string under clear section headers:
- `## Product Knowledge` (from internal_content where content_type = 'value_prop' or 'product_feature')
- `## Objection Handling` (content_type = 'objection_response')
- `## Case Studies` (content_type = 'case_study')
- `## Pricing Intelligence` (content_type = 'pricing')
- `## Call Intelligence` (content_type = 'call_insight')
- `## Industry Trends` (from newsletter_insights)

**1b. Add ROI context injection**

In `generateEmail()`, before calling Claude:

```typescript
// If lead has order volume or driver count, compute ROI projection
if (lead.estimated_orders || lead.driver_count) {
  const roiInput = {
    monthlyOrders: lead.estimated_orders || 500,
    avgOrderValue: lead.avg_order_value || 35,
    currentDrivers: lead.driver_count || 5,
    milesPerDelivery: 4,
  };
  const roi = computeROI(roiInput, defaultPricing);
  const roiSummary = formatROIForChat(roi, roiInput, orgConfig);
  // Append to brain context
  brainContext += `\n\n## ROI Projection for This Lead\n${roiSummary}`;
}
```

**1c. Em dash stripping**

Add post-processing in `generateEmail()` return:

```typescript
const cleanedEmail = generatedEmail
  .replace(/—/g, ' - ')
  .replace(/–/g, '-');
return cleanedEmail;
```

Also add to the system prompt:
```
WRITING RULES:
- Never use em dashes (—) or en dashes (–). Use hyphens or rewrite the sentence.
- Write like a human sales rep, not a marketing bot.
- Use short sentences. Be direct. Sound like you're texting a colleague, not writing a brochure.
```

### Verification
- Generate a test email for a Tier 1 lead and confirm:
  - Email references specific value props from `brain.internal_content`
  - Email includes relevant ROI numbers
  - No em dashes in output
  - Tone feels conversational

### Estimated Scope
- ~150 lines of code changes in `ai.ts`
- No new files needed
- No database schema changes

---

## Session 2: Sequence Context Continuity

**Goal:** Each step in a campaign sequence knows what the previous steps said. Fathom call knowledge is threaded through.

### Files to Modify

| File | Changes |
|---|---|
| `src/app/api/bdr/campaigns/generate-sequence/route.ts` | Pass prior step content to subsequent step generation |
| `src/lib/ai.ts` | Update `generateEmail()` to accept `priorSteps` parameter |
| `src/lib/ai.ts` | Add `loadFathomContext(lead)` to pull call summaries if available |

### Implementation Details

**2a. Prior step threading** (generate-sequence/route.ts)

Current code generates each step independently:
```typescript
for (const step of template.steps) {
  const email = await generateEmail(lead, step, brainContext, orgConfig);
  // stores email, moves to next step
}
```

Change to accumulate prior step content:
```typescript
const priorSteps: { step_number: number; angle: string; subject: string; body: string }[] = [];

for (const step of template.steps) {
  const email = await generateEmail(lead, step, brainContext, orgConfig, priorSteps);
  priorSteps.push({
    step_number: step.step_number,
    angle: step.angle,
    subject: email.subject,
    body: email.body,
  });
  // store email...
}
```

**2b. Update `generateEmail()` signature and prompt**

Add to the system prompt when `priorSteps.length > 0`:
```
## Prior Emails in This Sequence
You are writing step ${step_number} of a ${total_steps}-step sequence.
Here is what was sent in prior steps — DO NOT repeat the same points.
Build on what was said. Reference it naturally if appropriate.
Progress the conversation forward.

${priorSteps.map(s => `### Step ${s.step_number} (angle: ${s.angle})\nSubject: ${s.subject}\n${s.body}`).join('\n\n')}
```

**2c. Fathom call context**

If the lead has prior calls logged (check `crm.activities` or a calls table):
```sql
SELECT summary, key_points, sentiment, call_date
FROM crm.activities
WHERE contact_id = $1 AND activity_type = 'call'
ORDER BY created_at DESC
LIMIT 3
```

Inject into brain context as:
```
## Prior Call Intelligence
- Call on {date}: {summary}. Key points: {key_points}. Sentiment: {sentiment}
```

This lets the email reference actual conversation history.

### Verification
- Generate a 5-step sequence for a single lead
- Confirm step 2 references step 1's angle without repeating it
- Confirm step 3 builds on both prior steps
- Confirm no duplicate talking points across steps
- If lead has call history, confirm emails reference call topics

### Estimated Scope
- ~80 lines in generate-sequence route
- ~40 lines in ai.ts (prompt updates + Fathom query)

---

## Session 3: Pre-Built A/B Campaign Library

**Goal:** Create ready-to-use tier-specific campaign templates with A/B variants that can be auto-assigned to enriched leads.

### Files to Create/Modify

| File | Changes |
|---|---|
| `src/lib/campaign-library.ts` | NEW — Pre-built campaign definitions for all tiers |
| `src/app/api/bdr/campaign-library/route.ts` | NEW — CRUD API for campaign library |
| `src/app/api/bdr/campaign-library/assign/route.ts` | NEW — Auto-assign campaigns to leads by tier |
| `src/app/api/bdr/campaign-templates/route.ts` | Update to seed from library on first load |
| Database | Seed `bdr.campaign_templates` with pre-built campaigns |

### Implementation Details

**3a. Campaign library definitions** (campaign-library.ts)

Define 2 A/B variants per tier, each with 5-step sequences:

```typescript
export const CAMPAIGN_LIBRARY = {
  tier_1: {
    name: 'Enterprise / High-Volume',
    variants: {
      A: {
        name: 'ROI-Led',
        description: 'Lead with cost savings, progress to case studies, close with custom demo',
        steps: [
          { step: 1, delay_days: 0, angle: 'roi_savings', tone: 'consultative', channel: 'email',
            instructions: 'Lead with their specific ROI projection. Reference their order volume. Ask about current delivery cost per order.' },
          { step: 2, delay_days: 3, angle: 'case_study', tone: 'peer_proof', channel: 'email',
            instructions: 'Share a case study from a similar-sized operation. Reference the ROI numbers from step 1.' },
          { step: 3, delay_days: 5, angle: 'pain_point', tone: 'empathetic', channel: 'email',
            instructions: 'Address the #1 pain point for their business type. Use call intelligence if available.' },
          { step: 4, delay_days: 4, angle: 'product_demo', tone: 'direct', channel: 'email',
            instructions: 'Offer a personalized demo. Reference specific features relevant to their operation.' },
          { step: 5, delay_days: 7, angle: 'final_value', tone: 'casual', channel: 'email',
            instructions: 'Casual check-in. Summarize the full value proposition. Make it easy to say yes.' },
        ],
      },
      B: {
        name: 'Pain-Point-Led',
        description: 'Lead with their biggest operational pain, progress to solution, close with ROI',
        steps: [
          { step: 1, delay_days: 0, angle: 'pain_point', tone: 'empathetic', ... },
          { step: 2, delay_days: 3, angle: 'solution_fit', tone: 'consultative', ... },
          { step: 3, delay_days: 5, angle: 'social_proof', tone: 'peer_proof', ... },
          { step: 4, delay_days: 4, angle: 'roi_savings', tone: 'direct', ... },
          { step: 5, delay_days: 7, angle: 'final_value', tone: 'casual', ... },
        ],
      },
    },
  },
  tier_2: {
    name: 'Mid-Market / Growth',
    variants: {
      A: { name: 'Growth-Led', ... },
      B: { name: 'Efficiency-Led', ... },
    },
  },
  tier_3: {
    name: 'SMB / New to Delivery',
    variants: {
      A: { name: 'Simplicity-Led', ... },
      B: { name: 'Competitor-Switch', ... },
    },
  },
};
```

**3b. Auto-assignment API** (campaign-library/assign/route.ts)

```typescript
// POST /api/bdr/campaign-library/assign
// Body: { lead_ids: number[], tier?: string, variant?: 'A' | 'B' }
// If no variant specified, randomly assign A or B (50/50 split)
// Creates campaign_templates entries and generates sequences for each lead
```

**3c. Database seeding**

Insert the pre-built campaigns into `bdr.campaign_templates` with:
- `is_library_template: true` flag (new column)
- `variant: 'A' | 'B'` (new column)
- `auto_assignable: true` flag (new column)

```sql
ALTER TABLE bdr.campaign_templates
  ADD COLUMN IF NOT EXISTS is_library_template BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant VARCHAR(10),
  ADD COLUMN IF NOT EXISTS auto_assignable BOOLEAN DEFAULT false;
```

### Verification
- Confirm 6 pre-built templates exist (2 per tier)
- Auto-assign 3 leads to Tier 1 campaigns, verify 50/50 A/B split
- Verify generated sequences use the correct angle progression
- Verify the brain context from Session 1 flows through

### Estimated Scope
- ~300 lines in campaign-library.ts
- ~150 lines in API routes
- ~20 lines DB migration

---

## Session 4: Campaign Management UX

**Goal:** Reduce manual work. Add campaign library browser, one-click assignment, archive/clone, and bulk operations.

### Files to Create/Modify

| File | Changes |
|---|---|
| `src/components/outbound/CampaignLibrary.tsx` | NEW — Browse/preview/assign pre-built campaigns |
| `src/components/outbound/CampaignManager.tsx` | NEW — Active campaign list with archive/clone/edit |
| `src/components/outbound/TierCampaignEditor.tsx` | Add clone, archive buttons; show A/B variant badge |
| `src/app/outbound/page.tsx` | Add CampaignLibrary tab alongside existing views |
| `src/app/api/bdr/campaigns/[id]/route.ts` | Add PATCH (archive) and POST (clone) endpoints |

### Implementation Details

**4a. Campaign Library Browser** (CampaignLibrary.tsx)

- Grid of pre-built campaign cards grouped by tier
- Each card shows: campaign name, A/B variant, step count, angle progression preview
- "Preview" expands to show all steps with angle/tone/instructions
- "Assign to Leads" button opens lead selector filtered by matching tier
- Bulk assign: select multiple leads → assign to campaign → generates sequences

**4b. Campaign Manager** (CampaignManager.tsx)

- Table of active campaigns with columns: campaign name, tier, variant, lead count, status, created
- Actions: Archive (soft delete), Clone (duplicate with new name), Edit (opens TierCampaignEditor)
- Filter by: tier, status (active/archived), variant (A/B)
- Bulk actions: archive selected, regenerate selected

**4c. Simplified flow**

Current flow (too many steps):
```
Navigate to Outbound → Select tier → Manually configure steps → Add leads → Generate
```

New flow:
```
Navigate to Outbound → Campaign Library tab → Pick a pre-built campaign → Select leads → One click generate
```

### Verification
- Browse campaign library, preview a Tier 2 campaign
- Assign 2 leads to Tier 2 Variant A with one click
- Clone an existing campaign, edit the clone
- Archive a campaign, verify it's hidden from active list

### Estimated Scope
- ~400 lines across new components
- ~100 lines API updates

---

## Session 5: Voice & Tone Refinement

**Goal:** Generated emails sound like a real human sales rep. No robotic patterns, no marketing speak, no em dashes.

### Files to Modify

| File | Changes |
|---|---|
| `src/lib/ai.ts` | Major system prompt rewrite for `generateEmail()` |
| `src/lib/ai.ts` | Add tone calibration based on tier and step number |
| `src/lib/ai.ts` | Add output validation/rewriting pass |
| `src/app/api/bdr/campaigns/generate-sequence/route.ts` | Add quality gate before storing |

### Implementation Details

**5a. System prompt overhaul**

Replace the current email generation prompt with voice-specific rules:

```
You are writing as Mike, a sales rep at Shipday. You write like you talk.

VOICE RULES (non-negotiable):
1. Never use em dashes (—) or en dashes (–). Ever.
2. Never start an email with "I hope this finds you well" or any cliche opener.
3. Never use "leverage", "synergy", "streamline", "cutting-edge", "game-changer", or any marketing buzzwords.
4. Write at an 8th grade reading level. Short sentences. Simple words.
5. One idea per paragraph. Max 3 short paragraphs per email.
6. Sound like you're writing a quick note to someone you've met, not a cold pitch.
7. Use contractions (you're, we've, it's). Never write "do not" when "don't" works.
8. Ask exactly one question per email. Make it specific and easy to answer.
9. Subject lines: lowercase, 3-6 words, no punctuation. Like a text message subject.
10. No exclamation marks. Calm confidence, not hype.

TIER-SPECIFIC TONE:
- Tier 1 (Enterprise): Respectful of their time. Lead with data. Be concise.
- Tier 2 (Mid-Market): Peer-to-peer. Share relevant wins. Be helpful.
- Tier 3 (SMB): Friendly and simple. Focus on ease of use. Be encouraging.

STEP-SPECIFIC ENERGY:
- Step 1: Introduce yourself + one sharp insight. 2-3 sentences max.
- Step 2: Share proof (case study or data point). Connect to their situation.
- Step 3: Address an objection before they raise it.
- Step 4: Make a specific, easy ask (15-min call, quick demo).
- Step 5: Casual, brief. "Figured I'd check in one more time."
```

**5b. Output quality gate**

After generation, run a validation pass:
```typescript
function validateEmailTone(email: string): { pass: boolean; issues: string[] } {
  const issues: string[] = [];
  if (email.includes('—')) issues.push('em_dash');
  if (email.includes('–')) issues.push('en_dash');
  if (/I hope this (finds|reaches) you/.test(email)) issues.push('cliche_opener');
  if (/leverage|synergy|streamline|cutting-edge|game-changer/i.test(email)) issues.push('buzzword');
  if ((email.match(/!/g) || []).length > 0) issues.push('exclamation');
  if (email.split('\n\n').filter(p => p.trim()).length > 4) issues.push('too_long');
  return { pass: issues.length === 0, issues };
}
```

If validation fails, regenerate with explicit corrections. Max 1 retry.

**5c. A/B tone testing**

Variant A and Variant B can also differ in tone approach:
- Variant A: More data-driven, numbers-forward
- Variant B: More story-driven, relationship-forward

Track which tone drives more replies via the existing brain learning loop.

### Verification
- Generate 10 emails across all tiers
- Zero em dashes in any output
- No buzzwords or cliche openers
- Each email reads like it was written by a person in under 60 seconds
- Subject lines are lowercase and brief

### Estimated Scope
- ~200 lines prompt rewrite
- ~50 lines validation function
- No new files needed

---

## Session Dependency Graph

```
Session 1 (Brain + Em Dash)
    ↓
Session 2 (Sequence Continuity)  ← depends on Session 1's expanded context
    ↓
Session 3 (Campaign Library)     ← depends on Session 2's generation flow
    ↓
Session 4 (Campaign UX)          ← depends on Session 3's data model

Session 5 (Voice/Tone)           ← can run after Session 1, parallel to 3/4
```

**Recommended order:** 1 → 2 → 5 → 3 → 4

Session 5 (voice) should run before Session 3 (campaign library) so the pre-built campaigns generate with the refined voice from the start.

---

## Key Files Reference

| File | Purpose |
|---|---|
| `src/lib/ai.ts` | Core email generation + brain context loading (Sessions 1, 2, 5) |
| `src/lib/roi.ts` | ROI calculator — already built, needs integration (Session 1) |
| `src/lib/org-config.ts` | Org config with product knowledge + angles |
| `src/app/api/bdr/campaigns/generate-sequence/route.ts` | Campaign sequence generator (Sessions 2, 3) |
| `src/app/api/bdr/campaign-templates/route.ts` | Template CRUD (Session 3) |
| `src/components/outbound/TierCampaignEditor.tsx` | Template editor UI (Session 4) |
| `src/lib/tenant.ts` | Multi-tenant auth (all API routes) |
| `src/lib/db.ts` | Database query helper (wincall_brain pool) |

## Infrastructure

- **Local codebase:** `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/`
- **Server:** root@167.172.119.28
- **PM2 process:** saleshub (id 9, port 3005)
- **Caddy:** saleshub.mikegrowsgreens.com → localhost:3005
- **Database:** wincall_brain (brain.*, shipday.*, crm.*, bdr.* schemas)
- **Claude model:** claude-sonnet-4-5-20250929
- **Login:** mike@mikegrowsgreens.com / [REDACTED]
