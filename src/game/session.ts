import type { Difficulty, EventId, PlayerInfo } from '../events/event';
import type { TeamKit } from '../gfx/sprites/athlete';
import { Championship } from './championship';

export type Mode = 'championship' | 'practice';

/** One run through the game: who's playing, how hard, and which mode. */
export class Session {
  readonly championship: Championship | null;

  constructor(
    readonly mode: Mode,
    readonly initials: string,
    readonly team: TeamKit,
    readonly difficulty: Difficulty,
    casual: boolean,
    /** Practice only: the event being practised. */
    readonly practiceEvent: EventId | null = null,
  ) {
    this.championship = mode === 'championship' ? new Championship(difficulty, casual) : null;
  }

  get player(): PlayerInfo {
    return { initials: this.initials, team: this.team };
  }
}
