import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOARD_SIZE, isValidSubmission, rankBoard, weekId } from '../src/net/leaderboard-rules';
import { boardUrl, fetchBoard, submitMark } from '../src/net/leaderboard';

describe('leaderboard rules', () => {
  it('accept believable marks with three capital letters', () => {
    expect(isValidSubmission({ event: 'javelin', initials: 'ANN', mark: 70.12 })).toBe(true);
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
      return new Response('{"ok":true,"weekRank":2,"allTimeRank":5}');
    });
    expect(await submitMark('javelin', 'ANN', 70.12, null, 'http://x')).toEqual({ weekRank: 2, allTimeRank: 5 });
    expect(calls[0]).toEqual({ url: 'http://x/scores', body: '{"event":"javelin","initials":"ANN","mark":70.12}' });
    vi.stubGlobal('fetch', async () => {
      throw new Error('offline');
    });
    expect(await submitMark('javelin', 'ANN', 70.12, null, 'http://x')).toBeNull();
    expect(await fetchBoard('dash100', 'http://x')).toBeNull();
  });

  it('reads the board, dropping anything malformed', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ week: '2026-W45', rows: [{ initials: 'ANN', mark: 10 }, { initials: '<b>', mark: 1 }, 'x'] })),
    );
    expect(await fetchBoard('dash100', 'http://x')).toEqual({ week: '2026-W45', rows: [{ initials: 'ANN', mark: 10 }], allTime: [] });
  });
});

import { RACE_RULES, RUN_SAMPLE, rankOf, runMatches } from '../src/net/leaderboard-rules';
import { DASH100, GHOST, HURDLES, RUNNER, SWIM50, SWIMMER } from '../src/game/tuning';
import { Dash100Event } from '../src/events/dash100';
import { Rng } from '../src/core/rng';
import { NOTHING, STEP, pressed } from './helpers';

describe('race marks need the run that backs them up', () => {
  /** A real solo 100 m, tapping steadily: its time and run. */
  function realRace(): { mark: number; run: number[] } {
    const e = new Dash100Event();
    e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(5) });
    for (let i = 0; i < 60 * 40 && !e.isFinished(); i++) {
      e.update(STEP, e.phase === 'running' && i % 6 === 0 ? pressed(i % 12 ? 'P1_LEFT' : 'P1_RIGHT') : NOTHING);
    }
    return { mark: e.getResults().find((r) => r.playerIndex === 0)!.mark!, run: e.ghostRun()! };
  }

  it('a real run is accepted with its own time', () => {
    const { mark, run } = realRace();
    expect(runMatches('dash100', mark, run)).toBe(true);
    expect(isValidSubmission({ event: 'dash100', initials: 'ANN', mark, run })).toBe(true);
  });

  it('a faked time, a teleport, or no run at all is refused', () => {
    const { mark, run } = realRace();
    expect(runMatches('dash100', mark - 1.5, run)).toBe(false); // claims a faster time than the run took
    const teleport = [...run];
    teleport[20] += 5;
    expect(runMatches('dash100', mark, teleport)).toBe(false);
    expect(isValidSubmission({ event: 'dash100', initials: 'ANN', mark })).toBe(false);
    expect(runMatches('javelin', 80, undefined)).toBe(true); // field events need no run
  });

  it("the server's limits match the game's tuning", () => {
    expect(RUN_SAMPLE).toBe(GHOST.SAMPLE);
    expect(RACE_RULES.dash100).toEqual({ distance: DASH100.DISTANCE, topSpeed: RUNNER.MAX_SPEED });
    expect(RACE_RULES.hurdles110.distance).toBe(HURDLES.DISTANCE);
    expect(RACE_RULES.swim50).toEqual({ distance: SWIM50.DISTANCE, topSpeed: SWIMMER.MAX_SPEED });
  });

  it('ranks a name among everyone', () => {
    const rows = [
      { initials: 'ANN', mark: 10.1 },
      { initials: 'BOB', mark: 9.9 },
      { initials: 'CAT', mark: 10.5 },
    ];
    expect(rankOf('dash100', rows, 'ANN')).toBe(2);
    expect(rankOf('dash100', rows, 'ZED')).toBe(0);
  });
});
