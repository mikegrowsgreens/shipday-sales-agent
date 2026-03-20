# Session 4: Customer Detail Page

## Goal
Build the `/customers/[id]` page — the full customer profile with tabbed interface showing contact info, plan history, usage, notes, and (placeholder for) email history.

---

## Context

**Project:** SalesHub — `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/`
**Prereqs:** Sessions 1-3 complete (database, import, list page working)
**UI Pattern:** Dark mode, Tailwind CSS, Lucide icons, tabbed interfaces
**Existing detail page example:** `src/app/contacts/[id]/page.tsx`, `src/app/followups/[id]/page.tsx`

---

## What to Build

### 1. Customer Detail Page

File: `src/app/customers/[id]/page.tsx`

Layout:
```
┌──────────────────────────────────────────────────────┐
│  ← Back to Customers                                 │
├──────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────┐  │
│  │ [Logo/Initial] Raw Dino                        │  │
│  │ Branded Elite Lite  ● Active  ♥ Health: 78     │  │
│  │ Roman · info@rawdino.com · (555) 123-4567      │  │
│  │                                                │  │
│  │ [Send Email] [Log Note] [Change Plan]          │  │
│  └────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────┤
│  [Overview] [Emails] [Plan & Billing] [Usage] [Notes]│
├──────────────────────────────────────────────────────┤
│                                                      │
│  (Tab content renders here)                          │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 2. Components to Create

**`src/components/customers/CustomerDetail.tsx`**
- Main container with header and tab system
- Fetches customer data from `GET /api/customers/[id]`
- Tab state management (URL hash or local state)

**`src/components/customers/CustomerHeader.tsx`**
- Business name (large heading)
- Plan badge (PlanBadge component from Session 3)
- Status indicator (colored dot + text)
- Health score display
- Contact info line: name, email (clickable mailto), phone (clickable tel)
- Action buttons: Send Email, Log Note, Edit Customer

**`src/components/customers/tabs/OverviewTab.tsx`**
- Two-column grid:
  - Left: Contact details card (name, email, phone, address, city, state)
  - Right: Quick stats card (signup date, last active, total emails, locations, drivers)
- Recent activity section (last 5 emails or notes)
- Tags display with add/remove

**`src/components/customers/tabs/EmailsTab.tsx`**
- Placeholder for Session 5 (Gmail integration)
- Show message: "Email history will be available after Gmail sync"
- If any emails exist in `crm.customer_emails`, show them in a thread-like view
- Each email: direction arrow (↗ sent / ↙ received), subject, snippet, date

**`src/components/customers/tabs/PlanBillingTab.tsx`**
- Current plan card (large badge + details)
- Discount info if applicable
- Shipday account ID / company ID
- Plan change timeline (from `crm.customer_plan_changes`)
  - Each entry: date, old plan → new plan, commission amount
  - Visual timeline with dots and lines
- "Log Plan Change" button → modal

**`src/components/customers/tabs/UsageTab.tsx`**
- Stats grid:
  - Locations count
  - Drivers count
  - Avg completed orders
  - Avg order value
  - Avg cost per order
- If data is available, show simple bar/trend visualization
- "Last updated" timestamp

**`src/components/customers/tabs/NotesTab.tsx`**
- Free-form notes textarea (auto-saves on blur)
- Tags editor (add/remove tags from customer)
- Custom fields display (from JSONB)
- "Add Context" button → modal for adding structured context
- History of note changes (if tracked)

### 3. Plan Change Modal

**`src/components/customers/PlanChangeModal.tsx`**
- Select new plan (dropdown of all plan tiers)
- Previous plan (auto-filled)
- Change date (date picker, defaults to today)
- Commission amount (number input)
- Notes (optional text)
- "Save" → POST to `/api/customers/[id]/plan-change`

### 4. Edit Customer Modal

**`src/components/customers/EditCustomerModal.tsx`**
- Editable fields: business_name, contact_name, email, phone, address, state
- "Save" → PUT to `/api/customers/[id]`
- Validation: email format, required fields

### 5. API Enhancement

Update `GET /api/customers/[id]` to also return:
- `plan_history`: array of plan changes
- `recent_emails`: last 5 emails (if any exist)
- `email_count`: total email count

---

## Reference Files

- `src/app/contacts/[id]/page.tsx` — Existing contact detail page
- `src/app/followups/[id]/page.tsx` — Follow-up detail with tabs
- `src/components/customers/PlanBadge.tsx` — From Session 3
- `src/components/customers/HealthScore.tsx` — From Session 3
- `src/lib/types.ts` — Customer, CustomerEmail, CustomerPlanChange types

---

## Styling Notes

- Header: bg-gray-900 rounded-xl p-6, with gradient accent top border
- Tabs: border-b border-gray-800, active tab has blue-500 bottom border
- Cards within tabs: bg-gray-900/50 rounded-lg p-4
- Timeline: vertical line with dots, alternating left/right for plan changes
- Modals: overlay bg-black/50, modal bg-gray-900 rounded-xl

---

## Validation

After completing:
1. `/customers/[id]` loads and displays correct customer data
2. All 5 tabs render and switch correctly
3. Plan badge and health score display correctly
4. Edit customer modal saves changes
5. Plan change modal creates history entry
6. Notes save correctly
7. Back button returns to customer list
8. Emails tab shows placeholder (or any synced emails)
9. Page handles loading states and not-found gracefully
