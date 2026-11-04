// Talks to the weekly leaderboard on the game server. Only used when the
// player has turned the leaderboard on in Options.

import { ROOMS_URL } from './connection';
import { BOARD_EVENTS, type BoardEntry } from './leaderboard-rules';

/** The server's web address (the rooms address, but http(s) instead of ws(s)). */
export function boardUrl(roomsUrl = ROOMS_URL): string {
  return roomsUrl.replace(/^ws/, 'http').replace(/\/$/, '');
}

/** Does the board take marks for this event? */
export function onBoard(event: string): boolean {
  return event in BOARD_EVENTS;
}

/** Send a new personal best. Failures are ignored (the game carries on). */
export async function submitMark(event: string, initials: string, mark: number, base = boardUrl()): Promise<boolean> {
  if (!onBoard(event)) return false;
  try {
    const res = await fetch(`${base}/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, initials, mark }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** This week's top 10 for an event, or null if the server can't be reached. */
export async function fetchBoard(event: string, base = boardUrl()): Promise<{ week: string; rows: BoardEntry[] } | null> {
  try {
    const res = await fetch(`${base}/scores/${event}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { week?: unknown; rows?: unknown };
    if (typeof body.week !== 'string' || !Array.isArray(body.rows)) return null;
    const rows = body.rows.filter(
      (r): r is BoardEntry => typeof r?.initials === 'string' && /^[A-Z]{3}$/.test(r.initials) && typeof r?.mark === 'number',
    );
    return { week: body.week, rows };
  } catch {
    return null;
  }
}
