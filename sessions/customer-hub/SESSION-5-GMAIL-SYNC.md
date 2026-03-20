# Session 5: Gmail Email History Sync

## Goal
Build the Gmail email scraping pipeline that pulls conversation history for each customer and displays it in the customer detail page.

---

## Context

**Project:** SalesHub — `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/`
**Prereqs:** Sessions 1-4 complete (customers exist in DB, detail page has Emails tab placeholder)
**n8n:** `https://automation.mikegrowsgreens.com` — existing automation platform
**Existing Gmail pattern:** n8n polls Gmail → webhooks to SalesHub API endpoints
**Relevant existing webhooks:** `POST /api/track/replies`, `POST /api/track/sent`

---

## Architecture

### Option A: n8n Workflow (Recommended — matches existing pattern)

```
[Schedule Trigger: Daily 6am] OR [Manual Trigger]
  → [Get Customer Emails from SalesHub API]
  → [Loop: For each customer email address]
    → [Gmail Node: Search messages from/to customer email]
    → [Loop: For each message]
      → [Gmail Node: Get message details]
      → [HTTP Request: POST /api/customers/emails/sync]
```

### Option B: Direct Gmail API from SalesHub

Would require Google OAuth setup which doesn't exist yet. Use Option A.

---

## What to Build

### 1. API Endpoint: `POST /api/customers/emails/sync`

File: `src/app/api/customers/emails/sync/route.ts`

Accepts payload from n8n:
```typescript
interface EmailSyncPayload {
  customer_email: string;       // match to customer by email
  messages: {
    gmail_message_id: string;
    gmail_thread_id: string;
    from: string;
    to: string;
    subject: string;
    snippet: string;            // Gmail snippet (~200 chars)
    body_preview?: string;      // first ~1000 chars of body
    date: string;               // ISO timestamp
    labels: string[];           // Gmail labels
    has_attachment: boolean;
  }[];
}
```

Logic:
1. Look up customer by email (WHERE email = $1 AND org_id = $2)
2. For each message, upsert into `crm.customer_emails` (ON CONFLICT gmail_message_id)
3. Determine direction: if `from` matches customer_email → 'inbound', else → 'outbound'
4. Update customer record: last_email_date, last_email_subject, total_emails
5. Return: synced count, skipped count (already existed)

Auth: Use webhook key header (`x-webhook-key`) matching `N8N_WEBHOOK_KEY` env var — same pattern as existing track endpoints.

### 2. API Endpoint: `GET /api/customers/[id]/emails`

File: `src/app/api/customers/[id]/emails/route.ts`

Returns email history for a specific customer:
- Query params: `?limit=50&offset=0&thread_id=xxx`
- Returns emails ordered by date DESC
- Groups by gmail_thread_id for thread view
- Includes thread summary (subject, message count, latest date)

Response:
```typescript
{
  emails: CustomerEmail[];
  threads: {
    thread_id: string;
    subject: string;
    message_count: number;
    latest_date: string;
    participants: string[];
  }[];
  total: number;
}
```

### 3. API Endpoint: `POST /api/customers/emails/sync-all`

Triggers a full sync — returns list of all customer emails for n8n to process:
```typescript
{
  customers: { id: number; email: string; business_name: string; last_sync?: string }[];
}
```

n8n calls this first to get the list, then processes each customer.

### 4. Email History UI Component

Update: `src/components/customers/tabs/EmailsTab.tsx`

Replace placeholder with functional email display:

```
┌──────────────────────────────────────────────────┐
│  Email History                    [Sync Now] 📧  │
├──────────────────────────────────────────────────┤
│  Thread View │ All Messages                      │
├──────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────┐  │
│  │ 📤 Re: Delivery Route Setup               │  │
│  │ Mar 10, 2026 · 3 messages                  │  │
│  │ Latest: "Thanks for setting that up..."    │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ 📥 Question about Premium Plus features    │  │
│  │ Mar 5, 2026 · 2 messages                   │  │
│  │ Latest: "Can you tell me about..."         │  │
│  └────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────┐  │
│  │ 📤 Welcome to Shipday!                     │  │
│  │ Feb 28, 2026 · 1 message                   │  │
│  │ "Hi Roman, welcome aboard..."              │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

Thread view (default):
- Group emails by thread_id
- Show: direction icon (📤/📥), subject, date, message count, snippet
- Click thread → expand to show all messages in thread

All Messages view:
- Chronological list of all emails
- Each message: direction, from, to, subject, snippet, date
- Expandable to show body_preview

### 5. n8n Workflow

Create n8n workflow: "Customer Email Sync"

Nodes:
1. **Schedule Trigger** — Daily at 6:00 AM ET (or Manual Trigger for testing)
2. **HTTP Request** — GET `https://saleshub.mikegrowsgreens.com/api/customers/emails/sync-all`
   - Header: `x-webhook-key: [N8N_WEBHOOK_KEY]`
3. **Split In Batches** — Process 5 customers at a time
4. **Gmail** — Search: `from:{{customer_email}} OR to:{{customer_email}} newer_than:90d`
   - Use Gmail node with OAuth credentials
   - Get: id, threadId, snippet, internalDate, payload.headers (From, To, Subject)
5. **HTTP Request** — POST `https://saleshub.mikegrowsgreens.com/api/customers/emails/sync`
   - Body: `{ customer_email, messages: [...] }`
   - Header: `x-webhook-key: [N8N_WEBHOOK_KEY]`
6. **Wait** — 2 second delay between batches (rate limiting)

### 6. Manual Sync Button

Add "Sync Now" button on the Emails tab that triggers the n8n workflow via:
```
POST https://automation.mikegrowsgreens.com/webhook/customer-email-sync
```

---

## Reference Files

- `src/app/api/track/replies/route.ts` — Existing webhook pattern with key auth
- `src/app/api/track/sent/route.ts` — Another webhook example
- `src/app/api/followups/email-context/route.ts` — Existing Gmail context pulling
- `src/lib/types.ts` — CustomerEmail type
- `src/components/customers/tabs/EmailsTab.tsx` — Placeholder to replace

---

## Validation

After completing:
1. `POST /api/customers/emails/sync` accepts and stores email data
2. `GET /api/customers/[id]/emails` returns stored emails grouped by thread
3. `POST /api/customers/emails/sync-all` returns customer email list for n8n
4. Emails tab shows thread view with real email data
5. Thread expansion shows individual messages
6. "Sync Now" button triggers n8n workflow
7. Customer record updates with last_email_date and total_emails count
8. n8n workflow runs successfully end-to-end (test with 1-2 customers first)
