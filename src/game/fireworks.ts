// Fireworks for the podium: rockets climb, then burst into sparks that fall
// and fade. Plain data and a step function, so it can be tested.

import type { Rng } from '../core/rng';
import { PALETTE } from '../gfx/palette';
import { FIREWORKS } from './tuning';

export interface Rocket {
  x: number; // px
  y: number; // px
  burstY: number; // px, where it bursts
  colour: string;
}

export interface Spark {
  x: number; // px
  y: number; // px
  vx: number; // px/s
  vy: number; // px/s
  age: number; // s
  colour: string;
}

export interface Fireworks {
  rockets: Rocket[];
  sparks: Spark[];
  /** s until the next rocket goes up. */
  wait: number;
}

const COLOURS = [PALETTE.YELLOW, PALETTE.RED, PALETTE.CYAN, PALETTE.GREEN, PALETTE.PURPLE, PALETTE.WHITE];

export function newFireworks(): Fireworks {
  return { rockets: [], sparks: [], wait: 0 };
}

/** Move everything on by `dt` seconds; launch from the ground at `groundY`. */
export function updateFireworks(f: Fireworks, rng: Rng, dt: number, width: number, groundY: number): void {
  f.wait -= dt;
  if (f.wait <= 0) {
    f.wait += FIREWORKS.EVERY;
    f.rockets.push({
      x: rng.range(width * 0.15, width * 0.85),
      y: groundY,
      burstY: rng.range(FIREWORKS.BURST_MIN_Y, FIREWORKS.BURST_MAX_Y),
      colour: COLOURS[Math.floor(rng.next() * COLOURS.length)],
    });
  }
  for (const r of f.rockets) r.y -= FIREWORKS.RISE_SPEED * dt;
  // Rockets that reach their height burst: sparks go out evenly round a circle.
  for (const r of f.rockets.filter((r) => r.y <= r.burstY)) {
    for (let i = 0; i < FIREWORKS.SPARKS; i++) {
      const a = (i / FIREWORKS.SPARKS) * Math.PI * 2;
      const speed = FIREWORKS.SPARK_SPEED * rng.range(0.7, 1);
      f.sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, age: 0, colour: r.colour });
    }
  }
  f.rockets = f.rockets.filter((r) => r.y > r.burstY);
  for (const s of f.sparks) {
    s.age += dt;
    s.vy += FIREWORKS.GRAVITY * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
  f.sparks = f.sparks.filter((s) => s.age < FIREWORKS.SPARK_LIFE);
}

/** Is this spark in the last part of its life (drawn dimmer, then blinking out)? */
export function sparkFading(s: Spark): boolean {
  return s.age > FIREWORKS.SPARK_LIFE * 0.6;
}
