// The look behind menu screens: a dimmed stadium panning slowly, and framed
// scoreboard-style panels for lists and tables.

import type { Renderer } from '../core/renderer';
import { Stadium } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import { MENU_LOOK } from '../game/tuning';

const stadium = new Stadium();
let dimmer: HTMLCanvasElement | null = null;
let time = 0;

/** A checkerboard of dark pixels: laid over the stadium, it dims it to half (no see-through colours). */
function dimLayer(w: number, h: number): HTMLCanvasElement {
  if (dimmer && dimmer.width === w && dimmer.height === h) return dimmer;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
  ctx.fillStyle = PALETTE.NIGHT;
  for (let y = 0; y < h; y++) for (let x = y % 2; x < w; x += 2) ctx.fillRect(x, y, 1, 1);
  dimmer = c;
  return c;
}

/** The menu backdrop: the stadium at night, drifting sideways, dimmed so text reads on top. */
export function drawBackdrop(r: Renderer): void {
  time += 1 / 60;
  stadium.theme = 'night';
  stadium.time = time;
  stadium.drawStands(r, time * MENU_LOOK.PAN_SPEED, 0.5, 0);
  r.image(dimLayer(r.width, r.height), 0, 0);
  // A dark strip along the bottom, so the hint lines read clearly.
  r.rect(0, HINT_STRIP_TOP, r.width, r.height - HINT_STRIP_TOP, PALETTE.INK);
  r.rect(0, HINT_STRIP_TOP, r.width, 1, PALETTE.GOLD);
}

const HINT_STRIP_TOP = 152; // px

/** A framed panel, like a stadium scoreboard: dark face, gold frame, corner bolts. */
export function drawPanel(r: Renderer, x: number, y: number, w: number, h: number): void {
  r.rect(x + 2, y + 2, w, h, PALETTE.BLACK); // shadow
  r.rect(x, y, w, h, PALETTE.GOLD);
  r.rect(x + 1, y + 1, w - 2, h - 2, PALETTE.INK);
  r.rect(x + 2, y + 2, w - 4, 1, PALETTE.NAVY);
  for (const [bx, by] of [[x + 2, y + 2], [x + w - 4, y + 2], [x + 2, y + h - 4], [x + w - 4, y + h - 4]]) r.rect(bx, by, 2, 2, PALETTE.GREY);
}
