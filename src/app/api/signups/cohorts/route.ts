import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/signups/cohorts
 * Cohort analysis — track signup cohorts and their funnel progression over time.
 * Returns weekly cohorts with counts at each funnel stage.
 *
 * ?weeks=12 — number of cohort weeks to return (default 12)
 * ?territory=mine — filter to territory only
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const weeks = Math.min(parseInt(searchParams.get('weeks') || '12'), 52);
    const territory = searchParams.get('territory') || '';

    const territoryFilter = territory === 'mine' ? 'AND territory_match = true' : '';

    // Cohort progression: for each weekly cohort, count signups at each funnel stage
    const cohorts = await query<{
      cohort_week: string;
      total: string;
      signup: string;
      activation: string;
      first_delivery: string;
      retained: string;
      churned: string;
      converted: string;
    }>(
      `SELECT
         COALESCE(cohort_week, DATE_TRUNC('week', COALESCE(signup_date, created_at))::date) as cohort_week,
         COUNT(*)::text as total,
         COUNT(*) FILTER (WHERE COALESCE(funnel_stage, 'signup') = 'signup')::text as signup,
         COUNT(*) FILTER (WHERE funnel_stage = 'activation')::text as activation,
         COUNT(*) FILTER (WHERE funnel_stage = 'first_delivery')::text as first_delivery,
         COUNT(*) FILTER (WHERE funnel_stage = 'retained')::text as retained,
         COUNT(*) FILTER (WHERE funnel_stage = 'churned')::text as churned,
         COUNT(*) FILTER (WHERE converted_to_lead = true)::text as converted
       FROM crm.shipday_signups
       WHERE COALESCE(cohort_week, DATE_TRUNC('week', COALESCE(signup_date, created_at))::date)
             >= NOW() - INTERVAL '1 week' * $1
       ${territoryFilter}
       GROUP BY 1
       ORDER BY 1 DESC`,
      [weeks]
    );

    // Funnel conversion rates (overall)
    const funnelRates = await query<{
      total: string;
      activated: string;
      delivered: string;
      retained: string;
      churned: string;
    }>(
      `SELECT
         COUNT(*)::text as total,
         COUNT(*) FILTER (WHERE funnel_stage IN ('activation', 'first_delivery', 'retained'))::text as activated,
         COUNT(*) FILTER (WHERE funnel_stage IN ('first_delivery', 'retained'))::text as delivered,
         COUNT(*) FILTER (WHERE funnel_stage = 'retained')::text as retained,
         COUNT(*) FILTER (WHERE funnel_stage = 'churned')::text as churned
       FROM crm.shipday_signups
       WHERE COALESCE(cohort_week, DATE_TRUNC('week', COALESCE(signup_date, created_at))::date)
             >= NOW() - INTERVAL '1 week' * $1
       ${territoryFilter}`,
      [weeks]
    );

    const rates = funnelRates[0] || { total: '0', activated: '0', delivered: '0', retained: '0', churned: '0' };
    const total = parseInt(rates.total);

    // Time to activation (avg days from signup to activation)
    const ttaRow = await query<{ avg_days: string }>(
      `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (activated_at - COALESCE(signup_date, created_at))) / 86400), 1)::text as avg_days
       FROM crm.shipday_signups
       WHERE activated_at IS NOT NULL ${territoryFilter}`
    );

    return NextResponse.json({
      cohorts: cohorts.map(c => ({
        cohort_week: c.cohort_week,
        total: parseInt(c.total),
        signup: parseInt(c.signup),
        activation: parseInt(c.activation),
        first_delivery: parseInt(c.first_delivery),
        retained: parseInt(c.retained),
        churned: parseInt(c.churned),
        converted: parseInt(c.converted),
      })),
      summary: {
        total,
        activation_rate: total > 0 ? (parseInt(rates.activated) / total * 100) : 0,
        delivery_rate: total > 0 ? (parseInt(rates.delivered) / total * 100) : 0,
        retention_rate: total > 0 ? (parseInt(rates.retained) / total * 100) : 0,
        churn_rate: total > 0 ? (parseInt(rates.churned) / total * 100) : 0,
        avg_days_to_activation: parseFloat(ttaRow[0]?.avg_days || '0'),
      },
      weeks,
    });
  } catch (error) {
    console.error('[signups/cohorts] error:', error);
    return NextResponse.json({ error: 'Failed to load cohort data' }, { status: 500 });
  }
}
