import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { InputSnapshot } from '../src/core/input';
import type { Action } from '../src/core/keymap';
import { cpuFieldMarks } from '../src/events/cpu';
import { FieldAttempts, floorCentimetres } from '../src/events/field-attempts';
import { LongJumpEvent } from '../src/events/long-jump';
import { flatRange } from '../src/events/projectile';
import { CPU_FIELD, LONG_JUMP, RUNNER } from '../src/game/tuning';
import { NOTHING, STEP, pressed } from './helpers';

function newJump(seed = 1): LongJumpEvent {
  const e = new LongJumpEvent();
  e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(seed) });
  return e;
}

/** Input where Action is held down, optionally with a fresh press. */
function holding(fresh = false): InputSnapshot {
  const set = new Set<Action>(['P1_ACTION']);
  return { isDown: (a) => set.has(a), justPressed: (a) => fresh && set.has(a), justReleased: () => false };
}

/** Put the athlete at `x` m from the foul line at a set speed. */
function placeAt(e: LongJumpEvent, x: number, speed: number): void {
  e.update(STEP, pressed('P1_LEFT')); // start running
  e.runner.position = LONG_JUMP.RUNWAY + x;
  e.runner.speed = speed;
}

/** Hold Action until the angle reaches `angle`, then release. */
function jumpAt(e: LongJumpEvent, angle: number): void {
  e.update(STEP, holding(true));
  while (e.phase === 'hold' && e.meter.angle < angle) e.update(STEP, holding());
  e.update(STEP, NOTHING);
}

function untilLanded(e: LongJumpEvent): void {
  for (let i = 0; i < 1000 && e.phase === 'flight'; i++) e.update(STEP, NOTHING);
}

describe('long jump', () => {
  it('a jump near 45° at top speed lands about 8.5 m', () => {
    const e = newJump();
    placeAt(e, -10, RUNNER.MAX_SPEED);
    jumpAt(e, 45);
    untilLanded(e);
    expect(e.phase).toBe('landed');
    // Distance is from the foul line, so subtract how far before it we took off.
    expect(e.lastMark!).toBeGreaterThan(8.3 + e.takeoffX);
    expect(e.lastMark!).toBeLessThan(8.7 + e.takeoffX);
  });

  it('speed is held steady (no gain, no drain) while the meter is held', () => {
    const e = newJump();
    placeAt(e, -20, 9);
    e.update(STEP, holding(true));
    for (let i = 0; i < 20; i++) e.update(STEP, holding());
    e.update(STEP, pressed('P1_RIGHT')); // a tap mid-hold changes nothing either
    expect(e.runner.speed).toBe(9);
  });

  it('measures from the foul line, not the take-off point', () => {
    const e = newJump();
    placeAt(e, -7, 10); // 45° takes 0.5 s = 5 m of runway at 10 m/s
    jumpAt(e, 45);
    untilLanded(e);
    const expected = flatRange(10 * LONG_JUMP.LAUNCH_EFFICIENCY, e.meter.angle, LONG_JUMP.GRAVITY) + e.takeoffX;
    expect(e.lastMark).toBe(floorCentimetres(expected));
    expect(e.perfect).toBe(false);
  });

  it('gives the perfect take-off bonus within 0.20 m of the line', () => {
    const e = newJump();
    // Holding to 45° covers 5 m at 10 m/s, plus one step: release at about -0.13 m.
    placeAt(e, -5.3, 10);
    jumpAt(e, 45);
    expect(e.takeoffX).toBeGreaterThan(-LONG_JUMP.PERFECT_ZONE);
    expect(e.perfect).toBe(true);
    untilLanded(e);
    const plain = flatRange(10 * LONG_JUMP.LAUNCH_EFFICIENCY, e.meter.angle, LONG_JUMP.GRAVITY) + e.takeoffX;
    expect(e.lastMark).toBe(floorCentimetres(plain * (1 + LONG_JUMP.PERFECT_BONUS)));
  });

  it('releasing past the foul line is a foul', () => {
    const e = newJump();
    placeAt(e, -0.5, 10);
    e.update(STEP, holding(true));
    for (let i = 0; i < 30 && e.phase === 'hold'; i++) e.update(STEP, holding());
    expect(e.phase).toBe('foul');
    expect(e.record.marks).toEqual([null]);
  });

  it('running over the line without jumping is a foul', () => {
    const e = newJump();
    placeAt(e, -0.5, 10);
    for (let i = 0; i < 30 && e.phase === 'runup'; i++) e.update(STEP, NOTHING);
    expect(e.phase).toBe('foul');
  });

  it('Action does nothing before you start moving', () => {
    const e = newJump();
    e.update(STEP, holding(true));
    expect(e.phase).toBe('ready');
  });

  it('three attempts, best counts, fouls use up an attempt', () => {
    const e = newJump();
    const waitResult = () => {
      for (let t = 0; t <= LONG_JUMP.RESULT_TIME + STEP; t += STEP) e.update(STEP, NOTHING);
    };
    // 1: foul.
    placeAt(e, -0.5, 10);
    for (let i = 0; i < 30 && e.phase === 'runup'; i++) e.update(STEP, NOTHING);
    waitResult();
    // 2: decent jump.
    placeAt(e, -5, 10);
    jumpAt(e, 40);
    untilLanded(e);
    waitResult();
    // 3: weaker jump.
    placeAt(e, -5, 7);
    jumpAt(e, 30);
    untilLanded(e);
    waitResult();

    expect(e.isFinished()).toBe(true);
    expect(e.record.marks).toHaveLength(3);
    expect(e.record.marks[0]).toBeNull();
    const me = e.getResults().find((r) => r.playerIndex === 0)!;
    expect(me.mark).toBe(e.record.marks[1]);
    expect(me.attempts).toEqual(e.record.marks);
  });

  it('results are sorted by best mark with CPU marks included', () => {
    const e = newJump();
    const results = e.getResults();
    expect(results).toHaveLength(4);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].mark ?? -1).toBeLessThanOrEqual(results[i - 1].mark ?? -1);
    }
  });
});

describe('FieldAttempts', () => {
  it('tracks best, current attempt and done', () => {
    const f = new FieldAttempts(3);
    expect(f.best).toBeNull();
    expect(f.current).toBe(1);
    f.record(null);
    f.record(6.5);
    f.record(6.2);
    f.record(9); // ignored: no attempts left
    expect(f.best).toBe(6.5);
    expect(f.done).toBe(true);
    expect(f.marks).toEqual([null, 6.5, 6.2]);
  });
});

describe('CPU long jump marks', () => {
  it('stay in the difficulty range, with some fouls', () => {
    const rng = new Rng(3);
    let fouls = 0;
    for (let i = 0; i < 200; i++) {
      for (const m of cpuFieldMarks(CPU_FIELD.LONG_JUMP.hard, 3, rng)) {
        if (m === null) fouls++;
        else {
          expect(m).toBeGreaterThanOrEqual(CPU_FIELD.LONG_JUMP.hard[0]);
          expect(m).toBeLessThanOrEqual(CPU_FIELD.LONG_JUMP.hard[1]);
        }
      }
    }
    expect(fouls).toBeGreaterThan(30);
    expect(fouls).toBeLessThan(150);
  });

  it('repeat for the same seed', () => {
    expect(cpuFieldMarks([6, 7], 3, new Rng(9))).toEqual(cpuFieldMarks([6, 7], 3, new Rng(9)));
  });
});
