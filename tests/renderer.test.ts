import { describe, expect, it } from 'vitest';
import { computeScale } from '../src/core/renderer';
import { GLYPHS, GLYPH_ROWS, GLYPH_SIZE, glyphIndex, textWidth } from '../src/gfx/font';

describe('computeScale', () => {
  it('uses the largest whole number that fits', () => {
    expect(computeScale(1920, 1080, 320, 180)).toBe(6);
    expect(computeScale(1366, 768, 320, 180)).toBe(4);
    expect(computeScale(2560, 1080, 320, 180)).toBe(6); // ultrawide: limited by height
  });

  it('never goes below 1', () => {
    expect(computeScale(200, 100, 320, 180)).toBe(1);
  });
});

describe('bitmap font', () => {
  it('every glyph is a 7x7 grid of # and .', () => {
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      expect(rows.length, `glyph ${ch}`).toBe(GLYPH_ROWS);
      for (const row of rows) expect(row, `glyph ${ch}`).toMatch(/^[#.]{7}$/);
    }
  });

  it('has every letter and digit', () => {
    for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') expect(GLYPHS[ch]).toBeDefined();
  });

  it('draws lower case as capitals and unknown characters as ?', () => {
    expect(glyphIndex('a')).toBe(glyphIndex('A'));
    expect(glyphIndex('~')).toBe(glyphIndex('?'));
  });

  it('measures text in 8px cells', () => {
    expect(textWidth('ABC')).toBe(3 * GLYPH_SIZE);
    expect(textWidth('ABC', 2)).toBe(6 * GLYPH_SIZE);
  });
});
