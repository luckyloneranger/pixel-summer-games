import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Dash100Event, PLAYER_LANE, roundHundredths } from '../src/events/dash100';
import type { Difficulty } from '../src/events/event';
import { DASH100 } from '../src/game/tuning';
import { NOTHING, STEP, pressed } from './helpers';

function newRace(seed = 1, difficulty: Difficulty = 'normal'): Dash100Event {
  const e = new Dash100Event();
  e.init({ players: [{ initials: 'P1' }], difficulty, rng: new Rng(seed) });
  return e;
}

/** Step with no input until the race reaches GO. */
function waitForGo(e: Dash100Event): number {
  let steps = 0;
  while (e.phase !== 'running' && steps < 10_000) {
    e.update(STEP, NOTHING);
    steps++;
  }
  return steps * STEP;
}

/** The player taps at `rate` taps/s until everyone has finished. */
function runRace(e: Dash100Event, rate = 10): void {
  const every = Math.round(60 / rate);
  let left = true;
  for (let i = 0; !e.isFinished() && i < 60 * 60; i++) {
    const tap = i % every === 0;
    e.update(STEP, tap ? pressed(left ? 'P1_LEFT' : 'P1_RIGHT') : NOTHING);
    if (tap) left = !left;
  }
}

function waitSeconds(e: Dash100Event, seconds: number): void {
  for (let t = 0; t <= seconds + STEP; t += STEP) e.update(STEP, NOTHING);
}

describe('100 m start sequence', () => {
  it('goes ON YOUR MARKS, SET, then GO after a 1.0 to 2.5 s wait', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const e = newRace(seed);
      expect(e.phase).toBe('marks');
      const wait = waitForGo(e) - DASH100.MARKS_TIME;
      expect(wait).toBeGreaterThanOrEqual(DASH100.SET_WAIT_MIN - STEP);
      expect(wait).toBeLessThanOrEqual(DASH100.SET_WAIT_MAX + 2 * STEP);
    }
  });

  it('the same seed gives the same wait', () => {
    expect(waitForGo(newRace(42))).toBe(waitForGo(newRace(42)));
  });

  it('has the player in lane 2 and three CPUs', () => {
    const e = newRace();
    expect(e.lanes).toHaveLength(4);
    expect(e.player.laneNumber).toBe(PLAYER_LANE);
    expect(e.lanes.filter((l) => l.cpu !== null)).toHaveLength(3);
  });
});

describe('false starts', () => {
  it('a run key before GO is a false start, then everyone restarts', () => {
    const e = newRace();
    e.update(STEP, pressed('P1_LEFT'));
    expect(e.phase).toBe('falseStart');
    expect(e.falseStarts).toBe(1);
    waitSeconds(e, DASH100.FALSE_START_TEXT_TIME);
    expect(e.phase).toBe('marks');
    for (const lane of e.lanes) expect(lane.runner.position).toBe(0);
  });

  it('a second false start disqualifies; the CPUs still race', () => {
    const e = newRace();
    e.update(STEP, pressed('P1_RIGHT'));
    waitSeconds(e, DASH100.FALSE_START_TEXT_TIME);
    waitSeconds(e, DASH100.MARKS_TIME);
    expect(e.phase).toBe('set');
    e.update(STEP, pressed('P2_LEFT'));
    expect(e.phase).toBe('disqualified');
    expect(e.player.disqualified).toBe(true);

    runRace(e);
    expect(e.isFinished()).toBe(true);
    const results = e.getResults();
    const me = results.find((r) => r.playerIndex === 0)!;
    expect(me.disqualified).toBe(true);
    expect(me.mark).toBeNull();
    expect(results[results.length - 1]).toBe(me); // DQ ranks last
    expect(results.filter((r) => r.mark !== null)).toHaveLength(3);
  });

  it('the action key before GO is not a false start', () => {
    const e = newRace();
    e.update(STEP, pressed('P1_ACTION'));
    expect(e.phase).toBe('marks');
  });
});

describe('the race', () => {
  it('ends only when every runner has crossed the line', () => {
    const e = newRace(3, 'easy');
    waitForGo(e);
    runRace(e, 10);
    expect(e.isFinished()).toBe(true);
    for (const lane of e.lanes) expect(lane.finishTime).not.toBeNull();
  });

  it('results are in finishing order with times to 0.01 s', () => {
    const e = newRace();
    waitForGo(e);
    runRace(e, 10);
    const results = e.getResults();
    for (let i = 1; i < results.length; i++) expect(results[i].mark!).toBeGreaterThanOrEqual(results[i - 1].mark!);
    for (const r of results) expect(r.mark).toBe(roundHundredths(r.mark!));
    const me = results.find((r) => r.playerIndex === 0)!;
    expect(me.mark!).toBeGreaterThan(9);
    expect(me.mark!).toBeLessThan(10.5);
    expect(me.reactionTime).toBeCloseTo(STEP);
  });

  it('pressing one key over and over goes almost nowhere', () => {
    const e = newRace();
    waitForGo(e);
    for (let i = 0; i < 600; i++) e.update(STEP, i % 6 === 0 ? pressed('P1_LEFT') : NOTHING);
    expect(e.runner.taps).toBe(1);
    expect(e.runner.position).toBeLessThan(2);
  });

  it('holding a key adds nothing (only fresh presses count)', () => {
    const e = newRace();
    waitForGo(e);
    const held = { isDown: () => true, justPressed: () => false, justReleased: () => false };
    for (let i = 0; i < 300; i++) e.update(STEP, held);
    expect(e.runner.speed).toBe(0);
    expect(e.runner.position).toBe(0);
  });

  it('the arrow keys work too in a 1-player race', () => {
    const e = newRace();
    waitForGo(e);
    e.update(STEP, pressed('P2_LEFT'));
    e.update(STEP, pressed('P2_RIGHT'));
    expect(e.runner.taps).toBe(2);
  });

  it('finish time is worked out within the step', () => {
    const e = newRace();
    waitForGo(e);
    e.runner.position = 99.9;
    e.runner.speed = 10;
    const timeBefore = e.raceTime;
    e.update(STEP, NOTHING);
    // 0.1 m at ~10 m/s ≈ 0.01 s, less than one step.
    expect(e.player.finishTime! - timeBefore).toBeGreaterThan(0);
    expect(e.player.finishTime! - timeBefore).toBeLessThan(STEP);
  });
});
