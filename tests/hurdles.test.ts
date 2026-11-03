import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { Difficulty } from '../src/events/event';
import { HURDLE_POSITIONS, Hurdles110Event, judgeHurdle } from '../src/events/hurdles110';
import { HURDLES, RACE_START } from '../src/game/tuning';
import { NOTHING, STEP, pressed } from './helpers';
import type { Action } from '../src/core/keymap';

function newRace(seed = 1, difficulty: Difficulty = 'normal'): Hurdles110Event {
  const e = new Hurdles110Event();
  e.init({ players: [{ initials: 'P1' }], difficulty, rng: new Rng(seed) });
  return e;
}

function waitForGo(e: Hurdles110Event): void {
  for (let i = 0; e.phase !== 'running' && i < 10_000; i++) e.update(STEP, NOTHING);
}

/**
 * The player taps at `rate` taps/s. `jumpStyle` decides jumps:
 * 'perfect' takes off so each hurdle passes mid-jump, 'early' takes off far
 * too soon, 'never' doesn't jump. Runs until the player finishes.
 */
function playerRun(e: Hurdles110Event, rate: number, jumpStyle: 'perfect' | 'early' | 'never'): number {
  waitForGo(e);
  const every = Math.round(60 / rate);
  let left = true;
  let jumpedFor = -1; // one jump per hurdle
  const p = e.player;
  for (let i = 0; p.finishTime === null && i < 60 * 60; i++) {
    const actions: Action[] = [];
    if (i % every === 0) {
      actions.push(left ? 'P1_LEFT' : 'P1_RIGHT');
      left = !left;
    }
    const next = HURDLE_POSITIONS[p.nextHurdle];
    if (jumpStyle !== 'never' && next !== undefined && p.jumpTime === null && jumpedFor !== p.nextHurdle) {
      // 'early' takes off so the hurdle only arrives at 95% of the jump: a clip.
      const fraction = jumpStyle === 'perfect' ? 0.5 : 0.95;
      if (next - p.runner.position <= p.runner.speed * HURDLES.JUMP_TIME * fraction) {
        actions.push('P1_ACTION');
        jumpedFor = p.nextHurdle;
      }
    }
    e.update(STEP, pressed(...actions));
  }
  return p.finishTime!;
}

describe('hurdle layout', () => {
  it('has 10 hurdles at the real spacing, the last 14.02 m from the finish', () => {
    expect(HURDLE_POSITIONS).toHaveLength(10);
    expect(HURDLE_POSITIONS[0]).toBeCloseTo(13.72);
    expect(HURDLE_POSITIONS[1] - HURDLE_POSITIONS[0]).toBeCloseTo(9.14);
    expect(HURDLES.DISTANCE - HURDLE_POSITIONS[9]).toBeCloseTo(14.02);
  });
});

describe('judging a hurdle', () => {
  it('clears it when the hurdle passes under the middle of the jump', () => {
    expect(judgeHurdle(0.5)).toBe('clear');
    expect(judgeHurdle(HURDLES.CLEAR_FROM)).toBe('clear');
    expect(judgeHurdle(HURDLES.CLEAR_TO)).toBe('clear');
  });
  it('clips it when jumping too late or too early', () => {
    expect(judgeHurdle(0.05)).toBe('hit');
    expect(judgeHurdle(0.95)).toBe('hit');
  });
  it('crashes into it when not jumping at all', () => {
    expect(judgeHurdle(null)).toBe('crash');
  });
});

describe('110 m hurdles (SPEC Phase 5)', () => {
  it('a clean run at 10 taps/s takes about 13 s', () => {
    const e = newRace();
    const t = playerRun(e, 10, 'perfect');
    expect(e.player.hits).toBe(0);
    expect(t).toBeGreaterThan(12);
    expect(t).toBeLessThan(13.8);
  });

  it('mistimed jumps knock hurdles down and visibly cost time', () => {
    const clean = playerRun(newRace(), 10, 'perfect');
    const e = newRace();
    const early = playerRun(e, 10, 'early');
    expect(e.player.hits).toBeGreaterThan(5);
    expect(e.player.knocked.filter(Boolean).length).toBe(e.player.hits);
    expect(early - clean).toBeGreaterThan(1.5);
  });

  it('running straight through every hurdle costs even more', () => {
    const early = playerRun(newRace(), 10, 'early');
    const e = newRace();
    const never = playerRun(e, 10, 'never');
    expect(e.player.hits).toBe(10);
    expect(never).toBeGreaterThan(early);
  });

  it('a hit cuts speed by 40% and a crash by 70%', () => {
    const e = newRace();
    waitForGo(e);
    const p = e.player;
    p.runner.position = HURDLE_POSITIONS[0] - 0.05;
    p.runner.speed = 10;
    e.update(STEP, NOTHING); // run into it without jumping
    expect(p.hits).toBe(1);
    expect(p.runner.speed).toBeCloseTo(10 * (1 - HURDLES.CRASH_SPEED_LOSS) - 0.1, 0);
    expect(p.stumbleTime).toBeGreaterThan(0);
  });

  it('taps in the air add no speed but keep your rhythm', () => {
    const e = newRace();
    waitForGo(e);
    e.update(STEP, pressed('P1_LEFT'));
    e.update(STEP, pressed('P1_ACTION'));
    const speed = e.runner.speed;
    e.update(STEP, pressed('P1_RIGHT')); // in the air: counts for rhythm only
    expect(e.runner.speed).toBeLessThan(speed);
    expect(e.runner.nextKey).toBe('left');
  });

  it('a knocked hurdle never disqualifies you', () => {
    const e = newRace();
    playerRun(e, 10, 'never');
    expect(e.player.disqualified).toBe(false);
    expect(e.player.finishTime).not.toBeNull();
  });

  it('false starts work as in the 100 m', () => {
    const e = newRace();
    e.update(STEP, pressed('P1_LEFT'));
    expect(e.phase).toBe('falseStart');
    for (let t = 0; t <= RACE_START.FALSE_START_TEXT_TIME + STEP; t += STEP) e.update(STEP, NOTHING);
    expect(e.phase).toBe('marks');
    expect(e.player.knocked.every((k) => !k)).toBe(true);
  });
});

describe('CPU hurdlers', () => {
  function cpuHits(difficulty: Difficulty): number {
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const e = newRace(seed, difficulty);
      playerRun(e, 10, 'perfect');
      for (let i = 0; !e.isFinished() && i < 60 * 60; i++) e.update(STEP, NOTHING);
      for (const lane of e.lanes) if (lane.cpu) hits += lane.hits;
    }
    return hits;
  }

  it('hit more hurdles on Easy than on Hard', () => {
    expect(cpuHits('easy')).toBeGreaterThan(cpuHits('hard'));
  });

  it('finish the race, slower than a clean flat 110 m would be', () => {
    const e = newRace(2, 'normal');
    playerRun(e, 10, 'perfect');
    for (let i = 0; !e.isFinished() && i < 60 * 60; i++) e.update(STEP, NOTHING);
    for (const lane of e.lanes) {
      expect(lane.finishTime).not.toBeNull();
      if (lane.cpu) expect(lane.finishTime!).toBeGreaterThan(12.5);
    }
  });
});
