import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { InputSnapshot } from '../src/core/input';
import type { Action } from '../src/core/keymap';
import { HeightAttempts } from '../src/events/height-attempts';
import { HighJumpEvent, heightFor } from '../src/events/high-jump';
import { Projectile } from '../src/events/projectile';
import { pointsFor, qualifyingMark } from '../src/game/scoring';
import { CPU_FIELD, HIGH_JUMP, RUNNER } from '../src/game/tuning';
import { NOTHING, STEP, pressed } from './helpers';

const H = HIGH_JUMP;

/** Height on the path at the bar, for a take-off `before` m before the line. */
function crossing(speed: number, angle: number, before: number): number | null {
  const p = new Projectile(H.GRAVITY);
  p.launch(-before, H.TAKEOFF_HEIGHT, speed * H.LAUNCH_EFFICIENCY, angle);
  return p.heightAt(H.BAR_X);
}

/** Best bar-crossing height over all angles, for a speed and take-off spot. */
function bestCrossing(speed: number, before: number): { height: number; angle: number } {
  let best = { height: 0, angle: 0 };
  for (let a = 20; a <= 85; a++) {
    const h = crossing(speed, a, before) ?? 0;
    if (h > best.height) best = { height: h, angle: a };
  }
  return best;
}

function hold(action: Action, fresh: boolean): InputSnapshot {
  return { isDown: (a) => a === action, justPressed: (a) => fresh && a === action, justReleased: () => false };
}

function newJump(players = [{ initials: 'P1' }], seed = 1): HighJumpEvent {
  const e = new HighJumpEvent();
  e.init({ players, difficulty: 'normal', rng: new Rng(seed) });
  return e;
}

/** One jump: start `before` m from the line at `speed`, release at `angle`. */
function jump(e: HighJumpEvent, speed: number, angle: number, before: number, key: 'P1' | 'P2' = 'P1'): void {
  e.update(STEP, pressed(`${key}_LEFT` as Action));
  // Holding to `angle` covers ground (plus the press and release frames), so start far enough back.
  const holdTime = angle / 90 + 3 * STEP;
  e.runner.position = H.RUNWAY - before - speed * holdTime;
  e.runner.speed = speed;
  e.update(STEP, hold(`${key}_ACTION` as Action, true));
  while (e.phase === 'hold' && e.meter.angle < angle) e.update(STEP, hold(`${key}_ACTION` as Action, false));
  e.update(STEP, NOTHING);
  for (let i = 0; i < 600 && e.phase === 'flight'; i++) e.update(STEP, NOTHING);
}

function finishResult(e: HighJumpEvent): void {
  for (let t = 0; t <= H.RESULT_TIME + STEP; t += STEP) e.update(STEP, NOTHING);
}

describe('high jump physics', () => {
  it('a near-perfect jump at top speed clears about 2.35 m or more', () => {
    const best = bestCrossing(RUNNER.MAX_SPEED, 0.2);
    expect(best.height).toBeGreaterThan(2.35);
    expect(best.angle).toBeGreaterThan(55);
  });

  it('a good jump at 10 m/s clears about 2.3-2.5 m; at 8.5 m/s about 1.9 m', () => {
    expect(bestCrossing(10, 0.2).height).toBeGreaterThan(2.3);
    expect(bestCrossing(10, 0.2).height).toBeLessThan(2.6);
    expect(bestCrossing(8.5, 0.2).height).toBeGreaterThan(1.85);
    expect(bestCrossing(8.5, 0.2).height).toBeLessThan(2.05);
  });

  it('too flat or too steep is much lower; taking off far too early falls short', () => {
    const best = bestCrossing(10, 0.2).height;
    expect(crossing(10, 40, 0.2)!).toBeLessThan(best - 0.4);
    expect(crossing(10, 85, 0.2) ?? 0).toBeLessThan(best - 0.4);
    expect(crossing(10, 65, 3) ?? 0).toBeLessThan(1.85);
  });
});

describe('bar heights', () => {
  it('clearing moves the bar up and resets the misses', () => {
    const h = new HeightAttempts(H.HEIGHTS, 3);
    expect(h.height).toBe(H.HEIGHTS[0]);
    h.record(null);
    expect(h.current).toBe(2);
    h.record(H.HEIGHTS[0]);
    expect(h.height).toBe(H.HEIGHTS[1]);
    expect(h.current).toBe(1);
    expect(h.best).toBe(H.HEIGHTS[0]);
  });

  it('three misses in a row at one height ends the event', () => {
    const h = new HeightAttempts(H.HEIGHTS, 3);
    h.record(H.HEIGHTS[0]);
    h.record(null);
    h.record(null);
    expect(h.done).toBe(false);
    h.record(null);
    expect(h.done).toBe(true);
    expect(h.best).toBe(H.HEIGHTS[0]);
  });

  it('clearing every height also ends it', () => {
    const h = new HeightAttempts([1.9, 2.0], 3);
    h.record(1.9);
    h.record(2.0);
    expect(h.done).toBe(true);
    expect(h.best).toBe(2.0);
  });

  it('snaps CPU bests to the bar heights', () => {
    expect(heightFor(2.12)).toBe(2.05);
    expect(heightFor(1.8)).toBeNull();
    expect(heightFor(2.4)).toBe(2.4);
  });
});

describe('high jump event', () => {
  it('a good jump clears the first height and the bar goes up', () => {
    const e = newJump();
    jump(e, 10, 65, 0.2);
    expect(e.phase).toBe('landed');
    expect(e.cleared).toBe(true);
    expect(e.lastMark).toBe(H.HEIGHTS[0]);
    finishResult(e);
    expect(e.jumpBar).toBe(H.HEIGHTS[1]);
  });

  it('a flat jump knocks the bar and counts as a miss', () => {
    const e = newJump();
    jump(e, 10, 25, 0.2);
    expect(e.cleared).toBe(false);
    expect(e.lastMark).toBeNull();
    finishResult(e);
    expect(e.jumpBar).toBe(H.HEIGHTS[0]);
    expect(e.record.current).toBe(2);
  });

  it('releasing past the line is a foul and a miss', () => {
    const e = newJump();
    e.update(STEP, pressed('P1_LEFT'));
    e.runner.position = H.RUNWAY - 0.1;
    e.runner.speed = 9;
    e.update(STEP, hold('P1_ACTION', true));
    for (let i = 0; i < 20 && e.phase === 'hold'; i++) e.update(STEP, hold('P1_ACTION', false));
    expect(e.phase).toBe('foul');
    expect(e.record.marks).toEqual([null]);
  });

  it('three misses end the event; the best height counts in the results', () => {
    const e = newJump();
    jump(e, 10, 65, 0.2); // clears 1.85
    finishResult(e);
    for (let i = 0; i < 3; i++) {
      jump(e, 10, 25, 0.2); // knocks 1.95
      finishResult(e);
    }
    expect(e.isFinished()).toBe(true);
    const me = e.getResults().find((r) => r.playerIndex === 0)!;
    expect(me.mark).toBe(H.HEIGHTS[0]);
    expect(e.getResults()).toHaveLength(4);
  });

  it('two players alternate jumps', () => {
    const e = newJump([
      { initials: 'ANN', index: 0 },
      { initials: 'BOB', index: 1 },
    ] as never);
    const order: number[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(e.current.playerIndex);
      jump(e, 10, 65, 0.2, e.current.playerIndex === 0 ? 'P1' : 'P2');
      finishResult(e);
    }
    expect(order).toEqual([0, 1, 0, 1]);
  });

  it('once one player is out, the other keeps jumping until they are out too', () => {
    const e = newJump([
      { initials: 'ANN', index: 0 },
      { initials: 'BOB', index: 1 },
    ] as never);
    const order: number[] = [];
    for (let i = 0; i < 12 && !e.isFinished(); i++) {
      const p = e.current.playerIndex;
      order.push(p);
      // ANN misses every jump; BOB clears 1.85 then misses.
      const clear = p === 1 && i === 1;
      jump(e, 10, clear ? 65 : 25, 0.2, p === 0 ? 'P1' : 'P2');
      finishResult(e);
    }
    expect(order).toEqual([0, 1, 0, 1, 0, 1, 1]); // ANN out after 3 misses; BOB has 2 more
    expect(e.isFinished()).toBe(true);
  });

  it('CPU bests stay in the difficulty range', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const e = newJump(undefined, seed);
      for (const r of e.getResults().filter((x) => x.playerIndex < 0)) {
        if (r.mark === null) continue;
        expect(r.mark).toBeGreaterThanOrEqual(CPU_FIELD.HIGH_JUMP.normal[0] - 0.1);
        expect(r.mark).toBeLessThanOrEqual(CPU_FIELD.HIGH_JUMP.normal[1]);
      }
    }
  });
});

describe('high jump scoring', () => {
  it('uses 1.50 m for 0 points and 2.30 m for 1,000', () => {
    expect(pointsFor('highJump', 1.5)).toBe(0);
    expect(pointsFor('highJump', 2.3)).toBe(1000);
    expect(qualifyingMark('highJump', 'normal')).toBe(2.0);
    expect(qualifyingMark('highJump', 'easy')).toBe(1.8);
  });
});
