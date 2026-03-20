# Session 2: CSV Import Pipeline

## Goal
Build the import system that ingests both Google Sheet formats into the unified `crm.customers` table, including upgrade history.

---

## Context

**Project:** SalesHub — `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/`
**Prereq:** Session 1 complete (database tables exist, core API routes work)
**Existing import pattern:** `src/app/api/contacts/import/route.ts` — CSV import with field mapping for contacts

---

## Data Sources

### Sheet 1: "Audit" (main tab)
| Column | Maps To |
|--------|---------|
| Name | business_name |
| Contact | contact_name |
| Email | email |
| Phone | phone |
| Plan | (informational — old plan name) |
| Current Plan | account_plan + plan_display_name |
| Account Status | account_status |
| Signup Date | signup_date |
| Last Active | last_active |
| Locations | num_locations |
| Notes | notes + parse for: num_drivers, discount_pct, shipday_account_id |

**Notes parsing:** Format is `Drivers: X; Discount: Y%; ID: ZZZZZ` or `Drivers: X; ID: ZZZZZ`
```typescript
function parseAuditNotes(notes: string) {
  const drivers = notes.match(/Drivers:\s*(\d+)/)?.[1];
  const discount = notes.match(/Discount:\s*(\d+)%/)?.[1];
  const accountId = notes.match(/ID:\s*(\d+)/)?.[1];
  return {
    num_drivers: drivers ? parseInt(drivers) : null,
    discount_pct: discount ? parseFloat(discount) : null,
    shipday_account_id: accountId || null,
  };
}
```

**Plan normalization:**
| Source Value | Normalized Key |
|-------------|---------------|
| Branded Elite Lite | branded_elite_lite |
| Branded Premium Plus | branded_premium_plus |
| Business Advanced Lite | business_advanced_lite |
| Business Advanced | business_advanced |

### Sheet 2: "Regional Customer List"
| Column | Maps To |
|--------|---------|
| email | email |
| company_id | shipday_company_id |
| address | address (parse city, state) |
| state | state |
| account_plan | account_plan (normalize BRANDED_ELITE → branded_elite_lite) |
| avg_completed_orders | avg_completed_orders |
| Business | business_name |
| Customer Name | contact_name |
| Average Order | avg_order_value |
| Average Cost | avg_cost_per_order |

**Plan normalization:**
| Source Value | Normalized Key |
|-------------|---------------|
| BRANDED_ELITE | branded_elite_lite |
| BRANDED_ELITE_CUSTOM | branded_elite_custom |

### Upgrade Tabs (September/August/July/June/May Upgrades)
| Column | Maps To |
|--------|---------|
| Name | → match to customer by name+email |
| Plan | new_plan (BAL=business_advanced_lite, BP=branded_premium, Pro=pro, Elite=elite) |
| Contact | (informational) |
| Email | → match to customer |
| Close Date | change_date |
| Commission | commission |

---

## What to Build

### 1. API Route: `POST /api/customers/import`

File: `src/app/api/customers/import/route.ts`

Accept multipart form data with:
- `file`: CSV file
- `format`: `'audit'` | `'regional'` | `'upgrades'` | `'auto'`
- `sheet_name`: optional (for upgrade tabs: 'september_upgrades', etc.)

Logic:
1. Parse CSV with `csv-parse` (already in project dependencies)
2. Auto-detect format from header row if format='auto'
   - If headers include "Name, Contact, Email, Phone, Plan" → audit format
   - If headers include "email, company_id, address, state, account_plan" → regional format
   - If headers include "Name, Plan, Contact, Email, Close Date, Commission" → upgrades format
3. Map fields based on detected format
4. Normalize plan names
5. Parse Notes field (audit format)
6. Upsert: `ON CONFLICT (org_id, email) DO UPDATE` — merge data from both sources
7. Return: imported count, updated count, error count, error details

### 2. Merge Strategy

When importing the second sheet, existing records matched by email should be UPDATED with new data, not replaced. Specifically:
- Financial fields (avg_order_value, etc.) — overwrite with Regional data
- shipday_company_id — set from Regional data
- business_name — keep existing if present, otherwise use new
- Plan — keep the more specific one (Audit sheet has better plan detail)
- Status — always prefer Audit sheet's account_status

### 3. Import UI Component

File: `src/components/customers/CustomerImport.tsx`

- Drag-and-drop CSV upload area
- Format auto-detection with manual override
- Preview first 5 rows with field mapping display
- "Import" button with progress indicator
- Results summary: X imported, Y updated, Z errors

### 4. Import Page

File: `src/app/customers/import/page.tsx`

- Full page with import component
- Instructions for downloading each sheet as CSV
- Link back to customer list after import

### 5. API Route: `POST /api/customers/import/upgrades`

Separate route for importing upgrade history:
1. Parse CSV from upgrade tab
2. Match each row to existing customer by email (fuzzy match on name if no email match)
3. Create `crm.customer_plan_changes` record
4. Update customer's `account_plan` if the upgrade is the most recent

---

## Reference Files

- `src/app/api/contacts/import/route.ts` — Existing CSV import pattern (follow this)
- `src/lib/types.ts` — Customer type definition (from Session 1)
- `src/app/api/customers/route.ts` — Customer CRUD (from Session 1)
- `CUSTOMER-HUB-PLAN.md` — Full plan reference

---

## Validation

After completing:
1. Download both Google Sheets as CSV
2. Import Audit CSV → creates ~50-80 customer records
3. Import Regional CSV → merges data into existing records (matched by email)
4. Import upgrade tab CSVs → creates plan_changes records
5. `GET /api/customers` returns all imported customers with merged data
6. Notes field correctly parsed for drivers/discount/ID
7. Plan names correctly normalized
