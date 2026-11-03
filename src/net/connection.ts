import { NET } from '../game/tuning';
import {
  PROTOCOL_VERSION,
  UNRELIABLE_KINDS,
  parseServerMessage,
  type ClientMessage,
  type Envelope,
  type GameMessage,
} from './protocol';

/**
 * Where the room server lives. Set VITE_ROOMS_URL when building for the web
 * (GitHub Actions does this); locally it's `wrangler dev` on port 8787.
 */
export const ROOMS_URL: string = (import.meta.env.VITE_ROOMS_URL as string | undefined) ?? 'ws://127.0.0.1:8787';

/**
 * connecting: first connection in progress. open: in the room.
 * reconnecting: dropped mid-match, trying to get back. lost: gave up.
 * full / failed: couldn't get in at all. closed: we left on purpose.
 */
export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'lost' | 'full' | 'failed' | 'closed';

/** The bits of a WebSocket we use (so tests can pass a fake). */
export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

/** Things the connection needs from the outside world (swappable in tests). */
export interface ConnectionEnv {
  makeSocket(url: string): SocketLike;
  /** Milliseconds, for the reconnect window. */
  now(): number;
  /** Run `fn` after `ms` milliseconds. */
  later(fn: () => void, ms: number): void;
}

const browserEnv: ConnectionEnv = {
  makeSocket: (url) => new WebSocket(url) as unknown as SocketLike,
  now: () => performance.now(),
  later: (fn, ms) => void setTimeout(fn, ms),
};

/**
 * One player's connection to a room. Messages from the other player wait in
 * an inbox until the game takes them during its update, like key presses.
 *
 * Important messages are numbered and kept until the other player confirms
 * them, and are sent again after a reconnect, so a short drop loses nothing.
 * If our own connection drops mid-match we reconnect to the same seat.
 */
export class RoomConnection {
  state: ConnectionState = 'connecting';
  /** 0 = host (first in the room), 1 = guest. */
  slot: 0 | 1 | null = null;
  /** Players already in the room when we first arrived. */
  othersOnArrival = 0;
  /** Is the other player connected right now? */
  peerHere = false;
  /** Did the other player drop or leave after being here? */
  peerLeft = false;
  /** Did the other player say they're leaving on purpose? */
  peerSaidBye = false;
  private peerGoneAt = 0; // ms
  private droppedAt = 0; // ms, when our own connection dropped
  private ws: SocketLike;
  private readonly inbox: GameMessage[] = [];
  /** Numbered messages the other player hasn't confirmed yet. */
  private readonly outbox: { seq: number; data: GameMessage }[] = [];
  private nextSeq = 1;
  /** Highest numbered message received so far (they arrive in order). */
  private received = 0;
  private everOpen = false;

  constructor(
    readonly code: string,
    private readonly baseUrl: string = ROOMS_URL,
    private readonly env: ConnectionEnv = browserEnv,
  ) {
    this.ws = this.open();
  }

  private open(slot?: number): SocketLike {
    const query = slot === undefined ? '' : `?slot=${slot}`;
    const ws = this.env.makeSocket(`${this.baseUrl.replace(/\/$/, '')}/room/${this.code}${query}`);
    ws.onmessage = (ev) => {
      if (ws === this.ws) this.receive(ev.data);
    };
    ws.onclose = () => {
      if (ws === this.ws) this.dropped();
    };
    ws.onerror = () => {
      if (ws === this.ws) this.dropped();
    };
    return ws;
  }

  /** Our socket closed without us asking. */
  private dropped(): void {
    switch (this.state) {
      case 'connecting':
        this.state = 'failed';
        return;
      case 'open':
        // Mid-match drop: try to get back into the same seat for a while.
        this.state = 'reconnecting';
        this.droppedAt = this.env.now();
        this.peerHere = false;
        this.retrySoon();
        return;
      case 'reconnecting':
        this.retrySoon();
        return;
      default:
        return;
    }
  }

  private retrySoon(): void {
    this.env.later(() => {
      if (this.state !== 'reconnecting') return;
      if (this.env.now() - this.droppedAt > NET.RECONNECT_WINDOW * 1000) {
        this.state = 'lost';
        return;
      }
      this.ws = this.open(this.slot ?? undefined);
    }, NET.RECONNECT_DELAY * 1000);
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string') return;
    const m = parseServerMessage(raw);
    if (!m) return;
    switch (m.t) {
      case 'welcome':
        if (!this.everOpen) this.othersOnArrival = m.others;
        this.everOpen = true;
        this.state = 'open';
        this.slot = m.slot;
        this.peerHere = m.others > 0;
        if (this.peerHere) this.peerLeft = false;
        this.resendUnconfirmed();
        break;
      case 'joined':
        if (m.fresh) {
          // Someone new (not a reconnect): start numbering from scratch with them.
          this.received = 0;
          this.outbox.length = 0;
          this.peerSaidBye = false;
        }
        this.peerHere = true;
        this.peerLeft = false;
        this.resendUnconfirmed(); // anything sent while they were away
        break;
      case 'left':
        this.peerHere = false;
        this.peerLeft = true;
        this.peerGoneAt = this.env.now();
        break;
      case 'full':
        if (this.state === 'reconnecting') this.retrySoon(); // our old seat may not be free yet
        else this.state = 'full';
        break;
      case 'relay':
        this.accept(m);
        break;
    }
  }

  /** Take in a message from the other player, dropping repeats. */
  private accept(env: Envelope): void {
    if (env.ack !== undefined) this.confirmed(env.ack);
    if (env.seq !== undefined) {
      if (env.seq <= this.received) {
        this.sendRaw({ data: { k: 'ack' } }); // a repeat: just confirm again
        return;
      }
      // A gap means an earlier one was lost in a drop; it'll be resent, in order.
      if (env.seq > this.received + 1) return;
      this.received = env.seq;
      this.sendRaw({ data: { k: 'ack' } });
    }
    if (env.data.k === 'ack') return;
    if (env.data.k === 'bye') this.peerSaidBye = true;
    this.inbox.push(env.data);
  }

  /** The other player has everything up to `upTo`: stop keeping those. */
  private confirmed(upTo: number): void {
    while (this.outbox.length && this.outbox[0].seq <= upTo) this.outbox.shift();
  }

  private resendUnconfirmed(): void {
    for (const m of this.outbox) this.sendRaw({ data: m.data, seq: m.seq });
  }

  /** Send a message to the other player. Important ones are kept until confirmed. */
  send(data: GameMessage): void {
    if (UNRELIABLE_KINDS.has(data.k)) {
      this.sendRaw({ data });
      return;
    }
    const seq = this.nextSeq++;
    this.outbox.push({ seq, data });
    this.sendRaw({ data, seq });
  }

  private sendRaw(env: Envelope): void {
    if (this.state !== 'open') return; // kept in the outbox (if numbered) until we're back
    const msg: ClientMessage = { t: 'relay', ...env, ack: this.received };
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      // the socket is closing; its close handler will reconnect
    }
  }

  /** Remove and return waiting messages of the given kinds (oldest first). */
  take<K extends GameMessage['k']>(...kinds: K[]): Extract<GameMessage, { k: K }>[] {
    const out: Extract<GameMessage, { k: K }>[] = [];
    for (let i = 0; i < this.inbox.length; ) {
      const m = this.inbox[i];
      if ((kinds as string[]).includes(m.k)) {
        out.push(m as Extract<GameMessage, { k: K }>);
        this.inbox.splice(i, 1);
      } else {
        i++;
      }
    }
    return out;
  }

  /** Seconds the other player has been gone (0 if they're here). */
  peerAwayFor(): number {
    return this.peerLeft && !this.peerHere ? (this.env.now() - this.peerGoneAt) / 1000 : 0;
  }

  /** Seconds left to reconnect our own dropped connection. */
  reconnectSecondsLeft(): number {
    return Math.max(0, NET.RECONNECT_WINDOW - (this.env.now() - this.droppedAt) / 1000);
  }

  /** Leave on purpose (tells the other player first). */
  close(): void {
    if (this.state === 'open') this.send({ k: 'bye' });
    this.state = 'closed';
    try {
      this.ws.close();
    } catch {
      // already closed
    }
  }
}

/** Our "hello" message. */
export function helloMessage(initials: string, team: string): GameMessage {
  return { k: 'hello', v: PROTOCOL_VERSION, initials, team };
}
