import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Rng } from '../core/rng';

export type EventId = 'dash100' | 'longJump' | 'javelin' | 'hurdles110';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface PlayerInfo {
  initials: string;
}

/** What an event needs to start. */
export interface EventContext {
  players: PlayerInfo[];
  difficulty: Difficulty;
  rng: Rng;
}

/** One player's outcome of an event. */
export interface EventResult {
  /** 0 or 1 for humans, -1 for CPU athletes. */
  playerIndex: number;
  name: string;
  /** Races only: lane number, 1 = top lane. */
  lane?: number;
  /** Time in s (races) or distance in m (field events); null = no mark. */
  mark: number | null;
  foul: boolean;
  disqualified: boolean;
  /** Filled in by scoring in Phase 6; 0 until then. */
  points: number;
  /** Races only: seconds from GO to the first valid tap. */
  reactionTime?: number;
}

/** Every event implements this, so the championship code treats them all the same. */
export interface AthleticsEvent {
  id: EventId;
  name: string;
  kind: 'race' | 'field';
  attempts: number; // 1 for races, 3 for field events
  init(ctx: EventContext): void;
  update(dt: number, input: InputSnapshot): void; // logic only, no drawing
  render(r: Renderer): void; // drawing only, no logic
  isFinished(): boolean;
  getResults(): EventResult[];
  /** Extra lines for the debug overlay. */
  debugLines?(): string[];
}
