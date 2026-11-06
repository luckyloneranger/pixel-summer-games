import { describe, expect, it } from 'vitest';
import { ATHLETE_FRAMES, ATHLETE_H, ATHLETE_W, CELEBRATIONS, celebrationFor } from '../src/gfx/sprites/athlete';
import { splashes } from '../src/events/swim50';
import { poleCurve } from '../src/events/pole-vault';

describe('Phase 18 animation', () => {
  it('the new poses are full-size frames', () => {
    for (const pose of ['windUp', 'follow', 'spinFront', 'spinBack', 'throwBack', 'dive', 'swing', 'fistPump', 'bow'] as const) {
      expect(ATHLETE_FRAMES[pose]).toHaveLength(ATHLETE_H);
      for (const row of ATHLETE_FRAMES[pose]) expect(row).toHaveLength(ATHLETE_W);
    }
    expect(ATHLETE_FRAMES.throwBack[7]).toBe([...ATHLETE_FRAMES.throw[7]].reverse().join(''));
  });

  it('each athlete always celebrates the same way, and all poses get used', () => {
    expect(celebrationFor(4)).toBe(celebrationFor(4));
    expect(new Set([0, 1, 2].map(celebrationFor)).size).toBe(CELEBRATIONS.length);
    expect(CELEBRATIONS).toContain(celebrationFor(-1));
  });

  it('faster swimmers kick up more splashes', () => {
    expect(splashes(0, 0, 1)).toHaveLength(0);
    expect(splashes(1, 0, 1).length).toBeGreaterThan(splashes(0.4, 0, 1).length);
  });

  it('the pole runs from the box to the hands, bowing in the middle', () => {
    const pts = poleCurve(10, 100, 30, 60, 8);
    expect(pts[0]).toEqual({ x: 10, y: 100 });
    expect(pts.at(-1)).toEqual({ x: 30, y: 60 });
    const mid = pts[Math.floor(pts.length / 2)];
    expect(mid.x).toBeLessThan(20); // bowed back from the straight line (x 20 there)
  });
});

import { scale2x } from '../src/gfx/sprite';
import { ATHLETE_FRAMES as F } from '../src/gfx/sprites/athlete';

describe('Scale2x (big athletes)', () => {
  it('doubles the size and keeps the characters', () => {
    const big = scale2x(F.stand);
    expect(big).toHaveLength(48);
    expect(big.every((r) => r.length === 32)).toBe(true);
    expect(new Set(big.join(''))).toEqual(new Set(F.stand.join('')));
  });

  it('smooths a diagonal edge instead of making 2x2 steps', () => {
    // A diagonal line of k: plain doubling would give square steps.
    const big = scale2x(['k..', '.k.', '..k']);
    expect(big[0]).toBe('kk....');
    expect(big[1]).toBe('kkk...'); // the corner fills in towards the next pixel
    expect(big[2]).toBe('.kkk..');
  });
});
