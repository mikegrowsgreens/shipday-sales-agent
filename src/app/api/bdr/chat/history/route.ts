import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';

/**
 * GET /api/bdr/chat/history?session_id=...
 * List chat sessions or get messages for a session.
 */
export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (sessionId) {
      // Get messages for a specific session
      const messages = await query<{
        id: string;
        role: string;
        content: string;
        tool_calls: unknown;
        tool_results: unknown;
        created_at: string;
      }>(
        `SELECT id::text, role, content, tool_calls, tool_results, created_at::text
         FROM bdr.chat_messages
         WHERE session_id = $1 AND org_id = $2
         ORDER BY created_at ASC`,
        [sessionId, orgId]
      );

      return NextResponse.json({ messages });
    }

    // List recent sessions
    const sessions = await query<{
      id: string;
      title: string;
      message_count: number;
      last_message_at: string;
      created_at: string;
    }>(
      `SELECT id::text, title, message_count, last_message_at::text, created_at::text
       FROM bdr.chat_sessions
       WHERE org_id = $1
       ORDER BY last_message_at DESC
       LIMIT 20`,
      [orgId]
    );

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error('[bdr/chat/history] error:', error);
    return NextResponse.json({ sessions: [], messages: [] });
  }
}

/**
 * POST /api/bdr/chat/history
 * Create a new chat session.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json();
    const { title } = body;

    const rows = await query<{ id: string }>(
      `INSERT INTO bdr.chat_sessions (org_id, title) VALUES ($1, $2) RETURNING id::text`,
      [orgId, title || 'New Chat']
    );

    return NextResponse.json({ session_id: rows[0].id, success: true });
  } catch (error) {
    console.error('[bdr/chat/history] POST error:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

/**
 * PATCH /api/bdr/chat/history
 * Add a message to a session.
 */
export async function PATCH(request: NextRequest) {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json();
    const { session_id, role, content, tool_calls, tool_results } = body;

    if (!session_id || !role || !content) {
      return NextResponse.json({ error: 'session_id, role, content required' }, { status: 400 });
    }

    await query(
      `INSERT INTO bdr.chat_messages (org_id, session_id, role, content, tool_calls, tool_results)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, session_id, role, content, JSON.stringify(tool_calls || null), JSON.stringify(tool_results || null)]
    );

    // Update session
    await query(
      `UPDATE bdr.chat_sessions
       SET message_count = message_count + 1, last_message_at = NOW(),
           title = CASE WHEN message_count = 0 THEN LEFT($2, 50) ELSE title END
       WHERE id = $1 AND org_id = $3`,
      [session_id, content, orgId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[bdr/chat/history] PATCH error:', error);
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 });
  }
}
