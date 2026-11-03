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
  /** Replaced by a reconnect of the same player: ignore it from now on. */
  replaced?: boolean;
}

function seatOf(ws: WebSocket): Seat {
  return ws.deserializeAttachment() as Seat;
}

/** One room: at most two players; relays messages between them. */
export class Room extends DurableObject<Env> {
  /** Sockets of players in the room (not ones replaced by a reconnect). */
  private seated(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => !seatOf(ws).replaced);
  }

  async fetch(request: Request): Promise<Response> {
    const [client, server] = Object.values(new WebSocketPair());
    let seated = this.seated();

    // A player coming back after a drop asks for their old seat. Their old
    // socket may still look open here (the drop isn't noticed yet): replace it.
    const wanted = new URL(request.url).searchParams.get('slot');
    if (wanted === '0' || wanted === '1') {
      const slot = Number(wanted) as 0 | 1;
      const stale = seated.find((ws) => seatOf(ws).slot === slot);
      if (stale) {
        stale.serializeAttachment({ slot, replaced: true } satisfies Seat);
        try {
          stale.close(4001, 'Replaced by reconnect');
        } catch {
          // already closing
        }
        seated = this.seated();
      }
    }

    if (seated.length >= 2) {
      // Room is full: say so and close (this socket isn't kept by the room).
      server.accept();
      send(server, { t: 'full' });
      server.close(4000, 'Room full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const taken = new Set(seated.map((ws) => seatOf(ws).slot));
    const slot: 0 | 1 =
      (wanted === '0' || wanted === '1') && !taken.has(Number(wanted) as 0 | 1)
        ? (Number(wanted) as 0 | 1)
        : taken.has(0)
          ? 1
          : 0;
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ slot } satisfies Seat);
    send(server, { t: 'welcome', slot, others: seated.length });
    // fresh: a new player, not one coming back after a drop.
    for (const other of seated) send(other, { t: 'joined', fresh: wanted === null });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (seatOf(ws).replaced) return;
    if (typeof message !== 'string' || !parseClientMessage(message)) return; // ignore anything malformed
    for (const other of this.seated()) {
      if (other !== ws) send(other, message); // same shape: { t: 'relay', data, seq?, ack? }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.leave(ws);
    try {
      ws.close(code, reason);
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private leave(ws: WebSocket): void {
    if (seatOf(ws).replaced) return; // the player is still here, on a new socket
    for (const other of this.seated()) if (other !== ws) send(other, { t: 'left' });
  }
}

function send(ws: WebSocket, m: ServerMessage | string): void {
  try {
    ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  } catch {
    // the socket is already closing
  }
}
