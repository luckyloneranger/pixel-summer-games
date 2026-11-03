import type { Difficulty, EventId, EventResult } from '../events/event';
import { qualifies, scoreResults } from './scoring';

/** Championship order (SPEC section 6). */
export const CHAMPIONSHIP_EVENTS: readonly EventId[] = ['dash100', 'longJump', 'javelin', 'hurdles110'];

export interface Standing {
  name: string;
  playerIndex: number; // 0 for the human, -1 for CPUs
  total: number;
}

export interface EventOutcome {
  results: EventResult[]; // with points filled in
  qualified: boolean;
}

/**
 * Runs a championship: four events in order, points added up per athlete.
 * Missing a qualifying mark ends the run, unless Casual mode is on, in which
 * case you carry on with 0 points for that event.
 */
export class Championship {
  index = 0;
  state: 'playing' | 'gameOver' | 'complete' = 'playing';
  readonly outcomes: EventOutcome[] = [];
  private readonly totals = new Map<string, Standing>();

  constructor(
    readonly difficulty: Difficulty,
    readonly casual: boolean,
  ) {}

  get currentEvent(): EventId {
    return CHAMPIONSHIP_EVENTS[Math.min(this.index, CHAMPIONSHIP_EVENTS.length - 1)];
  }

  /** Score an event's results, add them to the totals and move on. */
  record(results: EventResult[]): EventOutcome {
    const id = this.currentEvent;
    let scored = scoreResults(id, results);
    const me = scored.find((r) => r.playerIndex === 0);
    const qualified = me !== undefined && qualifies(id, me.mark, this.difficulty);
    // Casual mode: missing the mark scores 0 but you carry on.
    if (!qualified && this.casual) scored = scored.map((r) => (r.playerIndex === 0 ? { ...r, points: 0 } : r));

    for (const r of scored) {
      const s = this.totals.get(r.name) ?? { name: r.name, playerIndex: r.playerIndex, total: 0 };
      s.total += r.points;
      this.totals.set(r.name, s);
    }
    const outcome = { results: scored, qualified };
    this.outcomes.push(outcome);

    if (!qualified && !this.casual) this.state = 'gameOver';
    else if (++this.index >= CHAMPIONSHIP_EVENTS.length) this.state = 'complete';
    return outcome;
  }

  get playerTotal(): number {
    for (const s of this.totals.values()) if (s.playerIndex === 0) return s.total;
    return 0;
  }

  /** Everyone ranked by total points, highest first. */
  standings(): Standing[] {
    return [...this.totals.values()].sort((a, b) => b.total - a.total);
  }
}
