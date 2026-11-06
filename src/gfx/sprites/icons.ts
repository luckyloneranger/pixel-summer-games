// Small original pixel-art icons: one per event, and medals. Drawn from
// character maps like the athletes, with the same dark outline.

import type { EventId } from '../../events/event';
import { PALETTE, lighter } from '../palette';
import { OUTLINE } from '../sprite';

/** Icon characters -> colours ('.' is see-through). */
const ICON_COLOURS: Record<string, string> = {
  y: PALETTE.YELLOW,
  w: PALETTE.WHITE,
  b: PALETTE.SKY,
  r: PALETTE.RED,
  o: PALETTE.ORANGE,
  g: PALETTE.GREEN,
};

/** 9x9 icon maps. */
export const EVENT_ICONS: Record<EventId, string[]> = {
  dash100: ['....yy...', '....yy...', '..yyyyy..', '.y..yy.y.', '....yy...', '...y..y..', '..y....y.', '.y.....y.', '.........'],
  longJump: ['.....yy..', '..yyyyy..', '.y..yy.y.', '....yyy..', '.yyy...y.', '.........', '.........', 'ooooooooo', 'ooooooooo'],
  highJump: ['..yy.....', '..yyyy...', '.....yy..', 'rwrwrwrwr', '.y.....y.', '.y.....y.', '.y.....y.', '.y..bbbbb', '.y..bbbbb'],
  javelin: ['........w', '.......w.', '......y..', '.....y...', '....y....', '...y.....', '..y......', '.y.......', 'y........'],
  hurdles110: ['.........', 'rwrwrwrwr', 'rwrwrwrwr', '.y.....y.', '.y.....y.', '.y.....y.', '.y.....y.', 'yy.....yy', '.........'],
  tripleJump: ['.......yy', '.......yy', '.........', '....yy...', '....yy...', '.........', '.yy......', '.yy......', 'ooooooooo'],
  poleVault: ['....rwrwr', '..y......', '.y.y.....', '.y..y....', 'y....y...', 'y.....y..', 'y......y.', 'y........', 'y........'],
  hammer: ['...yyy...', '..y...y..', '.y.....y.', '.y.....y.', '.y...www.', '..y.wwww.', '...ywwww.', '.....ww..', '.........'],
  swim50: ['.........', '..yy.....', '.yyyyyy..', '.........', 'bbb.bbb.b', '.b.b.b.b.', 'bbb.bbb.b', '.........', '.........'],
};

/** A 7x9 medal: ribbon (red and blue) and a disc ('m', with a lighter 'M' glint). */
export const MEDAL_MAP = ['rr...bb', '.rr.bb.', '..mmm..', '.mMmmm.', 'mMmmmmm', 'mmmmmmm', 'mmmmmmm', '.mmmmm.', '..mmm..'];
export const MEDAL_COLOURS = [PALETTE.YELLOW, PALETTE.GREY_LIGHT, PALETTE.ORANGE]; // gold, silver, bronze

/** Colours for a map, then a dark outline round it (pure, for tests). */
export function iconPixels(map: readonly string[], colours: Record<string, string>): (string | null)[][] {
  const h = map.length + 2;
  const w = map[0].length + 2;
  const at = (x: number, y: number) => (x < 1 || y < 1 || x > w - 2 || y > h - 2 ? '.' : map[y - 1][x - 1]);
  const grid: (string | null)[][] = [];
  for (let y = 0; y < h; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < w; x++) {
      const ch = at(x, y);
      if (ch !== '.') row.push(colours[ch] ?? null);
      else {
        const near = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((c) => c !== '.');
        row.push(near ? OUTLINE : null);
      }
    }
    grid.push(row);
  }
  return grid;
}

export function medalColours(place: number): Record<string, string> {
  const m = MEDAL_COLOURS[place];
  return { r: PALETTE.RED, b: PALETTE.BLUE, m, M: lighter(m) === m ? PALETTE.WHITE : lighter(m) };
}

function toCanvas(px: (string | null)[][], scale = 1): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px[0].length * scale;
  c.height = px.length * scale;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
  px.forEach((row, y) =>
    row.forEach((colour, x) => {
      if (!colour) return;
      ctx.fillStyle = colour;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }),
  );
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, make: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) cache.set(key, (c = make()));
  return c;
}

/** An event's icon (11x11 with its outline; `scale` 2 for big). */
export function eventIcon(id: EventId, scale = 1): HTMLCanvasElement {
  return cached(`e:${id}:${scale}`, () => toCanvas(iconPixels(EVENT_ICONS[id], ICON_COLOURS), scale));
}

/** A medal for 1st (0), 2nd (1) or 3rd (2): 9x11 with its outline. */
export function medalIcon(place: number, scale = 1): HTMLCanvasElement {
  return cached(`m:${place}:${scale}`, () => toCanvas(iconPixels(MEDAL_MAP, medalColours(place)), scale));
}
