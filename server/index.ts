// Pixel Summer Games room relay (Cloudflare Worker + Durable Objects).
// Each room code maps to one Durable Object that passes messages between the
// two players in it. Nothing is stored: a room disappears when both leave.

import { DurableObject } from 'cloudflare:workers';
import { isRoomCode, parseClientMessage, type ServerMessage } from '../src/net/protocol';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // /room/ABCD with a WebSocket upgrade joins (or opens) that room.
    const match = /^\/room\/([A-Z]{4})$/.exec(url.pathname);
    if (match && isRoomCode(match[1])) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      return env.ROOMS.getByName(match[1]).fetch(request);
    }
    if (url.pathname === '/') return new Response('Pixel Summer Games rooms: OK\n');
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

interface Seat {
  slot: 0 | 1;
}

/** One room: at most two players; relays messages between them. */
export class Room extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    const seated = this.ctx.getWebSockets();
    if (seated.length >= 2) {
      // Room is full: say so and close (this socket isn't kept by the room).
      server.accept();
      send(server, { t: 'full' });
      server.close(4000, 'Room full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const taken = new Set(seated.map((ws) => (ws.deserializeAttachment() as Seat).slot));
    const slot: 0 | 1 = taken.has(0) ? 1 : 0;
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ slot } satisfies Seat);
    send(server, { t: 'welcome', slot, others: seated.length });
    for (const other of seated) send(other, { t: 'joined' });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string' || !parseClientMessage(message)) return; // ignore anything malformed
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) other.send(message); // same shape: { t: 'relay', data }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.leave(ws);
    ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private leave(ws: WebSocket): void {
    for (const other of this.ctx.getWebSockets()) if (other !== ws) send(other, { t: 'left' });
  }
}

function send(ws: WebSocket, m: ServerMessage): void {
  try {
    ws.send(JSON.stringify(m));
  } catch {
    // the socket is already closing
  }
}
