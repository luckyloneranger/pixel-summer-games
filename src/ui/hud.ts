import type { Renderer } from '../core/renderer';
import { PALETTE } from '../gfx/palette';

export const HUD_HEIGHT = 24; // px

const SEGMENTS = 16;
const SEG_W = 5; // px
const SEG_GAP = 1; // px

/** One labelled speed meter (2-player races show two). */
export interface SpeedMeter {
  label: string;
  fraction: number; // 0-1
}

/**
 * Top scoreboard panel: event name, timer or mark, and the speed meter.
 * Pass a list of meters to show one per player instead of a single one.
 */
export function drawScoreboard(
  r: Renderer,
  title: string,
  markText: string,
  speed: number | SpeedMeter[],
  note = '',
  noteColour: string = PALETTE.RED,
): void {
  r.rect(0, 0, r.width, HUD_HEIGHT, PALETTE.INK);
  r.rect(0, HUD_HEIGHT - 1, r.width, 1, PALETTE.GREY_DARK);
  r.text(title, 4, 3, PALETTE.WHITE);
  // The mark sits in a dark "LED" box.
  r.rect(r.width - 72, 2, 70, 10, PALETTE.BLACK);
  r.text(markText, r.width - 4, 3, PALETTE.YELLOW, 'right');

  if (typeof speed === 'number') {
    r.text('SPEED', 4, 14, PALETTE.GREY_LIGHT);
    drawMeter(r, 48, speed, SEGMENTS, SEG_W);
    if (note) r.text(note, r.width - 4, 14, noteColour, 'right');
    return;
  }
  // Two players: a smaller meter each, labelled with their initials.
  speed.forEach((m, i) => {
    const x = 4 + i * 128;
    r.text(m.label, x, 14, PALETTE.GREY_LIGHT);
    drawMeter(r, x + 28, m.fraction, SMALL_SEGMENTS, SMALL_SEG_W);
  });
}

const SMALL_SEGMENTS = 12;
const SMALL_SEG_W = 5;

function drawMeter(r: Renderer, x: number, fraction: number, segments: number, segW: number): void {
  const lit = Math.round(fraction * segments);
  for (let i = 0; i < segments; i++) {
    // Green for most of the range, then yellow, then red near top speed.
    const share = i / segments;
    const colour = i >= lit ? PALETTE.GREY_DARK : share < 0.625 ? PALETTE.GREEN : share < 0.875 ? PALETTE.YELLOW : PALETTE.RED;
    r.rect(x + i * (segW + SEG_GAP), 14, segW, 7, colour);
  }
}
