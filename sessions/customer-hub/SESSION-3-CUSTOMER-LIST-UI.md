# Session 3: Customer List UI

## Goal
Build the `/customers` page — the main customer dashboard with filterable table, KPI bar, and sidebar navigation entry.

---

## Context

**Project:** SalesHub — `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/`
**Prereqs:** Sessions 1-2 complete (database, APIs, and imported data exist)
**UI Pattern:** Dark mode (bg-gray-950, text-gray-100), Tailwind CSS, Lucide icons
**Existing examples:** `/contacts` page, `/outbound` page — follow same layout patterns

---

## What to Build

### 1. Sidebar Navigation Entry

File: `src/components/layout/Sidebar.tsx`

Add "Customers" nav item between "Contacts" and "Sequences":
- Icon: `Users` from lucide-react
- Path: `/customers`
- Label: "Customers"

### 2. Customer List Page

File: `src/app/customers/page.tsx`

Layout:
```
┌──────────────────────────────────────────────────┐
│  Customers                        [Import CSV]   │
├──────────────────────────────────────────────────┤
│  KPI Bar                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐  │
│  │Active│ │Plans │ │Avg   │ │At    │ │Total │  │
│  │Count │ │Break │ │Order │ │Risk  │ │Locs  │  │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘  │
├──────────────────────────────────────────────────┤
│  [Search...] [Plan ▼] [Status ▼] [State ▼]      │
├──────────────────────────────────────────────────┤
│  Business Name │ Contact │ Plan    │ Status │ ... │
│  ─────────────────────────────────────────────── │
│  Raw Dino      │ Roman   │ Elite L │ Active │ ... │
│  Pagliacci's   │ Jane    │ Elite L │ Active │ ... │
│  ...           │         │         │        │     │
└──────────────────────────────────────────────────┘
```

### 3. Components to Create

**`src/components/customers/CustomerList.tsx`**
- Table with sortable columns: Business Name, Contact, Email, Plan, Status, Signup Date, Last Active, Health Score, Avg Orders
- Row click → navigate to `/customers/[id]`
- Plan displayed as colored badge (use PlanBadge component)
- Health score as colored dot (green/yellow/red)
- Pagination (25 per page)

**`src/components/customers/CustomerKPIBar.tsx`**
- Fetches from `GET /api/customers/stats`
- Cards: Active Customers, Plan Breakdown (mini chart), Avg Order Value, At-Risk Count, Total Locations

**`src/components/customers/PlanBadge.tsx`**
- Colored badge per plan tier:
  - branded_elite_lite → blue
  - branded_premium_plus → purple
  - business_advanced_lite → amber
  - business_advanced → green
  - branded_elite_custom → cyan
- Shows abbreviated name: "Elite Lite", "Premium Plus", "Adv Lite", "Advanced", "Elite Custom"

**`src/components/customers/HealthScore.tsx`**
- Circular or dot indicator
- 70-100 = green, 40-69 = yellow, 0-39 = red
- Shows numeric score on hover

**`src/components/customers/CustomerFilters.tsx`**
- Search input (searches business_name, contact_name, email)
- Plan dropdown (all plan tiers)
- Status dropdown (active, inactive, churned)
- State dropdown (populated from data)
- Clear filters button

### 4. Data Fetching Pattern

Follow existing pattern (client-side fetch):
```typescript
const [customers, setCustomers] = useState<Customer[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  fetch(`/api/customers?${params}`)
    .then(res => res.json())
    .then(data => { setCustomers(data.customers); setLoading(false); });
}, [filters]);
```

### 5. Empty State

If no customers imported yet, show:
- "No customers yet" message
- "Import from CSV" button linking to `/customers/import`
- Brief description of what this section does

---

## Reference Files

- `src/app/contacts/page.tsx` — Similar list page (follow layout)
- `src/components/layout/Sidebar.tsx` — Navigation (add entry here)
- `src/app/outbound/page.tsx` — Another list page example
- `src/components/ui/KPIGrid.tsx` — Existing KPI component (reuse if applicable)
- `src/lib/types.ts` — Customer type

---

## Styling Notes

- Dark theme: bg-gray-950 base, bg-gray-900 cards, bg-gray-800 hover
- Border: border-gray-800
- Text: text-gray-100 primary, text-gray-400 secondary
- Accent: blue-500 for actions, green-500 for success indicators
- Follow existing rounded-xl card patterns

---

## Validation

After completing:
1. "Customers" appears in sidebar navigation
2. `/customers` page loads and shows imported customer data
3. KPI bar shows correct aggregate stats
4. Search filters customers in real-time
5. Plan/Status/State dropdowns filter correctly
6. Table columns are sortable
7. Clicking a row navigates to `/customers/[id]` (even if that page isn't built yet)
8. Empty state shows when no data exists
9. Responsive layout works at common breakpoints
