import type { Renderer } from '../core/renderer';
import { CPU_FIELD, POLE_VAULT } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import type { EventId } from './event';
import { HighJumpEvent } from './high-jump';

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
    if (this.flight.x < POLE_VAULT.BAR_X - POLE_RELEASE_BEFORE_BAR) {
      // Planted: from the box to the athlete's hands, sagging in the middle (the bend).
      const hx = toScreen(this.flight.x);
      const hy = ground - this.flight.y * ppm - 6;
      const mx = (box + hx) / 2 - 6;
      const my = (ground + hy) / 2;
      r.line(box, ground, mx, my, PALETTE.YELLOW_LIGHT);
      r.line(mx, my, hx, hy, PALETTE.YELLOW_LIGHT);
      return;
    }
    // Let go: the pole falls back and lies on the ground.
    r.line(box, ground, box - POLE_LENGTH_PX, ground, PALETTE.YELLOW_LIGHT);
  }
}

const POLE_RELEASE_BEFORE_BAR = 1.2; // m: the vaulter pushes off the pole this far before the bar
const POLE_LENGTH_PX = 60; // px, the pole lying on the ground
