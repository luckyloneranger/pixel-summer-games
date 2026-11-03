import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { InputSnapshot } from '../src/core/input';
import type { Action } from '../src/core/keymap';
import { cpuFieldMarks } from '../src/events/cpu';
import { JavelinEvent, javelinCamera, javelinToScreen } from '../src/events/javelin';
import { Projectile } from '../src/events/projectile';
import { CPU_FIELD, JAVELIN, RUNNER } from '../src/game/tuning';
import { HUD_HEIGHT } from '../src/ui/hud';
import { NOTHING, STEP, pressed } from './helpers';

function newThrow(seed = 1): JavelinEvent {
  const e = new JavelinEvent();
  e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(seed) });
  return e;
}

function holding(fresh = false): InputSnapshot {
  const set = new Set<Action>(['P1_ACTION']);
  return { isDown: (a) => set.has(a), justPressed: (a) => fresh && set.has(a), justReleased: () => false };
}

function placeAt(e: JavelinEvent, x: number, speed: number): void {
  e.update(STEP, pressed('P1_LEFT'));
  e.runner.position = JAVELIN.RUNWAY + x;
  e.runner.speed = speed;
}

function throwAt(e: JavelinEvent, angle: number): void {
  e.update(STEP, holding(true));
  while (e.phase === 'hold' && e.meter.angle < angle) e.update(STEP, holding());
  e.update(STEP, NOTHING);
}

function untilLanded(e: JavelinEvent): void {
  for (let i = 0; i < 2000 && e.phase === 'flight'; i++) e.update(STEP, NOTHING);
}

/** Distance (from the foul line) of a throw released right at the line. */
function throwDistance(speedFraction: number, angle: number): number {
  const p = new Projectile(JAVELIN.GRAVITY);
  p.launch(0, JAVELIN.RELEASE_HEIGHT, RUNNER.MAX_SPEED * speedFraction * JAVELIN.LAUNCH_EFFICIENCY, angle);
  while (!p.landed) p.update(STEP);
  return p.x;
}

describe('javelin distances (SPEC Phase 4: good throws land 85 to 95 m)', () => {
  it('good throws (42-48° at 96%+ of top speed) land 85 to 95 m', () => {
    for (const angle of [42, 45, 48]) {
      for (const speed of [0.96, 1]) {
        const d = throwDistance(speed, angle);
        expect(d).toBeGreaterThan(85);
        expect(d).toBeLessThan(95);
      }
    }
  });

  it('a played throw near 45° at top speed scores in that band', () => {
    const e = newThrow();
    placeAt(e, -6, RUNNER.MAX_SPEED);
    throwAt(e, 45);
    untilLanded(e);
    expect(e.phase).toBe('landed');
    expect(e.lastMark!).toBeGreaterThan(85 + e.takeoffX);
    expect(e.lastMark!).toBeLessThan(95);
  });

  it('flat or steep throws go much less far', () => {
    expect(throwDistance(1, 15)).toBeLessThan(60);
    expect(throwDistance(1, 75)).toBeLessThan(55);
  });
});

describe('javelin rules', () => {
  it('releasing past the foul line is a foul', () => {
    const e = newThrow();
    placeAt(e, -0.5, 10);
    e.update(STEP, holding(true));
    for (let i = 0; i < 30 && e.phase === 'hold'; i++) e.update(STEP, holding());
    expect(e.phase).toBe('foul');
    expect(e.record.marks).toEqual([null]);
  });

  it('running over the line without throwing is a foul', () => {
    const e = newThrow();
    placeAt(e, -0.5, 10);
    for (let i = 0; i < 30 && e.phase === 'runup'; i++) e.update(STEP, NOTHING);
    expect(e.phase).toBe('foul');
  });

  it('the athlete brakes to a stop after the release', () => {
    const e = newThrow();
    placeAt(e, -8, 10);
    throwAt(e, 40);
    untilLanded(e);
    expect(e.runner.speed).toBe(0);
  });

  it('the javelin points up on the way up and down on the way down, and sticks in pointing down', () => {
    const e = newThrow();
    placeAt(e, -8, 10);
    throwAt(e, 40);
    e.update(STEP, NOTHING);
    expect(e.flight.headingDegrees).toBeGreaterThan(0);
    untilLanded(e);
    expect(e.landingHeading).toBeLessThan(0);
  });

  it('three attempts, best counts, CPU marks in the results', () => {
    const e = newThrow();
    const waitResult = () => {
      for (let t = 0; t <= JAVELIN.RESULT_TIME + STEP; t += STEP) e.update(STEP, NOTHING);
    };
    for (const speed of [8, 11, 9]) {
      placeAt(e, -8, speed);
      throwAt(e, 40);
      untilLanded(e);
      waitResult();
    }
    expect(e.isFinished()).toBe(true);
    const results = e.getResults();
    expect(results).toHaveLength(4);
    const me = results.find((r) => r.playerIndex === 0)!;
    expect(me.mark).toBe(Math.max(...(e.record.marks as number[])));
  });
});

describe('javelin camera', () => {
  it('keeps the javelin on screen for every step of every throw', () => {
    for (const angle of [10, 25, 45, 60, 80]) {
      for (const speed of [0.5, 1]) {
        const p = new Projectile(JAVELIN.GRAVITY);
        p.launch(-1, JAVELIN.RELEASE_HEIGHT, RUNNER.MAX_SPEED * speed * JAVELIN.LAUNCH_EFFICIENCY, angle);
        while (!p.landed) {
          p.update(STEP);
          const { sx, sy } = javelinToScreen(p.x, p.y, javelinCamera(p.x, p.y));
          expect(sx).toBeGreaterThan(20);
          expect(sx).toBeLessThan(300);
          expect(sy).toBeGreaterThan(HUD_HEIGHT + 12);
          expect(sy).toBeLessThan(180);
        }
      }
    }
  });

  it('follows the javelin, not the athlete, once it is thrown', () => {
    const e = newThrow();
    placeAt(e, -8, 10);
    throwAt(e, 45);
    for (let i = 0; i < 60; i++) e.update(STEP, NOTHING);
    expect(e.focus.x).toBe(e.flight.x);
    expect(e.focus.x).toBeGreaterThan(e.athleteX + 10);
  });
});

describe('CPU javelin marks', () => {
  it('stay in the Normal range', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 100; i++) {
      for (const m of cpuFieldMarks(CPU_FIELD.JAVELIN.normal, 3, rng)) {
        if (m === null) continue;
        expect(m).toBeGreaterThanOrEqual(CPU_FIELD.JAVELIN.normal[0]);
        expect(m).toBeLessThanOrEqual(CPU_FIELD.JAVELIN.normal[1]);
      }
    }
  });
});
