// Remembers an online match for this browser tab, so reloading the page can
// rejoin it. Kept in sessionStorage: it lasts as long as the tab, no longer.

import type { Difficulty, EventId } from '../events/event';
import type { SessionPlayer } from '../game/session';
import type { ResumeInfo } from './connection';

export interface RejoinRecord extends ResumeInfo {
  code: string;
  players: SessionPlayer[];
  events: EventId[];
  difficulty: Difficulty;
  seed: number;
  localIndex: number;
  savedAt: number; // ms since 1970
}

const KEY = 'psg:rejoin';
/** Older than this and the friend has given up waiting anyway (s). */
const MAX_AGE = 60;

/** The storage it uses (sessionStorage in the browser; a fake in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function tabStore(): KeyValueStore | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null; // storage blocked (private mode, sandboxed page)
  }
}

export function saveRejoin(r: RejoinRecord, store = tabStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(r));
  } catch {
    // full or blocked: rejoining just won't be offered
  }
}

/** The saved match, if there is a recent one. */
export function loadRejoin(nowMs = Date.now(), store = tabStore()): RejoinRecord | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RejoinRecord;
    if (typeof r.code !== 'string' || (r.slot !== 0 && r.slot !== 1) || !Array.isArray(r.players)) return null;
    if (nowMs - r.savedAt > MAX_AGE * 1000) return null;
    return r;
  } catch {
    return null;
  }
}

export function clearRejoin(store = tabStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
