import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { InputSnapshot } from '../src/core/input';
import type { Action } from '../src/core/keymap';
import { LongJumpEvent } from '../src/events/long-jump';
import { TripleJumpEvent } from '../src/events/triple-jump';
import { newFireworks, sparkFading, updateFireworks } from '../src/game/fireworks';
import { FIREWORKS, LONG_JUMP, RUNNER } from '../src/game/tuning';
import { PALETTE } from '../src/gfx/palette';
import { sepiaOf } from '../src/gfx/sprite';
import { NOTHING, STEP, pressed } from './helpers';

function holding(fresh = false): InputSnapshot {
  const set = new Set<Action>(['P1_ACTION']);
  return { isDown: (a) => set.has(a), justPressed: (a) => fresh && set.has(a), justReleased: () => false };
}

describe('instant replay', () => {
  it('a long jump has a replay once someone has landed, not before', () => {
    const e = new LongJumpEvent();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1) });
    expect(e.hasReplay()).toBe(false);
    e.update(STEP, pressed('P1_LEFT'));
    e.runner.position = LONG_JUMP.RUNWAY - 8;
    e.runner.speed = RUNNER.MAX_SPEED;
    e.update(STEP, holding(true));
    while (e.phase === 'hold' && e.meter.angle < 40) e.update(STEP, holding());
    e.update(STEP, NOTHING);
    for (let i = 0; i < 1000 && e.phase === 'flight'; i++) e.update(STEP, NOTHING);
    expect(e.phase).toBe('landed');
    expect(e.hasReplay()).toBe(true);
  });

  it('the triple jump has no replay (its three bounces are not one flight)', () => {
    const e = new TripleJumpEvent();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1) });
    expect(e.hasReplay()).toBe(false);
  });
});

describe('photo finish', () => {
  it('sepia turns every colour into one of the warm photo tones', () => {
    const tones = new Set<string>([PALETTE.INK, PALETTE.BROWN, PALETTE.BROWN_LIGHT, PALETTE.GOLD, PALETTE.PEACH, PALETTE.CLOUD]);
    for (const c of Object.values(PALETTE)) expect(tones.has(sepiaOf(c))).toBe(true);
    // Light stays light and dark stays dark.
    expect(sepiaOf(PALETTE.WHITE)).toBe(PALETTE.CLOUD);
    expect(sepiaOf(PALETTE.INK)).toBe(PALETTE.INK);
  });
});

describe('fireworks', () => {
  it('rockets go up, burst into sparks, and the sparks die away', () => {
    const f = newFireworks();
    const rng = new Rng(3);
    updateFireworks(f, rng, STEP, 320, 150);
    expect(f.rockets).toHaveLength(1);
    // Long enough to reach any burst height, but before the next rocket.
    for (let t = 0; t < (150 - FIREWORKS.BURST_MIN_Y) / FIREWORKS.RISE_SPEED + 0.05; t += STEP) updateFireworks(f, rng, STEP, 320, 150);
    expect(f.sparks.length).toBeGreaterThanOrEqual(FIREWORKS.SPARKS);
    expect(f.sparks.some(sparkFading)).toBe(false);
    // Stop new rockets and let it all fade.
    for (let t = 0; t < FIREWORKS.SPARK_LIFE + 0.1; t += STEP) {
      f.wait = 1;
      updateFireworks(f, rng, STEP, 320, 150);
    }
    expect(f.sparks.filter((s) => s.age < 0.05)).toHaveLength(0);
  });

  it('launches about one rocket every interval, inside the middle of the screen', () => {
    const f = newFireworks();
    const rng = new Rng(9);
    let launched = 0;
    for (let i = 0; i < 600; i++) {
      const before = f.rockets.length;
      updateFireworks(f, rng, STEP, 320, 150);
      if (f.rockets.length > before) launched++;
      for (const r of f.rockets) expect(r.x).toBeGreaterThan(40);
    }
    expect(launched).toBeGreaterThanOrEqual(Math.floor(10 / FIREWORKS.EVERY));
  });
});
