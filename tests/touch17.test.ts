import { describe, expect, it } from 'vitest';
import { eventButtons, eventWideButtons, isChord } from '../src/ui/touch-controls';
import { rowAt } from '../src/ui/widgets';
import { Hurdles110Event } from '../src/events/hurdles110';
import { Rng } from '../src/core/rng';
import { NOTHING, STEP, pressed } from './helpers';
import { Prompts } from '../src/ui/prompts';

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('touch: field events', () => {
  it('the wide ACTION area is much bigger and never covers a run pad', () => {
    const wide = eventWideButtons();
    const action = wide.find((b) => b.code === 'TouchAction')!;
    const plain = eventButtons().find((b) => b.code === 'TouchAction')!;
    expect(action.w * action.h).toBeGreaterThan(plain.w * plain.h * 2.5);
    for (const pad of wide.filter((b) => b.code === 'TouchLeft' || b.code === 'TouchRight')) expect(overlap(action, pad)).toBe(false);
  });
});

describe('touch: two thumbs at once', () => {
  const held = new Set(['TouchLeft']);
  it('counts as a chord only when both pads go down together', () => {
    expect(isChord({ code: 'TouchLeft', at: 1000 }, 'TouchRight', 1030, held)).toBe(true);
    expect(isChord({ code: 'TouchLeft', at: 1000 }, 'TouchRight', 1120, held)).toBe(false); // ordinary fast tapping
    expect(isChord({ code: 'TouchLeft', at: 1000 }, 'TouchRight', 1030, new Set())).toBe(false); // first thumb already up
    expect(isChord({ code: 'TouchRight', at: 1000 }, 'TouchRight', 1010, new Set(['TouchRight']))).toBe(false);
    expect(isChord(null, 'TouchRight', 1000, held)).toBe(false);
  });

  it('a chord jumps in the hurdles', () => {
    const e = new Hurdles110Event();
    e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(1) });
    for (let i = 0; i < 60 * 10 && e.phase !== 'running'; i++) e.update(STEP, NOTHING);
    e.update(STEP, pressed('P1_LEFT'));
    e.update(STEP, pressed('P1_CHORD'));
    expect(e.player.jumpTime).not.toBeNull();
  });

  it('the phone hint says so', () => {
    expect(new Prompts(() => 'touch').eventHint('hurdles110')).toContain('BOTH');
  });
});

describe('tapping list rows', () => {
  it('finds the row under a tap', () => {
    expect(rowAt(36, 36, 13, 8)).toBe(0);
    expect(rowAt(36 + 13 * 2 + 3, 36, 13, 8)).toBe(2);
    expect(rowAt(36 + 13 * 9, 36, 13, 8)).toBe(-1); // below the last row
    expect(rowAt(10, 36, 13, 8)).toBe(-1); // above the list
  });
});
