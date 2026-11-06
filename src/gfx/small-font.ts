// Original narrow 3x5 font for dense text (tables, small notes). Each glyph is
// 3 pixels wide ('#' = pixel); letters sit 4 px apart. Capitals only.

export const SMALL_W = 4; // px from one letter to the next
export const SMALL_H = 6; // px line height

const G: Record<string, string> = {
  A: '.#. #.# ### #.# #.#', B: '##. #.# ##. #.# ##.', C: '.## #.. #.. #.. .##', D: '##. #.# #.# #.# ##.',
  E: '### #.. ##. #.. ###', F: '### #.. ##. #.. #..', G: '.## #.. #.# #.# .##', H: '#.# #.# ### #.# #.#',
  I: '### .#. .#. .#. ###', J: '..# ..# ..# #.# .#.', K: '#.# #.# ##. #.# #.#', L: '#.. #.. #.. #.. ###',
  M: '#.# ### ### #.# #.#', N: '##. #.# #.# #.# #.#', O: '.#. #.# #.# #.# .#.', P: '##. #.# ##. #.. #..',
  Q: '.#. #.# #.# ##. .##', R: '##. #.# ##. #.# #.#', S: '.## #.. .#. ..# ##.', T: '### .#. .#. .#. .#.',
  U: '#.# #.# #.# #.# ###', V: '#.# #.# #.# #.# .#.', W: '#.# #.# ### ### #.#', X: '#.# #.# .#. #.# #.#',
  Y: '#.# #.# .#. .#. .#.', Z: '### ..# .#. #.. ###',
  '0': '### #.# #.# #.# ###', '1': '.#. ##. .#. .#. ###', '2': '##. ..# .#. #.. ###', '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#', '5': '### #.. ##. ..# ##.', '6': '.## #.. ### #.# ###', '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###', '9': '### #.# ### ..# ##.',
  '.': '... ... ... ... .#.', ',': '... ... ... .#. #..', ':': '... .#. ... .#. ...', '-': '... ... ### ... ...',
  '/': '..# ..# .#. #.. #..', '!': '.#. .#. .#. ... .#.', '?': '##. ..# .#. ... .#.', "'": '.#. .#. ... ... ...',
  '+': '... .#. ### .#. ...', '%': '#.. ..# .#. #.. ..#', '(': '.#. #.. #.. #.. .#.', ')': '.#. ..# ..# ..# .#.',
  '°': '.#. #.# .#. ... ...', '#': '#.# ### #.# ### #.#', ' ': '... ... ... ... ...',
};

/** Each glyph as 5 rows of 3 characters. */
export const SMALL_GLYPHS: Record<string, string[]> = Object.fromEntries(Object.entries(G).map(([k, v]) => [k, v.split(' ')]));
export const SMALL_ORDER = Object.keys(SMALL_GLYPHS);
const indexOf = new Map(SMALL_ORDER.map((c, i) => [c, i]));

export function smallGlyphIndex(ch: string): number {
  return indexOf.get(ch.toUpperCase()) ?? indexOf.get('?')!;
}

export function smallTextWidth(text: string): number {
  return text.length * SMALL_W;
}
