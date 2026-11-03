import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Dash100Event, roundHundredths } from '../src/events/dash100';
import { DASH100 } from '../src/game/tuning';
import { NOTHING, STEP, pressed } from './helpers';

function newRace(seed = 1): Dash100Event {
  const e = new Dash100Event();
  e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(seed) });
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

describe('100 m start sequence', () => {
  it('goes ON YOUR MARKS, SET, then GO after a 1.0 to 2.5 s wait', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const e = newRace(seed);
      expect(e.phase).toBe('marks');
      const total = waitForGo(e);
      const wait = total - DASH100.MARKS_TIME;
      expect(wait).toBeGreaterThanOrEqual(DASH100.SET_WAIT_MIN - STEP);
      expect(wait).toBeLessThanOrEqual(DASH100.SET_WAIT_MAX + 2 * STEP);
    }
  });

  it('the same seed gives the same wait', () => {
    expect(waitForGo(newRace(42))).toBe(waitForGo(newRace(42)));
  });
});

describe('false starts', () => {
  it('a run key before GO is a false start, then the race restarts', () => {
    const e = newRace();
    e.update(STEP, pressed('P1_LEFT'));
    expect(e.phase).toBe('falseStart');
    expect(e.falseStarts).toBe(1);
    for (let t = 0; t <= DASH100.FALSE_START_TEXT_TIME + STEP; t += STEP) e.update(STEP, NOTHING);
    expect(e.phase).toBe('marks');
    expect(e.runner.position).toBe(0);
  });

  it('a second false start disqualifies', () => {
    const e = newRace();
    e.update(STEP, pressed('P1_RIGHT'));
    for (let t = 0; t <= DASH100.FALSE_START_TEXT_TIME + STEP; t += STEP) e.update(STEP, NOTHING);
    // Wait into SET, then jump the gun again.
    for (let t = 0; t <= DASH100.MARKS_TIME + STEP; t += STEP) e.update(STEP, NOTHING);
    expect(e.phase).toBe('set');
    e.update(STEP, pressed('P2_LEFT'));
    expect(e.phase).toBe('disqualified');
    expect(e.isFinished()).toBe(true);
    const [result] = e.getResults();
    expect(result.disqualified).toBe(true);
    expect(result.mark).toBeNull();
  });

  it('the action key before GO is not a false start', () => {
    const e = newRace();
    e.update(STEP, pressed('P1_ACTION'));
    expect(e.phase).toBe('marks');
  });
});

describe('the race', () => {
  it('alternating taps reach 100 m and give a time to 0.01 s', () => {
    const e = newRace();
    waitForGo(e);
    let left = true;
    let steps = 0;
    while (!e.isFinished() && steps < 60 * 60) {
      // A tap every 6 steps = 10 taps per second.
      e.update(STEP, steps % 6 === 0 ? pressed(left ? 'P1_LEFT' : 'P1_RIGHT') : NOTHING);
      if (steps % 6 === 0) left = !left;
      steps++;
    }
    expect(e.phase).toBe('finished');
    const [result] = e.getResults();
    expect(result.mark).not.toBeNull();
    expect(result.mark!).toBeGreaterThan(9);
    expect(result.mark!).toBeLessThan(10.5);
    expect(result.mark).toBe(roundHundredths(result.mark!));
    expect(result.reactionTime).toBeCloseTo(STEP);
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

  it('finish time is interpolated within the step', () => {
    const e = newRace();
    waitForGo(e);
    e.runner.position = 99.9;
    e.runner.speed = 10;
    const timeBefore = e.raceTime;
    e.update(STEP, NOTHING);
    // 0.1 m at ~10 m/s ≈ 0.01 s, less than one step.
    expect(e.finishTime! - timeBefore).toBeGreaterThan(0);
    expect(e.finishTime! - timeBefore).toBeLessThan(STEP);
  });
});
