import type { Difficulty, EventId } from '../events/event';
import { isBetter } from './scoring';
import { RECORDS } from './tuning';

export interface HighScore {
  initials: string;
  score: number;
  difficulty: Difficulty;
}

export type PersonalBests = Partial<Record<EventId, number>>;

/** Would this score get onto the table? */
export function makesHighScores(table: readonly HighScore[], score: number, kept = RECORDS.HIGH_SCORES_KEPT): boolean {
  if (score <= 0) return false;
  return table.length < kept || score > table[table.length - 1].score;
}

/**
 * Add a score, keep the table sorted highest first and cut it to `kept`.
 * A new score goes below older equal scores. Returns the new table and the
 * entry's position (-1 if it didn't make it).
 */
export function insertHighScore(
  table: readonly HighScore[],
  entry: HighScore,
  kept = RECORDS.HIGH_SCORES_KEPT,
): { table: HighScore[]; position: number } {
  let position = table.findIndex((h) => entry.score > h.score);
  if (position === -1) position = table.length;
  const next = [...table.slice(0, position), entry, ...table.slice(position)].slice(0, kept);
  return { table: next, position: position < kept ? position : -1 };
}

/** Update a personal best. Returns true if the mark is a new best. */
export function updatePersonalBest(bests: PersonalBests, id: EventId, mark: number | null): boolean {
  if (mark === null) return false;
  const old = bests[id];
  if (old !== undefined && !isBetter(id, mark, old)) return false;
  bests[id] = mark;
  return true;
}
