import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getTenantFromSession } from '@/lib/tenant';

/**
 * POST /api/settings/export
 * Exports data as JSON or CSV.
 * body: { format: 'json' | 'csv', tables: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await getTenantFromSession();
    const orgId = tenant?.org_id || 1;

    const body = await request.json();
    const { format, tables } = body as {
      format: 'json' | 'csv';
      tables: string[];
    };

    if (!format || !tables?.length) {
      return NextResponse.json({ error: 'format and tables required' }, { status: 400 });
    }

    const allowedTables: Record<string, { schema: string; table: string; orgCol?: string }> = {
      contacts: { schema: 'crm', table: 'contacts', orgCol: 'org_id' },
      deals: { schema: 'crm', table: 'deals', orgCol: 'org_id' },
      activities: { schema: 'crm', table: 'activities', orgCol: 'org_id' },
      sequences: { schema: 'public', table: 'sequences' },
      campaigns: { schema: 'bdr', table: 'lead_campaigns' },
      leads: { schema: 'bdr', table: 'leads' },
      brain: { schema: 'brain', table: 'internal_content' },
    };

    const exportData: Record<string, unknown[]> = {};

    for (const tableName of tables) {
      const config = allowedTables[tableName];
      if (!config) continue;

      const whereClause = config.orgCol
        ? `WHERE ${config.orgCol} = $1`
        : '';
      const params = config.orgCol ? [orgId] : [];

      const rows = await query(
        `SELECT * FROM ${config.schema}.${config.table} ${whereClause} ORDER BY created_at DESC LIMIT 10000`,
        params
      );

      exportData[tableName] = rows;
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
