import type { Rng } from '../core/rng';
import { CPU } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { makeLook } from '../gfx/sprites/athlete';
import type { Look } from '../gfx/sprite';
import type { Difficulty } from './event';
import type { RunKey, TapRunner } from './tap-runner';

/**
 * Drives a TapRunner like a player would: alternating taps at a steady rate,
 * starting after a human-like reaction time. Same speed model as the player.
 */
export class CpuTapper {
  private nextKey: RunKey = 'left';
  private nextTapAt: number; // s after GO

  constructor(
    readonly tapRate: number, // taps/s
    readonly reactionTime: number, // s
  ) {
    this.nextTapAt = reactionTime;
  }

  /** Roll a CPU for one race: difficulty tap rate ±10%, random reaction. */
  static create(difficulty: Difficulty, rng: Rng): CpuTapper {
    const base = CPU.TAP_RATE[difficulty];
    const rate = base * rng.range(1 - CPU.TAP_RATE_VARIATION, 1 + CPU.TAP_RATE_VARIATION);
    return new CpuTapper(rate, rng.range(CPU.REACTION_MIN, CPU.REACTION_MAX));
  }

  /** Call once per step while racing; `sinceGo` is the time at the end of this step. */
  update(runner: TapRunner, sinceGo: number): boolean {
    if (sinceGo < this.nextTapAt) return false;
    runner.tap(this.nextKey);
    this.nextKey = this.nextKey === 'left' ? 'right' : 'left';
    this.nextTapAt += 1 / this.tapRate;
    return true;
  }
}

/** The made-up CPU athletes who fill the empty lanes. */
export const CPU_ATHLETES: { name: string; look: Look }[] = [
  { name: 'ACE', look: makeLook('blue', 'medium', PALETTE.INK) },
  { name: 'JET', look: makeLook('green', 'dark', PALETTE.INK) },
  { name: 'KAI', look: makeLook('yellow', 'light', PALETTE.BROWN) },
];
