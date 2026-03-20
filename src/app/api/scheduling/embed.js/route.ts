/**
 * GET /api/scheduling/embed.js — Embeddable JavaScript snippet.
 *
 * Usage on external sites:
 *   <script src="https://saleshub.mikegrowsgreens.com/api/scheduling/embed.js"
 *           data-org="org-slug"
 *           data-event="event-slug"></script>
 *
 * Or with a container:
 *   <div id="saleshub-booking"></div>
 *   <script src="..." data-org="slug" data-event="slug" data-container="saleshub-booking"></script>
 */

import { NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://saleshub.mikegrowsgreens.com';

const EMBED_SCRIPT = `
(function() {
  'use strict';

  // Find the script tag to read data attributes
  var scripts = document.querySelectorAll('script[src*="scheduling/embed.js"]');
  var script = scripts[scripts.length - 1];
  if (!script) return;

  var orgSlug = script.getAttribute('data-org');
  var eventSlug = script.getAttribute('data-event');
  var containerId = script.getAttribute('data-container');
  var width = script.getAttribute('data-width') || '100%';
  var height = script.getAttribute('data-height') || '700';

  if (!orgSlug) {
    console.error('[SalesHub] data-org attribute is required');
    return;
  }

  // Build the booking URL
  var baseUrl = '${BASE_URL}';
  var bookingUrl = eventSlug
    ? baseUrl + '/book/' + encodeURIComponent(orgSlug) + '/' + encodeURIComponent(eventSlug) + '?embed=true'
    : baseUrl + '/book/' + encodeURIComponent(orgSlug) + '?embed=true';

  // Create iframe
  var iframe = document.createElement('iframe');
  iframe.src = bookingUrl;
  iframe.style.width = typeof width === 'string' && width.includes('%') ? width : width + 'px';
  iframe.style.height = height + 'px';
  iframe.style.border = 'none';
  iframe.style.borderRadius = '12px';
  iframe.style.overflow = 'hidden';
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.setAttribute('title', 'Book a Meeting');

  // Listen for messages from the iframe to resize
  window.addEventListener('message', function(e) {
    if (e.origin !== baseUrl) return;
    try {
      var data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (data.type === 'saleshub:resize' && data.height) {
        iframe.style.height = data.height + 'px';
      }
      if (data.type === 'saleshub:booked') {
        // Dispatch custom event on the container/document
        var target = containerId ? document.getElementById(containerId) : document;
        if (target) {
          target.dispatchEvent(new CustomEvent('saleshub:booked', { detail: data.booking }));
        }
      }
    } catch(ex) {}
  });

  // Insert iframe
  var container = containerId ? document.getElementById(containerId) : null;
  if (container) {
    container.appendChild(iframe);
  } else {
    // Insert after the script tag
    script.parentNode.insertBefore(iframe, script.nextSibling);
  }
})();
`.trim();

export async function GET() {
  return new NextResponse(EMBED_SCRIPT, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
