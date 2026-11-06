// Pixel Summer Games room relay (Cloudflare Worker + Durable Objects).
// Each room code maps to one Durable Object that passes messages between the
// two players in it. Nothing is stored: a room disappears when both leave.

import { DurableObject } from 'cloudflare:workers';
import { isRoomCode, parseClientMessage, type ServerMessage } from '../src/net/protocol';
import { BOARD_EVENTS, isValidSubmission, rankBoard, rankOf, weekId, type BoardEntry, type Submission } from '../src/net/leaderboard-rules';

const MAX_SUBMISSION_BYTES = 8192; // a 30 s swim's run is about 4 KB
const SUBMITS_PER_HOUR = 20; // per connection address, to slow down spam
const WEEKS_KEPT = 4; // older weeks are deleted

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  BOARD: DurableObjectNamespace<Leaderboard>;
}

/** Lets the game (on another website) call the leaderboard. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
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
    // Weekly leaderboard: GET /scores/EVENT for the top 10, POST /scores to send a mark.
    if (url.pathname.startsWith('/scores')) {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      const board = env.BOARD.getByName('global');
      const event = /^\/scores\/([a-zA-Z0-9]+)$/.exec(url.pathname)?.[1];
      if (request.method === 'GET' && event) return board.top(event).then((rows) => json(rows));
      if (request.method === 'POST' && url.pathname === '/scores') {
        const text = await request.text();
        if (text.length > MAX_SUBMISSION_BYTES) return json({ ok: false }, 413);
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          return json({ ok: false }, 400);
        }
        if (!isValidSubmission(body)) return json({ ok: false }, 400);
        const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
        const ranks = await board.submit(body, ip);
        return ranks ? json({ ok: true, ...ranks }) : json({ ok: false }, 429);
      }
      return json({ ok: false }, 404);
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

/**
 * The weekly leaderboard: one Durable Object for everyone, with a small SQLite
 * table of (week, event, initials, mark). Only the best mark per name shows.
 */
export class Leaderboard extends DurableObject<Env> {
  private readonly recent = new Map<string, number[]>(); // address -> submit times (ms)

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS scores (week TEXT NOT NULL, event TEXT NOT NULL, initials TEXT NOT NULL, mark REAL NOT NULL, at INTEGER NOT NULL)',
    );
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS by_board ON scores (week, event)');
    // Everyone's best mark ever, one row per name and event.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS best (event TEXT NOT NULL, initials TEXT NOT NULL, mark REAL NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (event, initials))',
    );
  }

  private weekRows(event: string, week: string): BoardEntry[] {
    return this.ctx.storage.sql
      .exec<{ initials: string; mark: number }>('SELECT initials, mark FROM scores WHERE week = ? AND event = ?', week, event)
      .toArray();
  }

  private bestRows(event: string): BoardEntry[] {
    return this.ctx.storage.sql.exec<{ initials: string; mark: number }>('SELECT initials, mark FROM best WHERE event = ?', event).toArray();
  }

  /** This week's top marks for an event. */
  async top(event: string): Promise<{ week: string; rows: BoardEntry[]; allTime: BoardEntry[] }> {
    const week = weekId(Date.now());
    return { week, rows: rankBoard(event, this.weekRows(event, week)), allTime: rankBoard(event, this.bestRows(event)) };
  }

  /** Save a mark (already checked) and say where it ranks. Null if this address is sending too many. */
  async submit(s: Submission, address: string): Promise<{ weekRank: number; allTimeRank: number } | null> {
    const now = Date.now();
    const times = (this.recent.get(address) ?? []).filter((t) => now - t < 3_600_000);
    if (times.length >= SUBMITS_PER_HOUR) return null;
    times.push(now);
    this.recent.set(address, times);
    const week = weekId(now);
    this.ctx.storage.sql.exec('INSERT INTO scores VALUES (?, ?, ?, ?, ?)', week, s.event, s.initials, s.mark, now);
    this.ctx.storage.sql.exec('DELETE FROM scores WHERE week < ?', weekId(now - WEEKS_KEPT * 7 * 86_400_000));
    // Keep the all-time best per name: insert, or replace only with a better mark.
    const better = BOARD_EVENTS[s.event].lowerIsBetter ? 'excluded.mark < best.mark' : 'excluded.mark > best.mark';
    this.ctx.storage.sql.exec(
      `INSERT INTO best VALUES (?, ?, ?, ?) ON CONFLICT (event, initials) DO UPDATE SET mark = excluded.mark, at = excluded.at WHERE ${better}`,
      s.event,
      s.initials,
      s.mark,
      now,
    );
    return {
      weekRank: rankOf(s.event, this.weekRows(s.event, week), s.initials),
      allTimeRank: rankOf(s.event, this.bestRows(s.event), s.initials),
    };
  }
}

function send(ws: WebSocket, m: ServerMessage | string): void {
  try {
    ws.send(typeof m === 'string' ? m : JSON.stringify(m));
  } catch {
    // the socket is already closing
  }
}
