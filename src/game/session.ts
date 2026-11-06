import type { Difficulty, EventId, PlayerInfo } from '../events/event';
import type { TeamKit } from '../gfx/sprites/athlete';
import { CHAMPIONSHIP_EVENTS, Championship } from './championship';
import type { RoomConnection } from '../net/connection';

export type Mode = 'championship' | 'practice' | 'versus';

/** An online match: the connection and which player is on this device. */
export interface OnlineMatch {
  conn: RoomConnection;
  /** 0 = host, 1 = guest. */
  localIndex: number;
  /** Shared random seed, so both games run the same CPUs and start timing. */
  seed: number;
}

/** A human in this session. */
export interface SessionPlayer {
  initials: string;
  team: TeamKit;
}

/** One run through the game: who's playing, how hard, and which mode. */
export class Session {
  /** The series of events with running totals (championship or versus); null in practice. */
  readonly series: Championship | null;

  constructor(
    readonly mode: Mode,
    readonly players: SessionPlayer[],
    readonly difficulty: Difficulty,
    casual: boolean,
    /** Practice: the event being practised. Versus: the events chosen. */
    events: readonly EventId[] = CHAMPIONSHIP_EVENTS,
    /** Online Versus: the match link (null for local play). */
    readonly online: OnlineMatch | null = null,
  ) {
    if (mode === 'championship') {
      this.series = new Championship(difficulty, casual, players.length, events);
    } else if (mode === 'versus') {
      this.series = new Championship(difficulty, false, players.length, events, false);
    } else {
      this.series = null;
    }
    this.practiceEvent = mode === 'practice' ? events[0] : null;
  }

  readonly practiceEvent: EventId | null;

  /** Player 1. */
  get initials(): string {
    return this.players[0].initials;
  }

  /** Humans taking part in the next event (knocked-out players sit out). */
  activePlayers(): PlayerInfo[] {
    const active = this.series ? this.series.activePlayers() : this.players.map((_, i) => i);
    return active.map((i) => ({ initials: this.players[i].initials, team: this.players[i].team, index: i }));
  }
}
