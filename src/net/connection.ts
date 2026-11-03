import {
  PROTOCOL_VERSION,
  parseServerMessage,
  type ClientMessage,
  type GameMessage,
} from './protocol';

/**
 * Where the room server lives. Set VITE_ROOMS_URL when building for the web
 * (GitHub Actions does this); locally it's `wrangler dev` on port 8787.
 */
export const ROOMS_URL: string = (import.meta.env.VITE_ROOMS_URL as string | undefined) ?? 'ws://127.0.0.1:8787';

export type ConnectionState = 'connecting' | 'open' | 'full' | 'failed' | 'closed';

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

/**
 * One player's connection to a room. Messages from the other player wait in
 * an inbox until the game takes them during its update, just like key presses.
 */
export class RoomConnection {
  state: ConnectionState = 'connecting';
  /** 0 = host (first in the room), 1 = guest. */
  slot: 0 | 1 | null = null;
  /** Players already in the room when we arrived. */
  othersOnArrival = 0;
  /** Is the other player connected right now? */
  peerHere = false;
  /** Did the other player leave after being here? */
  peerLeft = false;
  private readonly inbox: GameMessage[] = [];
  private readonly ws: SocketLike;

  constructor(
    readonly code: string,
    baseUrl: string = ROOMS_URL,
    makeSocket: (url: string) => SocketLike = (url) => new WebSocket(url) as unknown as SocketLike,
  ) {
    this.ws = makeSocket(`${baseUrl.replace(/\/$/, '')}/room/${code}`);
    this.ws.onmessage = (ev) => this.receive(ev.data);
    this.ws.onclose = () => {
      if (this.state === 'open') this.state = 'closed';
      else if (this.state === 'connecting') this.state = 'failed';
    };
    this.ws.onerror = () => {
      if (this.state === 'connecting') this.state = 'failed';
    };
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') return;
    const m = parseServerMessage(data);
    if (!m) return;
    switch (m.t) {
      case 'welcome':
        this.state = 'open';
        this.slot = m.slot;
        this.othersOnArrival = m.others;
        this.peerHere = m.others > 0;
        break;
      case 'joined':
        this.peerHere = true;
        this.peerLeft = false;
        break;
      case 'left':
        this.peerHere = false;
        this.peerLeft = true;
        break;
      case 'full':
        this.state = 'full';
        break;
      case 'relay':
        this.inbox.push(m.data);
        break;
    }
  }

  /** Send a message to the other player (dropped if not connected). */
  send(data: GameMessage): void {
    if (this.state !== 'open') return;
    const msg: ClientMessage = { t: 'relay', data };
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      // the socket is closing; the close handler will report it
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

  /** Leave on purpose (tells the other player first). */
  close(): void {
    this.send({ k: 'bye' });
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
