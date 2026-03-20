import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import { exportSettingsSchema } from '@/lib/validators/settings';

/**
 * POST /api/settings/export
 * Exports data as JSON or CSV.
 * body: { format: 'json' | 'csv', tables: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json();
    const parsed = exportSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { format, tables } = parsed.data;

    const allowedTables: Record<string, {
      schema: string;
      table: string;
      orgCol?: string;
      /** Custom SELECT columns (omit to use SELECT *) */
      selectCols?: string;
      /** Custom query override — must include $1 placeholder for orgId */
      customQuery?: string;
    }> = {
      contacts: { schema: 'crm', table: 'contacts', orgCol: 'org_id' },
      deals: { schema: 'crm', table: 'deals', orgCol: 'org_id' },
      activities: { schema: 'crm', table: 'activities', orgCol: 'org_id' },
      sequences: { schema: 'crm', table: 'sequences', orgCol: 'org_id' },
      campaigns: { schema: 'bdr', table: 'lead_campaigns', orgCol: 'org_id' },
      leads: { schema: 'bdr', table: 'leads', orgCol: 'org_id' },
      brain: { schema: 'brain', table: 'internal_content', orgCol: 'org_id' },
      // GDPR-required tables
      touchpoints: { schema: 'crm', table: 'touchpoints', orgCol: 'org_id' },
      sequence_enrollments: { schema: 'crm', table: 'sequence_enrollments', orgCol: 'org_id' },
      sequence_step_executions: {
        schema: 'crm',
        table: 'sequence_step_executions',
        customQuery: `SELECT sse.* FROM crm.sequence_step_executions sse
          INNER JOIN crm.sequence_enrollments se ON se.id = sse.enrollment_id
          WHERE se.org_id = $1
          ORDER BY sse.created_at DESC LIMIT 10000`,
      },
      task_queue: { schema: 'crm', table: 'task_queue', orgCol: 'org_id' },
      audit_log: { schema: 'crm', table: 'audit_log', orgCol: 'org_id' },
      usage_events: { schema: 'crm', table: 'usage_events', orgCol: 'org_id' },
      api_keys: {
        schema: 'crm',
        table: 'api_keys',
        orgCol: 'org_id',
        selectCols: 'id, org_id, name, prefix, scopes, expires_at, last_used_at, created_at, revoked_at',
      },
    };

    const exportData: Record<string, unknown[]> = {};

    // Support "all" — export every allowed table
    const requestedTables = tables.includes('all')
      ? Object.keys(allowedTables)
      : tables;

    for (const tableName of requestedTables) {
      const config = allowedTables[tableName];
      if (!config) continue;

      let sql: string;
      let params: unknown[];

      if (config.customQuery) {
        // Table requires a custom query (e.g. join-based org scoping)
        sql = config.customQuery;
        params = [orgId];
      } else {
        const cols = config.selectCols || '*';
        const whereClause = config.orgCol
          ? `WHERE ${config.orgCol} = $1`
          : '';
        params = config.orgCol ? [orgId] : [];
        sql = `SELECT ${cols} FROM ${config.schema}.${config.table} ${whereClause} ORDER BY created_at DESC LIMIT 10000`;
      }

      try {
        const rows = await query(sql, params);
        exportData[tableName] = rows;
      } catch (tableError) {
        // Log but don't fail the entire export if one table is missing
        console.warn(`[settings/export] skipping table "${tableName}":`, tableError);
        exportData[tableName] = [];
      }
    }

    if (format === 'json') {
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="saleshub-export-${Date.now()}.json"`,
        },
      });
    }

    // CSV format — flatten each table
    const csvParts: string[] = [];
    for (const [tableName, rows] of Object.entries(exportData)) {
      if (!rows.length) continue;
      const headers = Object.keys(rows[0] as Record<string, unknown>);
      const csvHeader = headers.join(',');
      const csvRows = rows.map(row => {
        const r = row as Record<string, unknown>;
        return headers.map(h => {
          const val = r[h];
          if (val === null || val === undefined) return '';
          const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        }).join(',');
      });

      csvParts.push(`--- ${tableName} ---`);
      csvParts.push(csvHeader);
      csvParts.push(...csvRows);
      csvParts.push('');
    }

    return new NextResponse(csvParts.join('\n'), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="saleshub-export-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    console.error('[settings/export] error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
