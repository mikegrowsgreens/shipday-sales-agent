import type { Metadata } from 'next';

/**
 * Iframe embed fallback page at /widget/embed/[org_slug]
 *
 * For sites that can't use the <script> tag approach, this provides
 * an iframe-based embedding option. The widget renders full-screen
 * within the iframe, which the host page sizes via CSS.
 *
 * Usage on host site:
 *   <iframe
 *     src="https://your-saleshub.com/widget/embed/shipday"
 *     style="position:fixed; bottom:0; right:0; width:400px; height:600px; border:none; z-index:999999;"
 *     allow="clipboard-write"
 *   ></iframe>
 */

export const metadata: Metadata = {
  title: 'Chat',
  description: 'SalesHub Chat Widget',
};

export default async function WidgetEmbedPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;

  // Render a self-contained chat page for iframe embedding
  // Uses the same API but renders inline instead of as a floating widget
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <style dangerouslySetInnerHTML={{ __html: `
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body {
            height: 100%;
            background: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
          }
          #iframe-widget {
            height: 100%;
            display: flex;
            flex-direction: column;
          }
        ` }} />
      </head>
      <body>
        <div id="iframe-widget" />
        <script
          src="/widget/embed.js"
          data-org-slug={org_slug}
          data-position="bottom-right"
          data-mode="inline"
          defer
        />
      </body>
    </html>
  );
}
