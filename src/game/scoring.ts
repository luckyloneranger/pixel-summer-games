import type { Difficulty, EventId, EventResult } from '../events/event';
import { DIFFICULTY_MARKS, SCORING } from './tuning';

/** Races are measured in time (lower is better), field events in distance. */
export const EVENT_KIND: Record<EventId, 'race' | 'field'> = {
  dash100: 'race',
  longJump: 'field',
  highJump: 'field',
  javelin: 'field',
  hurdles110: 'race',
  tripleJump: 'field',
  poleVault: 'field',
  hammer: 'field',
  swim50: 'race',
};

export const EVENT_NAMES: Record<EventId, string> = {
  dash100: '100 M DASH',
  longJump: 'LONG JUMP',
  highJump: 'HIGH JUMP',
  javelin: 'JAVELIN',
  hurdles110: '110 M HURDLES',
  tripleJump: 'TRIPLE JUMP',
  poleVault: 'POLE VAULT',
  hammer: 'HAMMER THROW',
  swim50: '50 M FREESTYLE',
};

/** Points for a mark: 0 at ZERO, 1,000 at PAR, capped at 1,200. No mark = 0. */
export function pointsFor(id: EventId, mark: number | null): number {
  if (mark === null) return 0;
  const { ZERO, PAR } = SCORING[id];
  const raw =
    EVENT_KIND[id] === 'race'
      ? (SCORING.PAR_POINTS * (ZERO - mark)) / (ZERO - PAR)
      : (SCORING.PAR_POINTS * (mark - ZERO)) / (PAR - ZERO);
  return Math.min(SCORING.MAX_POINTS, Math.max(0, Math.round(raw)));
}

/** The qualifying mark for a difficulty (time in s or distance in m, to 0.01). */
export function qualifyingMark(id: EventId, difficulty: Difficulty): number {
  const scale = DIFFICULTY_MARKS[EVENT_KIND[id]][difficulty];
  return Math.round(SCORING[id].QUALIFY * scale * 100) / 100;
}

/** Did this mark reach the qualifying mark? */
export function qualifies(id: EventId, mark: number | null, difficulty: Difficulty): boolean {
  if (mark === null) return false;
  const target = qualifyingMark(id, difficulty);
  return EVENT_KIND[id] === 'race' ? mark <= target : mark >= target;
}

/** Is mark `a` better than mark `b`? (Faster time, or longer distance.) */
export function isBetter(id: EventId, a: number, b: number): boolean {
  return EVENT_KIND[id] === 'race' ? a < b : a > b;
}

/** Fill in the points for every result (fouls, DQs and no marks score 0). */
export function scoreResults(id: EventId, results: EventResult[]): EventResult[] {
  return results.map((r) => ({
    ...r,
    points: r.disqualified || r.mark === null ? 0 : pointsFor(id, r.mark),
  }));
}

/** "12.00 S" or "7.00 M". */
export function formatMark(id: EventId, mark: number | null): string {
  if (mark === null) return '-';
  return `${mark.toFixed(2)} ${EVENT_KIND[id] === 'race' ? 'S' : 'M'}`;
}

export type Medal = 'gold' | 'silver' | 'bronze';
export const MEDALS: Medal[] = ['gold', 'silver', 'bronze'];
