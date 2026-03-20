/**
 * SSE (Server-Sent Events) Module
 * Sends real-time voice agent updates to the Sales Hub dashboard.
 * Runs on a separate port from the WebSocket server.
 */

import http from 'http';
import type { SSEEvent, SSEEventType } from './types';

type SSEClient = {
  id: string;
  response: http.ServerResponse;
};

const clients: SSEClient[] = [];
let sseServer: http.Server | null = null;

export function startSSEServer(port: number): void {
  sseServer = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      const clientId = `sse_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const client: SSEClient = { id: clientId, response: res };
      clients.push(client);
      console.log(`[sse] Client connected: ${clientId} (${clients.length} total)`);

      // Send heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 30000);

      req.on('close', () => {
        clearInterval(heartbeat);
        const idx = clients.findIndex(c => c.id === clientId);
        if (idx !== -1) clients.splice(idx, 1);
        console.log(`[sse] Client disconnected: ${clientId} (${clients.length} remaining)`);
      });

      // Send initial connection confirmation
      res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
      return;
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', clients: clients.length }));
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  sseServer.listen(port, () => {
    console.log(`[sse] Server listening on port ${port}`);
  });
}

export function stopSSEServer(): void {
  if (sseServer) {
    sseServer.close();
    sseServer = null;
  }
}

/**
 * Broadcast an event to all connected SSE clients.
 */
export function broadcastEvent(type: SSEEventType, callSid: string, data: Record<string, unknown>): void {
  const event: SSEEvent = {
    type,
    callSid,
    data,
    timestamp: new Date(),
  };

  const payload = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;

  for (const client of clients) {
    try {
      client.response.write(payload);
    } catch (error) {
      console.warn(`[sse] Failed to send to client ${client.id}:`, error);
    }
  }
}

export function getConnectedClientCount(): number {
  return clients.length;
}
