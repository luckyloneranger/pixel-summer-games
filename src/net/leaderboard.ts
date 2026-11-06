// Talks to the weekly leaderboard on the game server. Only used when the
// player has turned the leaderboard on in Options.

import { ROOMS_URL } from './connection';
import { BOARD_EVENTS, RACE_RULES, type BoardEntry } from './leaderboard-rules';

/** Where a new best came on the boards (1 = top). */
export interface Ranks {
  weekRank: number;
  allTimeRank: number;
}

/** The server's web address (the rooms address, but http(s) instead of ws(s)). */
export function boardUrl(roomsUrl = ROOMS_URL): string {
  return roomsUrl.replace(/^ws/, 'http').replace(/\/$/, '');
}

/** Does the board take marks for this event? */
export function onBoard(event: string): boolean {
  return event in BOARD_EVENTS;
}

/** Races only count with the run that backs them up (see leaderboard-rules.ts). */
export function needsRun(event: string): boolean {
  return event in RACE_RULES;
}

/** Send a new personal best; the answer says where it ranks. Null if it didn't go (the game carries on). */
export async function submitMark(event: string, initials: string, mark: number, run?: readonly number[] | null, base = boardUrl()): Promise<Ranks | null> {
  if (!onBoard(event) || (needsRun(event) && !run)) return null;
  try {
    const res = await fetch(`${base}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run ? { event, initials, mark, run } : { event, initials, mark }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<Ranks>;
    return typeof body.weekRank === 'number' && typeof body.allTimeRank === 'number'
      ? { weekRank: body.weekRank, allTimeRank: body.allTimeRank }
      : null;
  } catch {
    return null;
  }
}

/** This week's top 10 for an event, or null if the server can't be reached. */
export async function fetchBoard(event: string, base = boardUrl()): Promise<{ week: string; rows: BoardEntry[]; allTime: BoardEntry[] } | null> {
  try {
    const res = await fetch(`${base}/scores/${event}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { week?: unknown; rows?: unknown; allTime?: unknown };
    if (typeof body.week !== 'string' || !Array.isArray(body.rows)) return null;
    const clean = (list: unknown[]) =>
      list.filter(
        (r): r is BoardEntry =>
          typeof (r as BoardEntry)?.initials === 'string' && /^[A-Z]{3}$/.test((r as BoardEntry).initials) && typeof (r as BoardEntry)?.mark === 'number',
      );
    return { week: body.week, rows: clean(body.rows), allTime: clean(Array.isArray(body.allTime) ? body.allTime : []) };
  } catch {
    return null;
  }
}
