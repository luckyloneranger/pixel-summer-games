// Weekly leaderboard rules, shared by the game and the server (no imports, so
// the server can use this file as it is).

/** Each event the board accepts: which way is better, and believable limits. */
export const BOARD_EVENTS: Record<string, { lowerIsBetter: boolean; min: number; max: number }> = {
  // Races (s): faster than the game allows is impossible; very slow is pointless.
  dash100: { lowerIsBetter: true, min: 9.0, max: 30 },
  hurdles110: { lowerIsBetter: true, min: 11.5, max: 40 },
  // Field events (m).
  longJump: { lowerIsBetter: false, min: 0.01, max: 9.9 },
  highJump: { lowerIsBetter: false, min: 1.85, max: 2.4 },
  javelin: { lowerIsBetter: false, min: 0.01, max: 105 },
};

/** How many names each weekly board shows. */
export const BOARD_SIZE = 10;

export interface BoardEntry {
  initials: string;
  mark: number;
}

/** What the game sends: three letters and a mark for an event. */
export interface Submission {
  event: string;
  initials: string;
  mark: number;
}

/** Is this a believable submission? (Anything else is ignored.) */
export function isValidSubmission(x: unknown): x is Submission {
  if (typeof x !== 'object' || x === null) return false;
  const s = x as Record<string, unknown>;
  const rules = typeof s.event === 'string' ? BOARD_EVENTS[s.event] : undefined;
  if (!rules) return false;
  if (typeof s.initials !== 'string' || !/^[A-Z]{3}$/.test(s.initials)) return false;
  if (typeof s.mark !== 'number' || !Number.isFinite(s.mark)) return false;
  if (Math.abs(Math.round(s.mark * 100) - s.mark * 100) > 1e-6) return false; // marks are to 0.01
  return s.mark >= rules.min && s.mark <= rules.max;
}

/** The ISO week a moment falls in, like "2026-W45" (weeks start on Monday, UTC). */
export function weekId(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  const week1 = Date.UTC(year, 0, 4 - firstDay);
  const week = Math.floor((thursday.getTime() - week1) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Each name's best mark, best first, cut to the board size. */
export function rankBoard(event: string, entries: readonly BoardEntry[]): BoardEntry[] {
  const lower = BOARD_EVENTS[event]?.lowerIsBetter ?? false;
  const better = (a: number, b: number) => (lower ? a < b : a > b);
  const best = new Map<string, number>();
  for (const e of entries) {
    const old = best.get(e.initials);
    if (old === undefined || better(e.mark, old)) best.set(e.initials, e.mark);
  }
  return [...best]
    .map(([initials, mark]) => ({ initials, mark }))
    .sort((a, b) => (lower ? a.mark - b.mark : b.mark - a.mark))
    .slice(0, BOARD_SIZE);
}
