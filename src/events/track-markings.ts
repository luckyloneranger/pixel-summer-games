import type { Renderer } from '../core/renderer';
import { LAYOUT, TRACK_BOTTOM } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';

const MARKER_EVERY = 10; // m between distance markers

/**
 * The running track's paint: lane numbers behind the start, a line and a
 * board every 10 m, and the chequered finish. `toScreen` turns metres into
 * screen x (it follows the camera).
 */
export function drawTrackMarkings(r: Renderer, toScreen: (m: number) => number, distance: number, laneNumbers: readonly number[]): void {
  const trackH = TRACK_BOTTOM - LAYOUT.TRACK_TOP;
  const numbersX = toScreen(-2);
  if (numbersX > -8) {
    for (const lane of laneNumbers) {
      r.text(String(lane), numbersX, LAYOUT.TRACK_TOP + (lane - 1) * LAYOUT.LANE_HEIGHT + 4, PALETTE.WHITE, 'center');
    }
  }
  for (let m = 0; m < distance; m += MARKER_EVERY) {
    const x = toScreen(m);
    if (x < -20 || x > r.width + 20) continue;
    r.rect(x, LAYOUT.TRACK_TOP, m === 0 ? 2 : 1, trackH, PALETTE.WHITE);
    if (m > 0) {
      const label = String(m);
      const w = label.length * 8 + 2;
      r.rect(x - w / 2, LAYOUT.TRACK_TOP - 11, w, 9, PALETTE.WHITE);
      r.text(label, x, LAYOUT.TRACK_TOP - 10, PALETTE.INK, 'center');
    }
  }
  const fx = toScreen(distance);
  if (fx > -10 && fx < r.width + 10) {
    for (let y = 0; y < trackH; y += 2) {
      const even = (y / 2) % 2 === 0;
      r.rect(fx, LAYOUT.TRACK_TOP + y, 2, 2, even ? PALETTE.WHITE : PALETTE.INK);
      r.rect(fx + 2, LAYOUT.TRACK_TOP + y, 2, 2, even ? PALETTE.INK : PALETTE.WHITE);
    }
    r.rect(fx - 23, LAYOUT.TRACK_TOP - 11, 50, 9, PALETTE.YELLOW);
    r.text('FINISH', fx + 2, LAYOUT.TRACK_TOP - 10, PALETTE.INK, 'center');
  }
}
