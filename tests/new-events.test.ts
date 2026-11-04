import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { InputSnapshot } from '../src/core/input';
import { createEvent } from '../src/game/events';
import { ALL_EVENTS, ONLINE_EVENTS } from '../src/game/championship';
import { EVENT_KIND, EVENT_NAMES, pointsFor, qualifyingMark } from '../src/game/scoring';
import { STADIUM_THEMES } from '../src/gfx/backgrounds';
import { KEYBOARD_PROMPTS } from '../src/ui/prompts';
import { CPU_FIELD, HAMMER, POLE_VAULT, SCORING, TRIPLE_JUMP } from '../src/game/tuning';
import { TripleJumpEvent, contactFor } from '../src/events/triple-jump';
import { PoleVaultEvent } from '../src/events/pole-vault';
import { HammerEvent, markFor as hammerMark, sectorOffset } from '../src/events/hammer';
import { Swim50Event } from '../src/events/swim50';
import { NOTHING, STEP, pressed } from './helpers';

const hold = (fresh: boolean): InputSnapshot => ({
  isDown: (a) => a === 'P1_ACTION',
  justPressed: (a) => fresh && a === 'P1_ACTION',
  justReleased: () => false,
});

describe('every event is wired up', () => {
  it('has a class, name, kind, scoring, theme and controls hint', () => {
    for (const id of ALL_EVENTS) {
      const e = createEvent(id);
      expect(e.id).toBe(id);
      expect(EVENT_NAMES[id].length).toBeGreaterThan(0);
      expect(EVENT_KIND[id]).toMatch(/race|field/);
      expect(SCORING[id].PAR).toBeDefined();
      expect(STADIUM_THEMES[id]).toBeDefined();
      expect(KEYBOARD_PROMPTS.eventHint(id).length).toBeLessThanOrEqual(36);
      expect(pointsFor(id, SCORING[id].PAR)).toBe(1000);
    }
    expect(ONLINE_EVENTS).not.toContain('hammer');
    expect(ALL_EVENTS).toHaveLength(9);
  });
});

describe('triple jump', () => {
  it('a tap just before touchdown is a good contact, a bit earlier is weak, none ends it', () => {
    expect(contactFor(0.05)).toBe('good');
    expect(contactFor(TRIPLE_JUMP.TIMING_WINDOW + 0.05)).toBe('weak');
    expect(contactFor(TRIPLE_JUMP.LATE_WINDOW + 0.1)).toBe('missed');
    expect(contactFor(Infinity)).toBe('missed');
  });

  /** One jump at top speed and 40°, tapping Action in the air `tapEvery` steps (0 = never). */
  function jump(tapEvery: number): TripleJumpEvent {
    const e = new TripleJumpEvent();
    e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(1) });
    e.update(STEP, pressed('P1_LEFT'));
    e.runner.position = TRIPLE_JUMP.RUNWAY - 6;
    e.runner.speed = 11.5;
    e.update(STEP, hold(true));
    while (e.phase === 'hold' && e.meter.angle < 40) e.update(STEP, hold(false));
    e.update(STEP, NOTHING);
    for (let i = 0; i < 600 && e.phase === 'flight'; i++) {
      e.update(STEP, tapEvery && i % tapEvery === 0 ? pressed('P1_ACTION') : NOTHING);
    }
    return e;
  }

  it('good timing gives all three phases and a long jump; no taps stops after the hop', () => {
    const good = jump(2);
    expect(good.phaseNo).toBe(2);
    const hopOnly = jump(0);
    expect(hopOnly.phaseNo).toBe(0);
    expect(hopOnly.contact).toBe('missed');
    expect(good.lastMark!).toBeGreaterThan(hopOnly.lastMark! * 2);
    expect(good.lastMark!).toBeGreaterThan(14);
    expect(good.lastMark!).toBeLessThan(19);
  });
});

describe('pole vault', () => {
  it('uses its own bar heights and CPU range', () => {
    const e = new PoleVaultEvent();
    e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(2) });
    expect(e.jumpBar).toBe(POLE_VAULT.HEIGHTS[0]);
    for (const r of e.getResults().filter((x) => x.playerIndex < 0)) {
      if (r.mark === null) continue;
      expect(POLE_VAULT.HEIGHTS).toContain(r.mark);
      expect(r.mark).toBeGreaterThanOrEqual(CPU_FIELD.POLE_VAULT.normal[0] - 0.2);
    }
  });

  it('a steep vault at top speed clears the opening height; a flat one knocks it', () => {
    const vault = (angle: number) => {
      const e = new PoleVaultEvent();
      e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(2) });
      e.update(STEP, pressed('P1_LEFT'));
      e.runner.speed = 11.5;
      e.runner.position = POLE_VAULT.RUNWAY - 0.2 - 11.5 * (angle / 90 + 3 * STEP);
      e.update(STEP, hold(true));
      while (e.phase === 'hold' && e.meter.angle < angle) e.update(STEP, hold(false));
      e.update(STEP, NOTHING);
      return e.cleared;
    };
    expect(vault(72)).toBe(true);
    expect(vault(30)).toBe(false);
  });
});

describe('hammer throw', () => {
  it('measures the angle from straight down the field, and shortens throws off the middle', () => {
    expect(sectorOffset(0)).toBe(0);
    expect(sectorOffset(Math.PI * 2 + 0.1)).toBeCloseTo(5.73, 1);
    expect(sectorOffset(-0.1 + Math.PI * 4)).toBeCloseTo(-5.73, 1);
    expect(hammerMark(70, 0)).toBe(70);
    expect(hammerMark(70, 15)).toBeLessThan(70);
  });

  /** Spin with alternate taps for `steps`, then release at the next pass through the sector middle. */
  function spinAndThrow(e: HammerEvent, steps: number, releaseAt: number | null): void {
    for (let i = 0; i < steps && e.phase !== 'foul'; i++) e.update(STEP, i % 4 === 0 ? pressed(i % 8 ? 'P1_LEFT' : 'P1_RIGHT') : NOTHING);
    for (let i = 0; i < 600 && e.phase === 'spin'; i++) {
      const near = releaseAt !== null && Math.abs(sectorOffset(e.angle) - releaseAt) < 6;
      e.update(STEP, near ? pressed('P1_ACTION') : i % 4 === 0 ? pressed(i % 8 ? 'P1_LEFT' : 'P1_RIGHT') : NOTHING);
    }
    for (let i = 0; i < 600 && e.phase === 'flight'; i++) e.update(STEP, NOTHING);
  }

  it('a fast spin released in the sector throws far; outside it is a foul', () => {
    const e = new HammerEvent();
    e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(3) });
    spinAndThrow(e, 90, 0);
    expect(e.phase).toBe('landed');
    expect(e.lastMark!).toBeGreaterThan(40);
    const f = new HammerEvent();
    f.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(3) });
    spinAndThrow(f, 90, 90); // pointing sideways
    expect(f.phase).toBe('foul');
    expect(f.foulReason).toBe('OUTSIDE THE SECTOR');
  });

  it('tapping the same key twice adds nothing; spinning too long is a foul', () => {
    const e = new HammerEvent();
    e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(3) });
    e.update(STEP, pressed('P1_LEFT'));
    const after = e.spin;
    e.update(STEP, pressed('P1_LEFT'));
    expect(e.spin).toBeLessThanOrEqual(after);
    spinAndThrow(e, 60 * 20, null);
    expect(e.foulReason).toBe('TOO MANY TURNS');
    expect(e.turns).toBeGreaterThan(HAMMER.MAX_TURNS);
  });

  it('three throws each, then the event ends with results best first', () => {
    const e = new HammerEvent();
    e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(3) });
    for (let k = 0; k < 3; k++) {
      spinAndThrow(e, 90, 0);
      for (let i = 0; i < 60 * 4 && (e.phase === 'landed' || e.phase === 'foul'); i++) e.update(STEP, NOTHING);
    }
    expect(e.isFinished()).toBe(true);
    const results = e.getResults();
    expect(results).toHaveLength(4);
    expect(results.find((r) => r.playerIndex === 0)!.attempts).toHaveLength(3);
    for (let i = 1; i < results.length; i++) expect(results[i - 1].mark ?? -1).toBeGreaterThanOrEqual(results[i].mark ?? -1);
  });
});

describe('50 m freestyle', () => {
  it('a steady tapper swims it in a believable time', () => {
    const e = new Swim50Event();
    e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(4) });
    for (let i = 0; i < 60 * 60 && !e.isFinished(); i++) {
      e.update(STEP, e.phase === 'running' && i % 6 === 0 ? pressed(i % 12 ? 'P1_LEFT' : 'P1_RIGHT') : NOTHING);
    }
    expect(e.isFinished()).toBe(true);
    const me = e.getResults().find((r) => r.playerIndex === 0)!;
    expect(me.mark!).toBeGreaterThan(20);
    expect(me.mark!).toBeLessThan(30);
    expect(qualifyingMark('swim50', 'easy')).toBeGreaterThan(me.mark! - 5);
  });
});
