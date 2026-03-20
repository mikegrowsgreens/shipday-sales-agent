import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { requireTenantSession } from '@/lib/tenant';
import Anthropic from '@anthropic-ai/sdk';
import { getOrgConfigFromSession, DEFAULT_CONFIG } from '@/lib/org-config';
import { aiLimiter, checkRateLimit } from '@/lib/rate-limit';
import { sanitizeInput, armorSystemPrompt, wrapUserData, sanitizeHtmlOutput, INPUT_LIMITS } from '@/lib/prompt-guard';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

/**
 * GET /api/signature
 * Returns the currently saved signature from org settings.
 */
export async function GET() {
  try {
    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const org = await queryOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM crm.organizations WHERE org_id = $1`,
      [orgId],
    );
    const signature = (org?.settings as Record<string, unknown>)?.email_signature as string || '';
    return NextResponse.json({ signature });
  } catch (error) {
    console.error('[signature] error:', error);
    return NextResponse.json({ error: 'Failed to load signature' }, { status: 500 });
  }
}

/**
 * POST /api/signature
 * action: "scrape" — extracts signature from recent sent emails
 * action: "regenerate" — uses AI + brain content to regenerate signature
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const rateLimitResponse = await checkRateLimit(aiLimiter, ip);
    if (rateLimitResponse) return rateLimitResponse;

    const tenant = await requireTenantSession();
    const orgId = tenant.org_id;

    const body = await request.json();
    const { action, current_signature, change_level } = body as {
      action: 'scrape' | 'regenerate';
      current_signature?: string;
      change_level?: number; // 1-5, 1=minimal tweaks, 5=complete redesign
    };

    if (action === 'scrape') {
      // Generate a default signature from org config
      const config = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
      const senderName = config.persona?.sender_name || 'Sales Team';
      const senderTitle = config.persona?.sender_title || 'Business Development';
      const senderEmail = config.persona?.sender_email || '';
      const companyName = config.company_name || 'SalesHub';
      const accentColor = config.branding?.primary_color || '#2563eb';

      const scrapedSignature = `<table cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333; line-height: 1.5;">
  <tr>
    <td style="vertical-align: top; padding-right: 12px; border-right: 2px solid ${accentColor};">
      <strong style="font-size: 14px; color: #111;">${senderName}</strong><br/>
      <span style="color: #555;">${senderTitle} | ${companyName}</span>
    </td>
    <td style="vertical-align: top; padding-left: 12px;">
      ${senderEmail ? `<a href="mailto:${senderEmail}" style="color: ${accentColor}; text-decoration: none; font-size: 12px;">${senderEmail}</a>` : ''}
    </td>
  </tr>
</table>`;

      return NextResponse.json({ signature: scrapedSignature, source: 'config_generated' });
    }

    if (action === 'regenerate') {
      // Load brain content for context
      const brainContent = await query<{
        title: string;
        raw_text: string | null;
        key_claims: unknown;
        value_props: unknown;
        content_type: string;
      }>(
        `SELECT title, raw_text, key_claims, value_props, content_type
         FROM brain.internal_content
         WHERE is_active = true AND org_id = $1
         ORDER BY updated_at DESC
         LIMIT 10`,
        [orgId]
      );

      const brainContext = brainContent.map(c => {
        const claims = Array.isArray(c.key_claims) ? (c.key_claims as string[]).join(', ') : '';
        const props = Array.isArray(c.value_props) ? (c.value_props as string[]).join(', ') : '';
        return `[${c.content_type}] ${c.title}: ${claims} ${props}`.trim();
      }).join('\n');

      const level = change_level || 3;
      const changeLevelPrompt = {
        1: 'Make only minimal tweaks — fix formatting, update wording slightly, keep same structure and content.',
        2: 'Light refresh — improve the tagline and social proof line, keep the overall structure similar.',
        3: 'Moderate redesign — update messaging, tagline, and CTA to better reflect current value props. New structure OK.',
        4: 'Significant redesign — new tagline, restructured layout, fresh messaging based on brain content. Keep contact details.',
        5: 'Complete redesign from scratch — use brain content to create an entirely new signature with compelling messaging. Keep only contact details.',
      }[level] || '';

      const config = await getOrgConfigFromSession().catch(() => DEFAULT_CONFIG);
      const senderName = config.persona?.sender_name || 'Sales Team';
      const senderTitle = config.persona?.sender_title || 'Business Development';
      const senderEmail = config.persona?.sender_email || '';
      const companyName = config.company_name || 'SalesHub';
      const accentColor = config.branding?.primary_color || '#2563eb';

      const systemPrompt = armorSystemPrompt(`You are an email signature designer for a B2B SaaS sales rep. Generate a professional HTML email signature using inline CSS (no external stylesheets). The signature should be compact, clean, and render well in all email clients.

Requirements:
- Use HTML tables with inline styles (email-compatible)
- Keep it concise — max 4-5 lines of text
- Include a compelling tagline or social proof
- Use ${accentColor} as accent color
- Must include: name, title, company, and email
- Add a persuasive CTA or social proof line at the bottom

Contact details to preserve:
- Name: ${senderName}
- Title: ${senderTitle}
- Company: ${companyName}
- Email: ${senderEmail}

Return ONLY the HTML code, no markdown code blocks, no explanation.`);

      const sanitizedCurrentSig = sanitizeInput(current_signature, INPUT_LIMITS.email_body);
      const sanitizedBrainCtx = sanitizeInput(brainContext, INPUT_LIMITS.brain_content);

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Change level: ${changeLevelPrompt}

${wrapUserData('current_signature', sanitizedCurrentSig || 'No current signature saved.')}

${wrapUserData('brain_content', sanitizedBrainCtx || 'No brain content available.')}

Generate the new HTML signature.`,
        }],
      });

      const generatedHtml = response.content[0].type === 'text' ? response.content[0].text : '';
      // Strip markdown code blocks if present
      const cleanHtml = generatedHtml
        .replace(/^```html?\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();

      // Sanitize AI-generated HTML to remove any injected scripts/handlers
      const safeHtml = sanitizeHtmlOutput(cleanHtml);

      return NextResponse.json({ signature: safeHtml, change_level: level });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[signature] error:', error);
    return NextResponse.json({ error: 'Signature operation failed' }, { status: 500 });
  }
}
