import { describe, expect, it } from 'vitest';
import { TapRunner, applyRunPresses } from '../src/events/tap-runner';
import { RUNNER } from '../src/game/tuning';
import { STEP } from './helpers';

describe('TapRunner', () => {
  it('alternating taps add speed', () => {
    const r = new TapRunner();
    expect(r.tap('left')).toBe(true);
    const first = r.speed;
    expect(first).toBeCloseTo(RUNNER.TAP_IMPULSE);
    expect(r.tap('right')).toBe(true);
    expect(r.speed).toBeGreaterThan(first);
  });

  it('the same key twice adds nothing', () => {
    const r = new TapRunner();
    r.tap('left');
    const speed = r.speed;
    expect(r.tap('left')).toBe(false);
    expect(r.speed).toBe(speed);
    expect(r.taps).toBe(1);
  });

  it('gains shrink near top speed and never pass the cap', () => {
    const r = new TapRunner();
    r.tap('left');
    const firstGain = r.speed;
    for (let i = 0; i < 200; i++) r.tap(i % 2 === 0 ? 'right' : 'left');
    expect(r.speed).toBe(RUNNER.MAX_SPEED);
    const r2 = new TapRunner();
    r2.speed = RUNNER.MAX_SPEED * 0.8;
    r2.tap('left');
    expect(r2.speed - RUNNER.MAX_SPEED * 0.8).toBeLessThan(firstGain);
  });

  it('speed drains to zero without taps, and position stops growing', () => {
    const r = new TapRunner();
    r.tap('left');
    for (let i = 0; i < 600; i++) r.update(STEP);
    expect(r.speed).toBe(0);
    const pos = r.position;
    r.update(STEP);
    expect(r.position).toBe(pos);
  });

  it('no speed is gained or lost while canAccelerate is off (angle meter)', () => {
    const r = new TapRunner();
    r.canAccelerate = false;
    r.tap('left');
    expect(r.speed).toBe(0);
    r.speed = 8;
    for (let i = 0; i < 60; i++) r.update(STEP);
    expect(r.speed).toBe(8);
    expect(r.position).toBeCloseTo(8);
  });

  it('measures taps per second', () => {
    const r = new TapRunner();
    for (let i = 0; i < 120; i++) {
      if (i % 6 === 0) r.tap(i % 12 === 0 ? 'left' : 'right'); // 10 taps/s
      r.update(STEP);
    }
    expect(r.tapRate).toBeGreaterThanOrEqual(9);
    expect(r.tapRate).toBeLessThanOrEqual(11);
  });
});

describe('applyRunPresses', () => {
  it('pressing both keys at once counts as one tap', () => {
    const r = new TapRunner();
    expect(applyRunPresses(r, true, true)).toBe(true);
    expect(r.taps).toBe(1);
    expect(applyRunPresses(r, true, true)).toBe(true);
    expect(r.taps).toBe(2);
  });

  it('nothing pressed is no tap', () => {
    expect(applyRunPresses(new TapRunner(), false, false)).toBe(false);
  });
});

/** Run 100 m tapping at a steady rate; returns the time in seconds. */
function simulate100m(tapsPerSecond: number): number {
  const r = new TapRunner();
  let t = 0;
  let nextTap = 0;
  let key: 'left' | 'right' = 'left';
  while (r.position < 100 && t < 60) {
    if (t >= nextTap) {
      r.tap(key);
      key = key === 'left' ? 'right' : 'left';
      nextTap += 1 / tapsPerSecond;
    }
    r.update(STEP);
    t += STEP;
  }
  return t;
}

describe('running feel targets (SPEC section 4)', () => {
  it('about 7 taps/s runs 100 m in 11 to 12 s', () => {
    const t = simulate100m(7);
    expect(t).toBeGreaterThan(11);
    expect(t).toBeLessThan(12);
  });

  it('10 taps/s runs under 10 s', () => {
    expect(simulate100m(10)).toBeLessThan(10);
  });

  it('about 7 taps/s cruises near 85% of top speed, 10 taps/s near the top', () => {
    const cruise = (rate: number) => {
      const r = new TapRunner();
      let sum = 0;
      let n = 0;
      let nextTap = 0;
      let key: 'left' | 'right' = 'left';
      for (let t = 0; t < 10; t += STEP) {
        if (t >= nextTap) {
          r.tap(key);
          key = key === 'left' ? 'right' : 'left';
          nextTap += 1 / rate;
        }
        r.update(STEP);
        if (t > 5) {
          sum += r.speedFraction;
          n++;
        }
      }
      return sum / n;
    };
    expect(cruise(7)).toBeGreaterThan(0.8);
    expect(cruise(7)).toBeLessThan(0.9);
    expect(cruise(10)).toBeGreaterThan(0.95);
  });
});
