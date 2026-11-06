import type { Renderer } from '../core/renderer';
import { CPU_FIELD, POLE_VAULT } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import type { EventId } from './event';
import { HighJumpEvent } from './high-jump';
import type { Pose } from '../gfx/sprites/athlete';

/**
 * Pole vault: the high jump's rules (bar heights, three misses and out), with
 * a pole. Letting go of Action plants it; the bend flings you up and over.
 */
export class PoleVaultEvent extends HighJumpEvent {
  readonly id: EventId = 'poleVault';
  readonly name = 'POLE VAULT';

  constructor() {
    super(POLE_VAULT, CPU_FIELD.POLE_VAULT);
  }

  /** The pole: carried on the run-up, planted in the box and bent, then dropped. */
  protected drawExtras(r: Renderer, toScreen: (m: number) => number): void {
    const ppm = POLE_VAULT.PIXELS_PER_METER;
    const ground = this.groundY;
    const box = toScreen(0);
    const flying = this.phase === 'flight' || this.phase === 'landed';
    if (!flying) {
      // Carried: from behind the athlete, angled forward and down towards the box.
      const x = toScreen(this.athleteX);
      r.line(x - 10, ground - 22, x + 30, ground - 8, PALETTE.YELLOW_LIGHT);
      return;
    }
    if (this.onPole) {
      // Planted: a curve from the box to the hands, bending hard early on and
      // straightening as the vaulter rises (the bend gives the height back).
      const hx = toScreen(this.flight.x);
      const hy = ground - this.flight.y * ppm - 4;
      const progress = Math.min(1, Math.max(0, this.flight.x / (POLE_VAULT.BAR_X - POLE_RELEASE_BEFORE_BAR)));
      const bend = POLE_BEND_PX * (1 - progress);
      for (const p of poleCurve(box, ground, hx, hy, bend)) r.rect(p.x, p.y, 1, 1, PALETTE.YELLOW_LIGHT);
      return;
    }
    // Let go: the pole falls back and lies on the ground.
    r.line(box, ground, box - POLE_LENGTH_PX, ground, PALETTE.YELLOW_LIGHT);
  }

  /** Upside down on the pole while rising, then the high jump's flop over the bar. */
  protected pose(onMat: boolean): Pose {
    return this.phase === 'flight' && this.onPole && this.flight.vyNow > 0 ? 'swing' : super.pose(onMat);
  }

  /** Still holding the pole (before pushing off near the bar). */
  private get onPole(): boolean {
    return (this.phase === 'flight' || this.phase === 'landed') && this.flight.x < POLE_VAULT.BAR_X - POLE_RELEASE_BEFORE_BAR;
  }
}

/** Points along a bent pole from (x0, y0) to (x1, y1), bowed `bend` px to the left. */
export function poleCurve(x0: number, y0: number, x1: number, y1: number, bend: number): { x: number; y: number }[] {
  const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bow = 4 * t * (1 - t) * bend; // most bend in the middle
    pts.push({ x: Math.round(x0 + (x1 - x0) * t - bow), y: Math.round(y0 + (y1 - y0) * t) });
  }
  return pts;
}

const POLE_BEND_PX = 9; // px the pole bows at its most bent
const POLE_RELEASE_BEFORE_BAR = 1.2; // m: the vaulter pushes off the pole this far before the bar
const POLE_LENGTH_PX = 60; // px, the pole lying on the ground
