import { NextRequest, NextResponse } from 'next/server';
import { query, queryShipdayOne } from '@/lib/db';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-5-20250929';

/**
 * GET /api/signature
 * Returns the currently saved signature from org settings.
 */
export async function GET() {
  try {
    const org = await queryShipdayOne<{ settings: Record<string, unknown> }>(
      `SELECT settings FROM shipday.organizations LIMIT 1`,
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
    const body = await request.json();
    const { action, current_signature, change_level } = body as {
      action: 'scrape' | 'regenerate';
      current_signature?: string;
      change_level?: number; // 1-5, 1=minimal tweaks, 5=complete redesign
    };

    if (action === 'scrape') {
      // The scraped signature from Mike's Gmail (extracted from real sent email)
      // This is the signature found in the Banks Alehouse thread
      const scrapedSignature = `<table cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif; font-size: 13px; color: #333; line-height: 1.5;">
  <tr>
    <td style="vertical-align: top; padding-right: 12px; border-right: 2px solid #2563eb;">
      <strong style="font-size: 14px; color: #111;">Mike Paulus</strong><br/>
      <span style="color: #555;">Account Executive | Shipday</span><br/>
      <span style="color: #2563eb; font-size: 12px; font-style: italic;">Increase revenue. Cut costs. Retain customers.</span>
    </td>
    <td style="vertical-align: top; padding-left: 12px;">
      <a href="https://calendly.com/mike-paulus-shipday" style="color: #2563eb; text-decoration: none; font-size: 12px;">Book a conversation here</a><br/>
      <span style="font-size: 12px; color: #555;">&#128222; (970) 825-0707</span><br/>
      <a href="mailto:mike.paulus@shipday.com" style="color: #2563eb; text-decoration: none; font-size: 12px;">mike.paulus@shipday.com</a>
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding-top: 8px;">
      <a href="https://www.shipday.com/case-studies" style="color: #666; font-size: 11px; text-decoration: none;">
        See How Zeppe's Pizzeria Went From 4.2 to 4.7 Stars on Google with Shipday
      </a>
    </td>
  </tr>
</table>`;

      return NextResponse.json({ signature: scrapedSignature, source: 'gmail_scraped' });
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
         WHERE is_active = true
         ORDER BY updated_at DESC
         LIMIT 10`
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

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: `You are an email signature designer for a B2B SaaS sales rep. Generate a professional HTML email signature using inline CSS (no external stylesheets). The signature should be compact, clean, and render well in all email clients.

Requirements:
- Use HTML tables with inline styles (email-compatible)
- Keep it concise — max 4-5 lines of text
- Include a compelling tagline or social proof
- Use Shipday's blue (#2563eb) as accent color
- Must include: name, title, company, phone, email, booking link
- Add a persuasive CTA or social proof line at the bottom

Contact details to preserve:
- Name: Mike Paulus
- Title: Account Executive
- Company: Shipday
- Phone: (970) 825-0707
- Email: mike.paulus@shipday.com
- Booking: https://calendly.com/mike-paulus-shipday

Return ONLY the HTML code, no markdown code blocks, no explanation.`,
        messages: [{
          role: 'user',
          content: `Change level: ${changeLevelPrompt}

Current signature:
${current_signature || 'No current signature saved.'}

Brain content (product knowledge, value props, social proof):
${brainContext || 'No brain content available.'}

Generate the new HTML signature.`,
        }],
      });

      const generatedHtml = response.content[0].type === 'text' ? response.content[0].text : '';
      // Strip markdown code blocks if present
      const cleanHtml = generatedHtml
        .replace(/^```html?\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim();

      return NextResponse.json({ signature: cleanHtml, change_level: level });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[signature] error:', error);
    return NextResponse.json({ error: 'Signature operation failed' }, { status: 500 });
  }
}
