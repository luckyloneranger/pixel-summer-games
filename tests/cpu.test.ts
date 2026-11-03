import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { CpuTapper } from '../src/events/cpu';
import type { Difficulty } from '../src/events/event';
import { TapRunner } from '../src/events/tap-runner';
import { CPU } from '../src/game/tuning';
import { STEP } from './helpers';

/** Time for one CPU to run 100 m. */
function cpu100m(cpu: CpuTapper): number {
  const r = new TapRunner();
  let t = 0;
  while (r.position < 100 && t < 60) {
    cpu.update(r, t + STEP);
    r.update(STEP);
    t += STEP;
  }
  return t;
}

function averageTime(difficulty: Difficulty): number {
  const rng = new Rng(99);
  let sum = 0;
  for (let i = 0; i < 50; i++) sum += cpu100m(CpuTapper.create(difficulty, rng));
  return sum / 50;
}

describe('CPU runners', () => {
  it('get faster with difficulty', () => {
    const easy = averageTime('easy');
    const normal = averageTime('normal');
    const hard = averageTime('hard');
    expect(easy).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(hard);
  });

  it('tap rate stays within ±10% of the difficulty rate', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i++) {
      const cpu = CpuTapper.create('normal', rng);
      expect(cpu.tapRate).toBeGreaterThanOrEqual(CPU.TAP_RATE.normal * 0.9);
      expect(cpu.tapRate).toBeLessThanOrEqual(CPU.TAP_RATE.normal * 1.1);
    }
  });

  it('react to GO within 0.15 to 0.35 s', () => {
    const rng = new Rng(6);
    for (let i = 0; i < 200; i++) {
      const cpu = CpuTapper.create('hard', rng);
      expect(cpu.reactionTime).toBeGreaterThanOrEqual(CPU.REACTION_MIN);
      expect(cpu.reactionTime).toBeLessThanOrEqual(CPU.REACTION_MAX);
    }
  });

  it('do not move before their reaction time', () => {
    const cpu = new CpuTapper(8, 0.3);
    const r = new TapRunner();
    expect(cpu.update(r, 0.2)).toBe(false);
    expect(cpu.update(r, 0.31)).toBe(true);
  });

  it('the same seed gives the same CPU', () => {
    const a = CpuTapper.create('normal', new Rng(7));
    const b = CpuTapper.create('normal', new Rng(7));
    expect(a.tapRate).toBe(b.tapRate);
    expect(a.reactionTime).toBe(b.reactionTime);
  });
});
