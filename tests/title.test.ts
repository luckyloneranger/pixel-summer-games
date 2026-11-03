import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  PARADE_ACTS,
  currentAct,
  logoLanded,
  logoOffset,
  parade,
  shineLetter,
  throwConfetti,
  tickerText,
  tickerX,
  updateConfetti,
  waveCentre,
  type ParadeItem,
} from '../src/game/title-show';
import { EFFECTS, TITLE } from '../src/game/tuning';

const athletes = (items: ParadeItem[]) => items.filter((i) => i.k === 'athlete');

describe('title logo', () => {
  it('drops in from above, bounces, and settles in place', () => {
    expect(logoOffset(0)).toBe(TITLE.LOGO_DROP_FROM);
    expect(logoOffset(TITLE.LOGO_DROP_TIME)).toBe(0);
    expect(logoOffset(60)).toBe(0);
    // It touches down, then bounces back up a little before settling.
    const samples = Array.from({ length: 90 }, (_, i) => logoOffset((i / 90) * TITLE.LOGO_DROP_TIME));
    const firstTouch = samples.findIndex((o) => o === 0);
    expect(firstTouch).toBeGreaterThan(0);
    expect(Math.max(...samples.slice(firstTouch))).toBeGreaterThan(0);
    expect(logoLanded(0)).toBe(false);
    expect(logoLanded(TITLE.LOGO_DROP_TIME)).toBe(true);
  });

  it('shines across the letters now and then, never while dropping', () => {
    expect(shineLetter(0.1, 12)).toBe(-1);
    const start = 2 * TITLE.SHINE_EVERY - TITLE.SHINE_TIME;
    expect(shineLetter(start + 0.001, 12)).toBe(0);
    expect(shineLetter(2 * TITLE.SHINE_EVERY - 0.001, 12)).toBe(11);
    expect(shineLetter(start - 0.5, 12)).toBe(-1);
  });
});

describe('title crowd and confetti', () => {
  it('sends a wave along the stands, then rests until the next one', () => {
    const xs = [0.2, 0.8, 1.4].map((t) => waveCentre(t, 320)!);
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[2]).toBeGreaterThan(xs[1]);
    expect(waveCentre(TITLE.WAVE_PERIOD - 0.01, 320)).toBeNull();
  });

  it('throws confetti that falls and is cleared once it leaves the screen', () => {
    let pieces = throwConfetti(new Rng(1), 160, 40);
    expect(pieces).toHaveLength(TITLE.CONFETTI_COUNT);
    expect(pieces.every((c) => c.vy < 0)).toBe(true); // thrown upwards first
    for (let i = 0; i < 60 * 30 && pieces.length; i++) pieces = updateConfetti(pieces, 1 / 60, 180);
    expect(pieces).toHaveLength(0);
  });
});

describe('title parade', () => {
  it('plays all four acts in turn, and they all fit before the demo race starts', () => {
    const seen = new Set<string>();
    for (let t = 0; t < EFFECTS.ATTRACT_DELAY; t += 0.1) seen.add(currentAct(t).act);
    expect([...seen]).toEqual([...PARADE_ACTS]);
  });

  it('sprinters run left to right', () => {
    const early = athletes(parade(0.5));
    const later = athletes(parade(1.5));
    expect(early).toHaveLength(3);
    later.forEach((a, i) => expect(a.x).toBeGreaterThan(early[i].x));
  });

  it('the long jumper leaves the ground, then lands in the pit', () => {
    const start = TITLE.ACT_TIME; // long jump is the second act
    const heights = Array.from({ length: 36 }, (_, i) => athletes(parade(start + i / 10))[0]);
    const groundFeet = heights[0].k === 'athlete' ? heights[0].feet : 0;
    expect(heights.some((a) => a.k === 'athlete' && a.feet < groundFeet - 10)).toBe(true);
    const last = heights[heights.length - 1];
    const pit = parade(start).find((i) => i.k === 'pit')!;
    if (last.k !== 'athlete' || pit.k !== 'pit') throw new Error('missing');
    expect(last.feet).toBe(groundFeet);
    expect(last.x).toBeGreaterThan(pit.x);
    expect(last.x).toBeLessThan(pit.x + pit.w);
  });

  it('the javelin flies after the throw and comes down to the ground', () => {
    const start = 2 * TITLE.ACT_TIME;
    expect(parade(start + 0.2).some((i) => i.k === 'javelin')).toBe(false); // still running up
    const flying = parade(start + 2).find((i) => i.k === 'javelin');
    const landed = parade(start + TITLE.ACT_TIME - 0.01).find((i) => i.k === 'javelin');
    const thrower = athletes(parade(start + 2))[0];
    if (flying?.k !== 'javelin' || landed?.k !== 'javelin' || thrower.k !== 'athlete') throw new Error('missing');
    expect(flying.y).toBeLessThan(landed.y);
    expect(landed.y).toBeCloseTo(thrower.feet);
    expect(landed.angle).toBeLessThan(0); // point down into the grass
  });

  it('the high jumper clears the bar', () => {
    const start = 3 * TITLE.ACT_TIME;
    const bar = parade(start).find((i) => i.k === 'bar');
    if (bar?.k !== 'bar') throw new Error('missing');
    // Find the frame where the jumper passes the bar: their feet are above it.
    for (let t = 0; t < TITLE.ACT_TIME; t += 1 / 60) {
      const a = athletes(parade(start + t))[0];
      if (a.k === 'athlete' && Math.abs(a.x - bar.x) < 2) {
        expect(a.feet).toBeLessThan(bar.feet - bar.height);
        return;
      }
    }
    throw new Error('never reached the bar');
  });
});

describe('title ticker', () => {
  it('shows your bests and the top score, or a nudge to set one', () => {
    expect(tickerText({}, undefined)).toContain('SET A PERSONAL BEST IN PRACTICE!');
    const text = tickerText({ dash100: 10.5, longJump: 7.2 }, { initials: 'ANN', score: 4321, difficulty: 'normal' });
    expect(text).toContain('TOP SCORE 4321 BY ANN');
    expect(text).toContain('100 M DASH 10.50 S');
    expect(text).toContain('7.20 M');
    expect(text).toContain('TIP:');
  });

  it('scrolls in from the right and loops', () => {
    expect(tickerX(0, 500, 320)).toBe(320);
    expect(tickerX(1, 500, 320)).toBe(320 - TITLE.TICKER_SPEED);
    expect(tickerX((500 + 320) / TITLE.TICKER_SPEED, 500, 320)).toBeCloseTo(320);
  });
});
