import type { Renderer } from '../core/renderer';
import { PALETTE } from '../gfx/palette';

export const HUD_HEIGHT = 24; // px

const SEGMENTS = 16;
const SEG_W = 5; // px
const SEG_GAP = 1; // px

/** Top scoreboard panel: event name, timer or mark, and the speed meter. */
export function drawScoreboard(
  r: Renderer,
  title: string,
  markText: string,
  speedFraction: number,
  note = '',
  noteColour: string = PALETTE.RED,
): void {
  r.rect(0, 0, r.width, HUD_HEIGHT, PALETTE.INK);
  r.rect(0, HUD_HEIGHT - 1, r.width, 1, PALETTE.GREY_DARK);
  r.text(title, 4, 3, PALETTE.WHITE);
  // The mark sits in a dark "LED" box.
  r.rect(r.width - 72, 2, 70, 10, PALETTE.BLACK);
  r.text(markText, r.width - 4, 3, PALETTE.YELLOW, 'right');

  r.text('SPEED', 4, 14, PALETTE.GREY_LIGHT);
  const lit = Math.round(speedFraction * SEGMENTS);
  for (let i = 0; i < SEGMENTS; i++) {
    const x = 48 + i * (SEG_W + SEG_GAP);
    const colour = i >= lit ? PALETTE.GREY_DARK : i < 10 ? PALETTE.GREEN : i < 14 ? PALETTE.YELLOW : PALETTE.RED;
    r.rect(x, 14, SEG_W, 7, colour);
  }
  if (note) r.text(note, r.width - 4, 14, noteColour, 'right');
}
