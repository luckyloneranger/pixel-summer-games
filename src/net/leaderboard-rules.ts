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
  tripleJump: { lowerIsBetter: false, min: 0.01, max: 20 },
  poleVault: { lowerIsBetter: false, min: 4.6, max: 6.2 },
  hammer: { lowerIsBetter: false, min: 0.01, max: 90 },
  swim50: { lowerIsBetter: true, min: 19, max: 90 },
};

/** How many names each board shows. */
export const BOARD_SIZE = 10;

/**
 * Races must send the run itself: the position (m) every RUN_SAMPLE seconds.
 * Top speeds and distances here must match tuning.ts (a test checks).
 */
export const RUN_SAMPLE = 0.05; // s between positions (GHOST.SAMPLE)
export const RACE_RULES: Record<string, { distance: number; topSpeed: number }> = {
  dash100: { distance: 100, topSpeed: 11.5 }, // RUNNER.MAX_SPEED
  hurdles110: { distance: 110, topSpeed: 11.5 },
  swim50: { distance: 50, topSpeed: 2.55 }, // SWIMMER.MAX_SPEED
};
const SPEED_SLACK = 1.05; // allow 5% for rounding to the centimetre

/**
 * Does a race's run back up its time? It must start at the line, never move
 * backwards or faster than the game allows, end at the finish, and take as
 * long as the time says.
 */
export function runMatches(event: string, mark: number, run: unknown): boolean {
  const rules = RACE_RULES[event];
  if (!rules) return true; // field events send no run
  if (!Array.isArray(run) || run.length < 10 || run.length > 2000) return false;
  if (!run.every((p) => typeof p === 'number' && Number.isFinite(p))) return false;
  const maxStep = rules.topSpeed * RUN_SAMPLE * SPEED_SLACK;
  if (run[0] > maxStep * 2) return false;
  for (let i = 1; i < run.length; i++) {
    const step = run[i] - run[i - 1];
    if (step < -0.01 || step > maxStep + 0.02) return false;
  }
  if (Math.abs(run[run.length - 1] - rules.distance) > 0.05) return false;
  const runTime = (run.length - 2) * RUN_SAMPLE; // the last sample is the line itself
  return Math.abs(runTime - mark) <= RUN_SAMPLE * 2;
}

export interface BoardEntry {
  initials: string;
  mark: number;
}

/** What the game sends: three letters and a mark for an event (races add the run). */
export interface Submission {
  event: string;
  initials: string;
  mark: number;
  run?: number[];
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
  if (s.mark < rules.min || s.mark > rules.max) return false;
  return runMatches(s.event as string, s.mark, s.run);
}

/** Where a name comes on a board of everyone's best marks (1 = top; 0 if absent). */
export function rankOf(event: string, entries: readonly BoardEntry[], initials: string): number {
  const all = rankBoard(event, entries, Infinity);
  return all.findIndex((e) => e.initials === initials) + 1;
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
export function rankBoard(event: string, entries: readonly BoardEntry[], size = BOARD_SIZE): BoardEntry[] {
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
    .slice(0, size);
}
