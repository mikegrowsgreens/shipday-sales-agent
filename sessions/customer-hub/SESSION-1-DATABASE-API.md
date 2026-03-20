# Session 1: Database Schema & API Foundation

## Goal
Create the database tables and core CRUD API routes for the Customer Hub.

---

## Context

**Project:** SalesHub — `/Users/mikepaulus/Desktop/Claude Code/Sales Hub/saleshub/`
**Stack:** Next.js 14 (App Router), PostgreSQL, TypeScript, Tailwind CSS
**Database:** `wincall_brain` on DigitalOcean managed PostgreSQL
**DB Connection:** `src/lib/db.ts` — uses raw `pg` Pool, no ORM
**Auth pattern:** JWT sessions, org_id isolation, RLS policies
**Existing schema:** `schema.sql` at project root, CRM tables in `crm.*` schema

---

## What to Build

### 1. Database Migration

Create migration file: `migrations/016-customer-hub.sql`

**Tables to create:**

```sql
-- crm.customers — unified customer record
-- crm.customer_emails — synced email history from Gmail
-- crm.customer_plan_changes — plan upgrade/downgrade history
-- crm.customer_campaigns — upsell/marketing campaigns
```

Full schema is in `CUSTOMER-HUB-PLAN.md` at project root. Key fields:
- `crm.customers`: business_name, contact_name, email, phone, address, state, shipday_company_id, account_plan, plan_display_name, account_status, signup_date, last_active, num_locations, num_drivers, avg_completed_orders, avg_order_value, avg_cost_per_order, discount_pct, health_score, notes, tags, custom_fields, imported_from
- Include org_id on all tables + RLS policies matching existing pattern
- Add indexes on org_id, email, account_plan, account_status

### 2. TypeScript Types

Add to `src/lib/types.ts`:
- `Customer` interface
- `CustomerEmail` interface
- `CustomerPlanChange` interface
- `CustomerCampaign` interface

### 3. API Routes

Create under `src/app/api/customers/`:

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/customers` | GET | List customers with filters (plan, status, state, search, sort, pagination) |
| `/api/customers` | POST | Create customer manually |
| `/api/customers/[id]/route.ts` | GET | Get single customer with full detail |
| `/api/customers/[id]/route.ts` | PUT | Update customer fields |
| `/api/customers/[id]/route.ts` | DELETE | Soft delete (set status='deleted') |
| `/api/customers/stats/route.ts` | GET | Dashboard KPIs: total active, by plan, MRR estimate, avg health |
| `/api/customers/[id]/plan-history/route.ts` | GET | Get plan change history for customer |
| `/api/customers/[id]/plan-history/route.ts` | POST | Log a plan change |

### 4. Auth Pattern

Follow existing pattern in other API routes:
```typescript
import { getAuthContext } from '@/lib/route-auth';

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { orgId } = auth;
  // ... query with WHERE org_id = $1
}
```

### 5. Run Migration

Connect to database and run the migration:
```bash
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p 25060 -U doadmin -d wincall_brain --set=sslmode=require -f migrations/016-customer-hub.sql
```

---

## Reference Files

- `src/lib/db.ts` — DB connection pool & query helpers
- `src/lib/types.ts` — All TypeScript interfaces
- `src/lib/route-auth.ts` — Auth context helper
- `src/lib/tenant.ts` — Multi-tenant helpers
- `schema.sql` — Current schema reference
- `src/app/api/contacts/route.ts` — Example CRUD pattern to follow
- `src/app/api/followups/deals/route.ts` — Another good CRUD example
- `CUSTOMER-HUB-PLAN.md` — Full plan with complete schema

---

## Validation

After completing:
1. Migration runs without errors
2. `GET /api/customers` returns empty array (no data yet)
3. `POST /api/customers` with test data creates a record
4. `GET /api/customers/[id]` returns the created record
5. `GET /api/customers/stats` returns zero counts
6. TypeScript compiles with no errors
