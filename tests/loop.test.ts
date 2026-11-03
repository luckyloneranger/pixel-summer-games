import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../src/core/loop';

describe('FixedStepClock', () => {
  it('runs one step per 1/60 s frame', () => {
    const clock = new FixedStepClock(60, 0.25);
    expect(clock.advance(1 / 60)).toBe(1);
  });

  it('carries leftover time into the next frame', () => {
    const clock = new FixedStepClock(60, 0.25);
    expect(clock.advance(1 / 120)).toBe(0);
    expect(clock.advance(1 / 120)).toBe(1);
  });

  it('runs 60 steps for one second of 144 Hz frames', () => {
    const clock = new FixedStepClock(60, 0.25);
    let steps = 0;
    for (let i = 0; i < 144; i++) steps += clock.advance(1 / 144);
    expect(steps).toBe(60);
  });

  it('caps a long pause at 250 ms of catch-up', () => {
    const clock = new FixedStepClock(60, 0.25);
    expect(clock.advance(5)).toBe(15);
  });

  it('ignores negative time', () => {
    const clock = new FixedStepClock(60, 0.25);
    expect(clock.advance(-1)).toBe(0);
  });
});
