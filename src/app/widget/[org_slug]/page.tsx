import type { Metadata } from 'next';

/**
 * Widget host page at /widget/[org_slug]
 *
 * Minimal page that loads the embeddable widget script.
 * Can be used standalone or loaded in an iframe on third-party sites.
 *
 * Usage:
 *   Direct: https://your-saleshub.com/widget/shipday
 *   Iframe: <iframe src="https://your-saleshub.com/widget/shipday" ...></iframe>
 */

export const metadata: Metadata = {
  title: 'Chat with us',
  description: 'Start a conversation with our AI sales assistant.',
};

export default async function WidgetHostPage({
  params,
}: {
  params: Promise<{ org_slug: string }>;
}) {
  const { org_slug } = await params;

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <style dangerouslySetInnerHTML={{ __html: `
          * { margin: 0; padding: 0; box-sizing: border-box; }
          html, body { height: 100%; background: transparent; overflow: hidden; }
        ` }} />
      </head>
      <body>
        {/* Widget auto-mounts via the embed script */}
        <script
          src="/widget/embed.js"
          data-org-slug={org_slug}
          data-position="bottom-right"
          defer
        />
      </body>
    </html>
  );
}
