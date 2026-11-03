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
export const PROTOCOL_VERSION = 2;
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
  | { t: 'joined'; fresh?: boolean } // the other player arrived (fresh: someone new, not a reconnect)
  | { t: 'left' } // the other player disconnected
  | { t: 'full' } // the room already has two players
  | ({ t: 'relay' } & Envelope); // a message from the other player

/**
 * How a game message travels. Important messages carry a number (`seq`) and
 * are kept until the other side confirms them (`ack` = the highest number it
 * has received), so nothing is lost if a connection drops and comes back.
 */
export interface Envelope {
  data: GameMessage;
  seq?: number;
  ack?: number;
}

/** From a player to the server: always "pass this on". */
export interface ClientMessage extends Envelope {
  t: 'relay';
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
  | { k: 'field'; n: number; x: number; speed: number; angle: number; phase: FieldRunPhase } // my run-up, now
  | { k: 'release'; n: number; x: number; speed: number; angle: number } // I let go here (attempt n)
  | { k: 'landed'; n: number; mark: number | null } // the official mark for attempt n
  | { k: 'foul'; n: number; reason: string } // attempt n was a foul
  | { k: 'ack' } // nothing to say; just confirming what I've received
  | { k: 'bye' }; // I'm leaving the match on purpose

/** The part of a field-event attempt before letting go. */
export type FieldRunPhase = 'ready' | 'runup' | 'hold';

const GAME_KINDS = new Set([
  'hello', 'setup', 'ready', 'begin', 'early', 'phase', 'state',
  'field', 'release', 'landed', 'foul', 'ack', 'bye',
]);

/**
 * Messages that only matter as "the latest": sent without a number and never
 * resent (a newer one is always on its way).
 */
export const UNRELIABLE_KINDS: ReadonlySet<string> = new Set(['state', 'field', 'ack']);

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
    const m = JSON.parse(raw) as { t?: unknown; data?: unknown; seq?: unknown; ack?: unknown };
    if (!m || m.t !== 'relay' || !isGameMessage(m.data)) return null;
    if (m.seq !== undefined && typeof m.seq !== 'number') return null;
    if (m.ack !== undefined && typeof m.ack !== 'number') return null;
    return m as ClientMessage;
  } catch {
    return null;
  }
}
