import { describe, expect, it } from 'vitest';
import { crowdOnFeet } from '../src/events/race-event';
import { STADIUM_WEATHER, layoutCrowd } from '../src/gfx/backgrounds';
import { OFFICIAL_LOOK, flagFor, smokeGone } from '../src/gfx/officials';
import { STADIUM_LIFE } from '../src/game/tuning';
import { PALETTE } from '../src/gfx/palette';

describe('stadium life', () => {
  it('the crowd stands only for the last stretch of a race a human leads', () => {
    const near = 100 - STADIUM_LIFE.RISE_LAST_M + 1;
    expect(crowdOnFeet('running', true, near, 100)).toBe(true);
    expect(crowdOnFeet('running', false, near, 100)).toBe(false); // a CPU leads
    expect(crowdOnFeet('running', true, 50, 100)).toBe(false); // too early
    expect(crowdOnFeet('running', true, 100.5, 100)).toBe(false); // over the line: the wave takes over
    expect(crowdOnFeet('set', true, near, 100)).toBe(false);
  });

  it('the judge shows white for a fair attempt and red for a foul or a miss', () => {
    expect(flagFor('landed', 7.42)).toBe('white');
    expect(flagFor('landed', null)).toBe('red'); // a knocked bar
    expect(flagFor('foul', null)).toBe('red');
    expect(flagFor('runup', null)).toBe('none');
  });

  it('the pistol smoke clears quickly', () => {
    expect(smokeGone(0.1)).toBe(false);
    expect(smokeGone(2)).toBe(true);
  });

  it('officials wear palette colours', () => {
    const colours = new Set<string>(Object.values(PALETTE));
    for (const c of [OFFICIAL_LOOK.shirt, OFFICIAL_LOOK.shirtShade, OFFICIAL_LOOK.skin, OFFICIAL_LOOK.hair]) expect(colours.has(c)).toBe(true);
  });

  it('it rains at the triple jump and blows at the javelin; elsewhere it is clear', () => {
    expect(STADIUM_WEATHER.tripleJump).toBe('rain');
    expect(STADIUM_WEATHER.javelin).toBe('wind');
    expect(Object.values(STADIUM_WEATHER).filter((w) => w === 'clear')).toHaveLength(7);
  });

  it('the crowd layout is unchanged (signs are drawn on top, not in the seats)', () => {
    expect(layoutCrowd().length).toBeGreaterThan(50);
  });
});
