// Whole-screen effects: the blinds wipe between screens and the zoom during a
// big-jump highlight. The timing maths is pure so it can be tested.

import type { Renderer } from '../core/renderer';
import { EFFECTS } from '../game/tuning';
import { PALETTE } from './palette';

/** How much of each blind still covers the new screen, `t` s after it appeared (1 = all, 0 = none). */
export function wipeCover(t: number): number {
  if (t >= EFFECTS.WIPE_TIME) return 0;
  const p = Math.max(0, t / EFFECTS.WIPE_TIME);
  return 1 - p * p * (3 - 2 * p); // eases out smoothly
}

/** Horizontal blinds closing up over the screen. */
export function drawWipe(r: Renderer, cover: number): void {
  if (cover <= 0) return;
  const band = r.height / EFFECTS.WIPE_BANDS;
  for (let i = 0; i < EFFECTS.WIPE_BANDS; i++) {
    const h = Math.ceil(band * cover);
    r.rect(0, Math.floor(i * band), r.width, h, PALETTE.INK);
  }
}

/** Zoom during a highlight, `t` s in: eases in and back out to 1. */
export function highlightZoom(t: number): number {
  if (t <= 0 || t >= EFFECTS.HIGHLIGHT_TIME) return 1;
  return 1 + (EFFECTS.HIGHLIGHT_ZOOM - 1) * Math.sin((t / EFFECTS.HIGHLIGHT_TIME) * Math.PI);
}
