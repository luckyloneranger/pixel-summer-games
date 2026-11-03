// The messages online play sends, shared by the game and the relay server
// (server/). The server only relays between the two players in a room; it
// never looks inside game messages except to check they are well formed.

// This file has no imports, so the server can use it without any browser code.
// Event, difficulty and team names travel as plain strings; the game checks
// them when a message arrives.
type EventName = string;
type DifficultyName = string;
type TeamName = string;

/** Bumped whenever the message format changes, so old and new games don't mix. */
export const PROTOCOL_VERSION = 1;
/** Messages bigger than this are dropped (a runner's state is ~200 bytes). */
export const MAX_MESSAGE_BYTES = 2048;

/** Room codes: 4 letters, without I and O (easily mistaken for 1 and 0). */
export const ROOM_CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;

export function makeRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_LETTERS[Math.floor(random() * ROOM_CODE_LETTERS.length)];
  return code;
}

export function isRoomCode(text: string): boolean {
  if (text.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of text) if (!ROOM_CODE_LETTERS.includes(ch)) return false;
  return true;
}

// ---------------------------------------------------------------- server <-> game

/** From the server to a player. */
export type ServerMessage =
  | { t: 'welcome'; slot: 0 | 1; others: number } // you're in; `others` players were already here
  | { t: 'joined' } // the other player arrived
  | { t: 'left' } // the other player disconnected
  | { t: 'full' } // the room already has two players
  | { t: 'relay'; data: GameMessage }; // a message from the other player

/** From a player to the server: always "pass this on". */
export interface ClientMessage {
  t: 'relay';
  data: GameMessage;
}

// ---------------------------------------------------------------- game <-> game

/** One runner's state, sent several times a second during a race. */
export interface RunnerState {
  pos: number; // m
  speed: number; // m/s
  taps: number;
  fin: number | null; // finish time (s after GO)
  react: number | null; // reaction time (s)
  dnf: boolean;
  /** Hurdles only: jump progress (s into the jump or -1), hurdles knocked (bit mask), stumble time left. */
  jump?: number;
  knocked?: number;
  stumble?: number;
}

/** Race start sequence, decided by the host and mirrored by the guest. */
export type StartPhase = 'marks' | 'set' | 'running' | 'falseStart' | 'disqualified';

/** Messages between the two games in a room. */
export type GameMessage =
  | { k: 'hello'; v: number; initials: string; team: TeamName } // who I am (v = PROTOCOL_VERSION)
  | { k: 'setup'; events: EventName[]; difficulty: DifficultyName; seed: number; teams: [TeamName, TeamName] } // host: the match
  | { k: 'ready'; event: number } // I'm on the intro card for event n and pressed Enter
  | { k: 'begin'; event: number } // host: start event n now
  | { k: 'early' } // guest: I pressed a run key before GO
  | { k: 'phase'; phase: StartPhase; who?: number } // host: start sequence moved on (who = false starter)
  | { k: 'state'; s: RunnerState } // my runner, now
  | { k: 'bye' }; // I'm leaving the match on purpose

const GAME_KINDS = new Set(['hello', 'setup', 'ready', 'begin', 'early', 'phase', 'state', 'bye']);

/** Is this a well-formed game message (right shape, known kind)? */
export function isGameMessage(x: unknown): x is GameMessage {
  return typeof x === 'object' && x !== null && GAME_KINDS.has((x as { k?: unknown }).k as string);
}

/** Read a message from the server; null if it's malformed. */
export function parseServerMessage(raw: string): ServerMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null) return null;
  const msg = m as { t?: unknown; slot?: unknown; others?: unknown; data?: unknown };
  switch (msg.t) {
    case 'welcome':
      return (msg.slot === 0 || msg.slot === 1) && typeof msg.others === 'number' ? (m as ServerMessage) : null;
    case 'joined':
    case 'left':
    case 'full':
      return m as ServerMessage;
    case 'relay':
      return isGameMessage(msg.data) ? (m as ServerMessage) : null;
    default:
      return null;
  }
}

/** Read a message from a player (on the server); null if it's malformed. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  try {
    const m = JSON.parse(raw) as { t?: unknown; data?: unknown };
    return m && m.t === 'relay' && isGameMessage(m.data) ? (m as ClientMessage) : null;
  } catch {
    return null;
  }
}
