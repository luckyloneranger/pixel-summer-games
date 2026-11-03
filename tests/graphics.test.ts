import { describe, expect, it } from 'vitest';
import { layoutCrowd } from '../src/gfx/backgrounds';
import { PALETTE } from '../src/gfx/palette';
import { SPRITE_CHARS, colourOf } from '../src/gfx/sprite';
import { ATHLETE_FRAMES, ATHLETE_H, ATHLETE_W, makeLook } from '../src/gfx/sprites/athlete';

describe('palette', () => {
  it('has exactly 24 different colours', () => {
    const colours = Object.values(PALETTE);
    expect(colours).toHaveLength(24);
    expect(new Set(colours).size).toBe(24);
  });
});

describe('athlete sprites', () => {
  for (const [pose, rows] of Object.entries(ATHLETE_FRAMES)) {
    it(`${pose} is 16x24 and uses only sprite characters`, () => {
      expect(rows).toHaveLength(ATHLETE_H);
      for (const row of rows) {
        expect(row).toHaveLength(ATHLETE_W);
        for (const ch of row) expect(SPRITE_CHARS).toContain(ch);
      }
    });
  }

  it('every sprite colour comes from the palette', () => {
    const allowed = new Set<string>(Object.values(PALETTE));
    const look = makeLook('blue', 'dark', PALETTE.INK);
    for (const ch of SPRITE_CHARS) {
      const c = colourOf(ch, look);
      if (c !== null) expect(allowed.has(c)).toBe(true);
    }
  });
});

describe('crowd', () => {
  it('is laid out the same every time', () => {
    expect(layoutCrowd()).toEqual(layoutCrowd());
    expect(layoutCrowd().length).toBeGreaterThan(50);
  });
});
