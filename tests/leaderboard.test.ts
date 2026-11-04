import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD_SIZE, isValidSubmission, rankBoard, weekId } from '../src/net/leaderboard-rules';
import { boardUrl, fetchBoard, submitMark } from '../src/net/leaderboard';

describe('leaderboard rules', () => {
  it('accept believable marks with three capital letters', () => {
    expect(isValidSubmission({ event: 'dash100', initials: 'ANN', mark: 10.12 })).toBe(true);
    expect(isValidSubmission({ event: 'javelin', initials: 'BOB', mark: 81.5 })).toBe(true);
  });

  it('reject impossible marks, bad names, unknown events and junk', () => {
    expect(isValidSubmission({ event: 'dash100', initials: 'ANN', mark: 3.2 })).toBe(false); // too fast
    expect(isValidSubmission({ event: 'highJump', initials: 'ANN', mark: 3.0 })).toBe(false); // above the top bar
    expect(isValidSubmission({ event: 'dash100', initials: 'ann', mark: 10 })).toBe(false);
    expect(isValidSubmission({ event: 'dash100', initials: 'ANNA', mark: 10 })).toBe(false);
    expect(isValidSubmission({ event: 'darts', initials: 'ANN', mark: 10 })).toBe(false);
    expect(isValidSubmission({ event: 'dash100', initials: 'ANN', mark: 10.123 })).toBe(false); // finer than 0.01
    expect(isValidSubmission({ event: 'dash100', initials: 'ANN', mark: Number.NaN })).toBe(false);
    expect(isValidSubmission(null)).toBe(false);
    expect(isValidSubmission('hello')).toBe(false);
  });

  it('weeks run Monday to Sunday (ISO weeks, UTC)', () => {
    expect(weekId(Date.UTC(2026, 10, 2))).toBe('2026-W45'); // Monday 2 Nov 2026
    expect(weekId(Date.UTC(2026, 10, 8, 23, 59))).toBe('2026-W45'); // Sunday night
    expect(weekId(Date.UTC(2026, 10, 9))).toBe('2026-W46');
    expect(weekId(Date.UTC(2021, 0, 3))).toBe('2020-W53'); // early January can belong to last year
    expect(weekId(Date.UTC(2024, 11, 30))).toBe('2025-W01'); // late December can belong to next year
  });

  it('show each name once, best first, ten at most', () => {
    const races = rankBoard('dash100', [
      { initials: 'ANN', mark: 10.5 },
      { initials: 'ANN', mark: 10.1 },
      { initials: 'BOB', mark: 10.3 },
    ]);
    expect(races).toEqual([
      { initials: 'ANN', mark: 10.1 },
      { initials: 'BOB', mark: 10.3 },
    ]);
    const throws = rankBoard('javelin', [
      { initials: 'ANN', mark: 70 },
      { initials: 'BOB', mark: 80 },
    ]);
    expect(throws[0].initials).toBe('BOB');
    const many = Array.from({ length: 30 }, (_, i) => ({ initials: `A${String.fromCharCode(65 + (i % 26))}${i < 26 ? 'A' : 'B'}`, mark: i }));
    expect(rankBoard('javelin', many)).toHaveLength(BOARD_SIZE);
  });
});

describe('leaderboard client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the game server address over http(s)', () => {
    expect(boardUrl('wss://rooms.example.dev')).toBe('https://rooms.example.dev');
    expect(boardUrl('ws://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787');
  });

  it('sends a new best, and survives the server being down', async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return new Response('{"ok":true}');
    });
    expect(await submitMark('dash100', 'ANN', 10.12, 'http://x')).toBe(true);
    expect(calls[0]).toEqual({ url: 'http://x/scores', body: '{"event":"dash100","initials":"ANN","mark":10.12}' });
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    expect(await submitMark('dash100', 'ANN', 10.12, 'http://x')).toBe(false);
    expect(await fetchBoard('dash100', 'http://x')).toBeNull();
  });

  it('reads the board, dropping anything malformed', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ week: '2026-W45', rows: [{ initials: 'ANN', mark: 10 }, { initials: '<b>', mark: 1 }, 'x'] })),
    );
    expect(await fetchBoard('dash100', 'http://x')).toEqual({ week: '2026-W45', rows: [{ initials: 'ANN', mark: 10 }] });
  });
});
