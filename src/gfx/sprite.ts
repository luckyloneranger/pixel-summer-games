import { PALETTE, lighter } from './palette';

/** Colours that change per athlete: team kit, skin tone and hair. */
export interface Look {
  shirt: string;
  shirtShade: string;
  skin: string;
  skinShade: string;
  hair: string;
  /** 'short' (default), 'bun' or 'long' (see withHair in sprites/athlete.ts). */
  hairStyle?: 'short' | 'bun' | 'long';
}

/**
 * Characters allowed in sprite pixel maps:
 *  .  transparent      h  hair        k  skin       K  skin shade (far limbs)
 *  S  shirt (team)     T  shirt shade w  white kit  b  shoe   o  eye
 */
export const SPRITE_CHARS = '.hkKSTwbo';

export function colourOf(ch: string, look: Look): string | null {
  switch (ch) {
    case '.':
      return null;
    case 'h':
      return look.hair;
    case 'k':
      return look.skin;
    case 'K':
      return look.skinShade;
    case 'S':
      return look.shirt;
    case 'T':
      return look.shirtShade;
    case 'w':
      return PALETTE.WHITE;
    case 'b':
    case 'o':
      return PALETTE.INK;
    default:
      throw new Error(`Unknown sprite character '${ch}'`);
  }
}

/** A sprite as colours (null = see-through), row by row. */
export type Pixels = (string | null)[][];

export function mapToPixels(map: readonly string[], look: Look): Pixels {
  return map.map((row) => [...row].map((ch) => colourOf(ch, look)));
}

/**
 * Finish a sprite the way pixel artists do: a lighter shade on every top
 * edge (light from above), then a dark outline round the whole figure so it
 * stands out from any background.
 */
export function shadePixels(px: Pixels): Pixels {
  const h = px.length;
  const w = px[0]?.length ?? 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? null : px[y][x]);
  const lit = px.map((row, y) =>
    row.map((c, x) => (c !== null && at(x, y - 1) === null && c !== OUTLINE ? lighter(c) : c)),
  );
  return lit.map((row, y) =>
    row.map((c, x) => {
      if (c !== null) return c;
      const touches = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((n) => n !== null);
      return touches ? OUTLINE : null;
    }),
  );
}

/** The outline colour round shaded sprites. */
export const OUTLINE = PALETTE.INK;

function pixelsToCanvas(px: Pixels): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = px[0].length;
  canvas.height = px.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
  px.forEach((row, y) =>
    row.forEach((colour, x) => {
      if (colour === null) return;
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }),
  );
  return canvas;
}

/** Turn a pixel map into a small canvas, once, at load time. `shaded` adds highlights and an outline. */
export function buildSprite(map: readonly string[], look: Look, shaded = false): HTMLCanvasElement {
  const px = mapToPixels(map, look);
  return pixelsToCanvas(shaded ? shadePixels(px) : px);
}
