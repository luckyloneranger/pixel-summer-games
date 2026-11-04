import type { Difficulty, EventId, EventResult } from '../events/event';
import { qualifies, scoreResults } from './scoring';

/** Championship order (SPEC section 6, decathlon order since the high jump joined in Phase 10). */
export const CHAMPIONSHIP_EVENTS: readonly EventId[] = ['dash100', 'longJump', 'highJump', 'javelin', 'hurdles110'];

/** Every event in the game (Practice, Versus and bests list them all). */
export const ALL_EVENTS: readonly EventId[] = [...CHAMPIONSHIP_EVENTS, 'tripleJump', 'poleVault', 'hammer', 'swim50'];

/** Events that can be played online (the hammer is offline only for now). */
export const ONLINE_EVENTS: readonly EventId[] = ALL_EVENTS.filter((id) => id !== 'hammer');

export interface Standing {
  name: string;
  playerIndex: number; // 0 or 1 for humans, -1 for CPUs
  total: number;
}

export interface EventOutcome {
  results: EventResult[]; // with points filled in
  /** True if every human who took part reached the mark (always true without qualifying). */
  qualified: boolean;
  /** Per human (by player index): did they reach the mark? */
  qualifiedPlayers: Record<number, boolean>;
  /** Humans knocked out by this event. */
  eliminated: number[];
}

/**
 * A series of events with points added up per athlete: the championship
 * (with qualifying marks) or Versus (without). With qualifying, a human who
 * misses a mark is out and sits out the rest; the run ends when every human
 * is out. Casual mode scores 0 for a missed mark instead of knocking you out.
 */
export class Championship {
  index = 0;
  state: 'playing' | 'gameOver' | 'complete' = 'playing';
  readonly outcomes: EventOutcome[] = [];
  readonly eliminated = new Set<number>();
  private readonly totals = new Map<string, Standing>();

  constructor(
    readonly difficulty: Difficulty,
    readonly casual: boolean,
    readonly players = 1,
    readonly events: readonly EventId[] = CHAMPIONSHIP_EVENTS,
    readonly qualifying = true,
  ) {
    // Humans start on the table with 0, even before they score.
    for (let i = 0; i < players; i++) this.totals.set(keyOf(i, ''), { name: '', playerIndex: i, total: 0 });
  }

  get currentEvent(): EventId {
    return this.events[Math.min(this.index, this.events.length - 1)];
  }

  /** Player indexes still in the run. */
  activePlayers(): number[] {
    const list: number[] = [];
    for (let i = 0; i < this.players; i++) if (!this.eliminated.has(i)) list.push(i);
    return list;
  }

  /** Score an event's results, add them to the totals and move on. */
  record(results: EventResult[]): EventOutcome {
    const id = this.currentEvent;
    const qualifiedPlayers: Record<number, boolean> = {};
    const eliminated: number[] = [];
    const scored = scoreResults(id, results).map((r) => {
      if (r.playerIndex < 0) return r;
      const ok = !this.qualifying || qualifies(id, r.mark, this.difficulty);
      qualifiedPlayers[r.playerIndex] = ok;
      if (ok) return r;
      // Missed the mark: Casual scores 0 and carries on; otherwise you're out.
      if (!this.casual) {
        this.eliminated.add(r.playerIndex);
        eliminated.push(r.playerIndex);
      }
      return { ...r, points: 0 };
    });

    for (const r of scored) {
      const key = keyOf(r.playerIndex, r.name);
      const s = this.totals.get(key) ?? { name: r.name, playerIndex: r.playerIndex, total: 0 };
      s.name = r.name;
      s.total += r.points;
      this.totals.set(key, s);
    }
    const qualified = Object.values(qualifiedPlayers).every(Boolean);
    const outcome = { results: scored, qualified, qualifiedPlayers, eliminated };
    this.outcomes.push(outcome);

    if (this.activePlayers().length === 0) this.state = 'gameOver';
    else if (++this.index >= this.events.length) this.state = 'complete';
    return outcome;
  }

  /** A human's total points (player 1 by default). */
  playerTotal(playerIndex = 0): number {
    return this.totals.get(keyOf(playerIndex, ''))?.total ?? 0;
  }

  /** Everyone who has scored, ranked by total points, highest first. */
  standings(): Standing[] {
    return [...this.totals.values()].filter((s) => s.name !== '').sort((a, b) => b.total - a.total);
  }
}

/** Humans are tracked by player number (initials could match), CPUs by name. */
function keyOf(playerIndex: number, name: string): string {
  return playerIndex >= 0 ? `#${playerIndex}` : name;
}
