import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { queryOne } from '@/lib/db';

/**
 * Fetch the saved email signature HTML from org settings.
 * Falls back to buildSignatureHtml() if none is saved.
 */
export async function getStoredSignature(orgId?: number): Promise<string | null> {
  try {
    const row = orgId
      ? await queryOne<{ settings: Record<string, unknown> }>(
          `SELECT settings FROM crm.organizations WHERE org_id = $1`, [orgId])
      : await queryOne<{ settings: Record<string, unknown> }>(
          `SELECT settings FROM crm.organizations LIMIT 1`);
    const sig = (row?.settings as Record<string, unknown>)?.email_signature as string;
    return sig || null;
  } catch {
    return null;
  }
}

/**
 * Shared server-side helper for sending test emails via n8n webhook.
 * Used by all test-send API routes to reduce duplication.
 */
export async function sendTestEmail(params: {
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  recipientEmail: string;
  senderEmail?: string;
  senderName?: string;
  senderTitle?: string;
  webhookPath?: string;
  extraPayload?: Record<string, unknown>;
  orgId?: number;
}): Promise<void> {
  const {
    subject,
    bodyText,
    bodyHtml,
    recipientEmail,
    senderEmail,
    senderName,
    senderTitle,
    webhookPath = 'dashboard-send-approved',
    extraPayload = {},
    orgId,
  } = params;

  // Build HTML body: use provided HTML, or convert plain text
  const bodyContent = bodyHtml
    ? bodyHtml
    : bodyText
      ? bodyText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br/>')
      : '';

  // Use stored signature from org settings, fall back to generated
  const storedSig = await getStoredSignature(orgId);
  const signature = storedSig
    ? `<br/><br/>${storedSig}`
    : buildSignatureHtml(senderName, senderTitle, senderEmail);
  const finalHtml = `<html><body style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">${bodyContent}${signature}</body></html>`;

  const n8nBase = process.env.N8N_BASE_URL || '';
  if (!n8nBase) {
    throw new Error('N8N_BASE_URL is not configured — cannot send test email');
  }

  const webhookUrl = `${n8nBase}/webhook/${webhookPath}`;
  const payload = {
    send_id: `test_${Date.now()}`,
    to: recipientEmail,
    from: senderEmail,
    subject: `[TEST] ${subject}`,
    body_html: finalHtml,
    body_plain: bodyText || '',
    test: true,
    ...extraPayload,
  };

  console.log(`[test-send] Sending to ${recipientEmail} via ${webhookUrl}`);

  const response = await fetchWithTimeout(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeout: 30000,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error');
    console.error(`[test-send] n8n webhook returned ${response.status}: ${errorText}`);
    throw new Error(`n8n webhook returned ${response.status}: ${errorText}`);
  }

  console.log(`[test-send] Successfully sent test email to ${recipientEmail}`);
}

/** Build a simple HTML email signature block */
export function buildSignatureHtml(
  name?: string,
  title?: string,
  email?: string,
): string {
  if (!name) return '';
  const parts = [
    `<strong>${name}</strong>`,
    title || '',
    email || '',
  ].filter(Boolean);
  return `<br/><br/><div style="font-size: 12px; color: #888; border-top: 1px solid #ddd; padding-top: 8px; margin-top: 16px;">${parts.join('<br/>')}</div>`;
}

/** Simple email validation */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
