import { PALETTE } from './palette';

/** Colours that change per athlete: team kit, skin tone and hair. */
export interface Look {
  shirt: string;
  shirtShade: string;
  skin: string;
  skinShade: string;
  hair: string;
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

/** Turn a pixel map into a small canvas, once, at load time. */
export function buildSprite(map: readonly string[], look: Look): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = map[0].length;
  canvas.height = map.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
  map.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const colour = colourOf(row[x], look);
      if (colour === null) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}
