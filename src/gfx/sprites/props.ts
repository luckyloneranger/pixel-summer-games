import type { Renderer } from '../../core/renderer';
import { PALETTE } from '../palette';

// Track props drawn from a few rectangles (small enough not to need pixel maps).

const HURDLE_W = 8; // px, width of the top bar
const HURDLE_H = 12; // px, height (a 1.07 m hurdle at 12 px per m)

/** A hurdle standing with its feet at (x, footY), or knocked flat on the track. */
export function drawHurdle(r: Renderer, x: number, footY: number, knocked: boolean): void {
  const left = Math.round(x - HURDLE_W / 2);
  if (knocked) {
    // Lying on its side: bar flat on the track, legs sticking up a little.
    r.rect(left - 2, footY - 2, HURDLE_W + 4, 2, PALETTE.WHITE);
    r.rect(left, footY - 2, 2, 2, PALETTE.RED);
    r.rect(left + 4, footY - 2, 2, 2, PALETTE.RED);
    r.rect(left - 2, footY - 4, 1, 2, PALETTE.GREY_LIGHT);
    return;
  }
  // Two legs with feet, and a red-and-white striped top bar.
  r.rect(left, footY - HURDLE_H, 1, HURDLE_H, PALETTE.GREY_LIGHT);
  r.rect(left + HURDLE_W - 1, footY - HURDLE_H, 1, HURDLE_H, PALETTE.GREY_LIGHT);
  r.rect(left - 2, footY - 1, 4, 1, PALETTE.GREY);
  r.rect(left + HURDLE_W - 3, footY - 1, 4, 1, PALETTE.GREY);
  r.rect(left, footY - HURDLE_H, HURDLE_W, 3, PALETTE.WHITE);
  r.rect(left + 2, footY - HURDLE_H, 2, 3, PALETTE.RED);
  r.rect(left + 6, footY - HURDLE_H, 2, 3, PALETTE.RED);
}
