import type { Renderer } from '../core/renderer';
import { EFFECTS } from '../game/tuning';
import { PALETTE } from './palette';

const MAX_PUFFS = 32; // fixed pool, so no new objects are made while running

interface Puff {
  x: number; // m along the track
  y: number; // px, ground line
  age: number; // s, Infinity = unused
}

/** Little dust puffs kicked up behind fast runners. */
export class DustPuffs {
  private readonly puffs: Puff[] = Array.from({ length: MAX_PUFFS }, () => ({ x: 0, y: 0, age: Infinity }));
  private next = 0;

  clear(): void {
    for (const p of this.puffs) p.age = Infinity;
  }

  /** Start a puff at `x` metres, on the ground line `y` pixels. */
  add(x: number, y: number): void {
    const p = this.puffs[this.next];
    this.next = (this.next + 1) % MAX_PUFFS;
    p.x = x;
    p.y = y;
    p.age = 0;
  }

  update(dt: number): void {
    for (const p of this.puffs) if (p.age !== Infinity) p.age += dt;
  }

  /** Each puff grows and drifts up, then disappears. */
  render(r: Renderer, toScreen: (m: number) => number): void {
    for (const p of this.puffs) {
      if (p.age >= EFFECTS.DUST_LIFE) continue;
      const t = p.age / EFFECTS.DUST_LIFE;
      const size = 1 + Math.round(t * 3);
      const sx = toScreen(p.x) - size;
      const sy = p.y - 1 - Math.round(t * 4);
      r.rect(sx, sy, size, size, t < 0.5 ? PALETTE.GREY_LIGHT : PALETTE.GREY);
    }
  }
}

/** Tracks distance run so a puff appears every DUST_EVERY metres at speed. */
export class DustTrail {
  private lastPuffAt = 0;

  reset(): void {
    this.lastPuffAt = 0;
  }

  /** Returns true when a new puff should start at this position. */
  due(position: number, speedFraction: number): boolean {
    if (speedFraction < EFFECTS.DUST_SPEED || position - this.lastPuffAt < EFFECTS.DUST_EVERY) return false;
    this.lastPuffAt = position;
    return true;
  }
}
