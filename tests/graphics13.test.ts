import { describe, expect, it } from 'vitest';
import { PALETTE } from '../src/gfx/palette';
import { OUTLINE, mapToPixels, shadePixels } from '../src/gfx/sprite';
import { ATHLETE_FRAMES, makeLook, withHair } from '../src/gfx/sprites/athlete';
import { SKY_COLOURS, STADIUM_THEMES, gradientRows } from '../src/gfx/backgrounds';
import { speedLines } from '../src/gfx/effects';
import { highlightZoom, wipeCover } from '../src/gfx/screen-fx';
import { CHAMPIONSHIP_EVENTS } from '../src/game/championship';
import { EFFECTS } from '../src/game/tuning';
import { LongJumpEvent } from '../src/events/long-jump';
import { Rng } from '../src/core/rng';
import { pressed, STEP } from './helpers';
import { LONG_JUMP } from '../src/game/tuning';

const PALETTE_SET = new Set<string>(Object.values(PALETTE));

describe('sprite shading', () => {
  const look = makeLook('red', 'medium', PALETTE.BROWN); // brown hair gets a highlight (black ink doesn't)

  it('outlines the figure and lights its top edges, using palette colours only', () => {
    const plain = mapToPixels(ATHLETE_FRAMES.stand, look);
    const shaded = shadePixels(plain);
    const count = (px: (string | null)[][]) => px.flat().filter((c) => c !== null).length;
    expect(count(shaded)).toBeGreaterThan(count(plain)); // the outline adds pixels
    for (const c of shaded.flat()) if (c !== null) expect(PALETTE_SET.has(c)).toBe(true);
    // Every pixel that was see-through and now isn't is outline colour.
    plain.forEach((row, y) => row.forEach((c, x) => {
      if (c === null && shaded[y][x] !== null) expect(shaded[y][x]).toBe(OUTLINE);
    }));
    // The top of the head (hair) is lit.
    const top = plain.findIndex((r) => r.some((c) => c !== null));
    const x = plain[top].findIndex((c) => c !== null);
    expect(shaded[top][x]).not.toBe(plain[top][x]);
  });

  it('keeps the sprite the same size', () => {
    const shaded = shadePixels(mapToPixels(ATHLETE_FRAMES.run0, look));
    expect(shaded).toHaveLength(24);
    expect(shaded.every((r) => r.length === 16)).toBe(true);
  });
});

describe('hair styles', () => {
  const hair = (rows: string[]) => rows.join('').split('').filter((c) => c === 'h').length;
  it('a bun and long hair add hair; short hair changes nothing', () => {
    const base = ATHLETE_FRAMES.run0;
    expect(withHair(base, 'short', 'run0')).toEqual(base);
    expect(hair(withHair(base, 'bun', 'run0'))).toBeGreaterThan(hair(base));
    expect(hair(withHair(base, 'long', 'run0'))).toBeGreaterThan(hair(base));
  });
  it('leaves lying and flopping poses alone', () => {
    expect(withHair(ATHLETE_FRAMES.flop, 'long', 'flop')).toEqual(ATHLETE_FRAMES.flop);
  });
});

describe('stadium themes', () => {
  it('every event has a time of day, with palette sky colours', () => {
    for (const id of CHAMPIONSHIP_EVENTS) expect(SKY_COLOURS[STADIUM_THEMES[id]]).toBeDefined();
    for (const colours of Object.values(SKY_COLOURS)) for (const c of colours) expect(PALETTE_SET.has(c)).toBe(true);
  });

  it('sky gradients go from the first colour to the last, dithering between', () => {
    const rows = gradientRows(30, SKY_COLOURS.sunset);
    expect(rows).toHaveLength(30);
    expect(rows[0].base).toBe(PALETTE.PURPLE);
    expect(rows[29].base).toBe(PALETTE.PEACH);
    expect(rows.some((r) => r.dither !== null)).toBe(true);
    expect(rows[29].dither).toBeNull();
  });
});

describe('effects', () => {
  it('speed lines only near top speed', () => {
    expect(speedLines(0.5, 0)).toEqual([]);
    expect(speedLines(1, 0).length).toBeGreaterThan(0);
  });

  it('the wipe opens from fully covered to clear', () => {
    expect(wipeCover(0)).toBe(1);
    expect(wipeCover(EFFECTS.WIPE_TIME / 2)).toBeGreaterThan(0);
    expect(wipeCover(EFFECTS.WIPE_TIME / 2)).toBeLessThan(1);
    expect(wipeCover(EFFECTS.WIPE_TIME)).toBe(0);
  });

  it('the highlight zooms in and back out', () => {
    expect(highlightZoom(0)).toBe(1);
    expect(highlightZoom(EFFECTS.HIGHLIGHT_TIME / 2)).toBeCloseTo(EFFECTS.HIGHLIGHT_ZOOM);
    expect(highlightZoom(EFFECTS.HIGHLIGHT_TIME)).toBe(1);
  });
});

describe('big-jump highlight', () => {
  /** A long jump at `speed`, held to `angle`, starting `back` m behind the board. */
  function jump(speed: number, angle: number, back: number): { calls: number; mark: number | null; qualify: number } {
    let calls = 0;
    const e = new LongJumpEvent();
    e.init({
      players: [{ initials: 'ANN' }],
      difficulty: 'normal',
      rng: new Rng(1),
      effects: { shake: () => {}, highlight: () => void calls++, calm: false },
    });
    e.update(STEP, pressed('P1_LEFT'));
    e.runner.position = LONG_JUMP.RUNWAY - back;
    e.runner.speed = speed;
    const hold = (fresh: boolean) => ({ isDown: (a: string) => a === 'P1_ACTION', justPressed: (a: string) => fresh && a === 'P1_ACTION', justReleased: () => false });
    e.update(STEP, hold(true));
    while (e.phase === 'hold' && e.meter.angle < angle) e.update(STEP, hold(false));
    e.update(STEP, pressed());
    for (let i = 0; i < 600 && e.phase === 'flight'; i++) e.update(STEP, pressed());
    return { calls, mark: e.lastMark, qualify: (e as unknown as { qualifyMark: number }).qualifyMark };
  }

  it('comes on once for a jump heading past the qualifying mark', () => {
    // Top speed, about 40 degrees, taking off right by the board.
    const big = jump(11.5, 40, 5.6);
    expect(big.mark!).toBeGreaterThanOrEqual(big.qualify);
    expect(big.calls).toBe(1);
  });

  it('stays off for a short jump', () => {
    expect(jump(4, 10, 2).calls).toBe(0);
  });
});
