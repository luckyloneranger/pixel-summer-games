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

/** A soft shadow on the ground under an athlete: smaller the higher they are. Draw it before the athlete. */
export function drawGroundShadow(r: Renderer, cx: number, groundY: number, liftPx: number, colour: string): void {
  const w = Math.max(4, EFFECTS.SHADOW_WIDTH - Math.round(liftPx / 4));
  r.rect(cx - w / 2, groundY, w, 1, colour);
  r.rect(cx - w / 2 + 2, groundY + 1, Math.max(2, w - 4), 1, colour);
}

/** One speed line: starts `dx` px behind the athlete's back, `y` px below the sprite top. */
export interface SpeedLine {
  dx: number;
  y: number;
  length: number;
}

/** Streaks behind a runner near top speed (none below SPEED_LINES_FROM). They flicker with time. */
export function speedLines(speedFraction: number, t: number): SpeedLine[] {
  if (speedFraction < EFFECTS.SPEED_LINES_FROM) return [];
  const strength = (speedFraction - EFFECTS.SPEED_LINES_FROM) / (1 - EFFECTS.SPEED_LINES_FROM); // 0-1
  const flick = Math.floor(t * 20);
  return [7, 12, 17].map((y, i) => ({
    dx: 2 + ((flick + i * 3) % 4),
    y,
    length: Math.round(3 + strength * 7) - ((flick + i) % 2) * 2,
  }));
}

/** Draw speed lines behind an athlete whose sprite's left edge is at `left` and top at `top`. */
export function drawSpeedLines(r: Renderer, left: number, top: number, speedFraction: number, t: number): void {
  for (const l of speedLines(speedFraction, t)) {
    r.rect(left - l.dx - l.length, top + l.y, l.length, 1, PALETTE.CLOUD);
  }
}
