import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { InputSnapshot } from '../src/core/input';
import type { Action } from '../src/core/keymap';
import { Dash100Event } from '../src/events/dash100';
import type { SoundCue, SoundSink } from '../src/events/event';
import { HURDLE_POSITIONS, Hurdles110Event } from '../src/events/hurdles110';
import { JavelinEvent } from '../src/events/javelin';
import { LongJumpEvent } from '../src/events/long-jump';
import type { RunUpFieldEvent } from '../src/events/run-up-event';
import { AUDIO, LONG_JUMP, JAVELIN } from '../src/game/tuning';
import { NOTHING, STEP, pressed } from './helpers';

/** A sound sink that records every cue. */
function recorder(): SoundSink & { cues: SoundCue[]; count: (c: SoundCue) => number } {
  const cues: SoundCue[] = [];
  return { cues, play: (c) => void cues.push(c), count: (c) => cues.filter((x) => x === c).length };
}

function ctx(sound: SoundSink) {
  return { players: [{ initials: 'P1' }], difficulty: 'normal' as const, rng: new Rng(1), sound };
}

function waitForGo(e: Dash100Event | Hurdles110Event): void {
  for (let i = 0; e.phase !== 'running' && i < 10_000; i++) e.update(STEP, NOTHING);
}

describe('race sounds', () => {
  it('fires the pistol exactly once, at GO', () => {
    const s = recorder();
    const e = new Dash100Event();
    e.init(ctx(s));
    for (let i = 0; i < 60 && e.phase !== 'running'; i++) e.update(STEP, NOTHING);
    expect(s.count('pistol')).toBe(0);
    waitForGo(e);
    expect(s.count('pistol')).toBe(1);
    for (let i = 0; i < 120; i++) e.update(STEP, NOTHING);
    expect(s.count('pistol')).toBe(1);
  });

  it('buzzes on a false start', () => {
    const s = recorder();
    const e = new Dash100Event();
    e.init(ctx(s));
    e.update(STEP, pressed('P1_LEFT'));
    expect(s.count('buzzer')).toBe(1);
  });

  it('footsteps come faster when running faster', () => {
    const steps = (rate: number) => {
      const s = recorder();
      const e = new Dash100Event();
      e.init(ctx(s));
      waitForGo(e);
      const every = Math.round(60 / rate);
      let left = true;
      for (let i = 0; i < 4 * 60; i++) {
        const tap = i % every === 0;
        e.update(STEP, tap ? pressed(left ? 'P1_LEFT' : 'P1_RIGHT') : NOTHING);
        if (tap) left = !left;
      }
      return s.count('footstep');
    };
    expect(steps(10)).toBeGreaterThan(steps(5));
  });

  it('the crowd hushes for the start and gets louder with speed', () => {
    const e = new Dash100Event();
    e.init(ctx(recorder()));
    expect(e.crowdLevel()).toBe(AUDIO.CROWD_HUSH);
    waitForGo(e);
    const slow = e.crowdLevel();
    e.runner.speed = 11;
    expect(e.crowdLevel()).toBeGreaterThan(slow);
  });

  it('cheers when the player finishes', () => {
    const s = recorder();
    const e = new Dash100Event();
    e.init(ctx(s));
    waitForGo(e);
    e.runner.position = 99.9;
    e.runner.speed = 10;
    e.update(STEP, NOTHING);
    expect(s.count('cheer')).toBe(1);
  });
});

describe('hurdle sounds', () => {
  it('jumps and clanks', () => {
    const s = recorder();
    const e = new Hurdles110Event();
    e.init(ctx(s));
    waitForGo(e);
    e.update(STEP, pressed('P1_ACTION'));
    expect(s.count('jump')).toBe(1);
    // Land, then run straight into the first hurdle.
    for (let i = 0; i < 40; i++) e.update(STEP, NOTHING);
    e.runner.position = HURDLE_POSITIONS[0] - 0.05;
    e.runner.speed = 10;
    e.update(STEP, NOTHING);
    expect(s.count('clank')).toBe(1);
  });
});

function holding(fresh = false): InputSnapshot {
  const set = new Set<Action>(['P1_ACTION']);
  return { isDown: (a) => set.has(a), justPressed: (a) => fresh && set.has(a), justReleased: () => false };
}

function fieldThrow(e: RunUpFieldEvent, runway: number, x: number): void {
  e.update(STEP, pressed('P1_LEFT'));
  e.runner.position = runway + x;
  e.runner.speed = 11;
  e.update(STEP, holding(true));
  while (e.phase === 'hold' && e.meter.angle < 40) e.update(STEP, holding());
  e.update(STEP, NOTHING);
  for (let i = 0; i < 1000 && e.phase === 'flight'; i++) e.update(STEP, NOTHING);
}

describe('field event sounds', () => {
  it('long jump: jump on take-off, sand on landing, cheer for a qualifying jump', () => {
    const s = recorder();
    const e = new LongJumpEvent();
    e.init(ctx(s));
    fieldThrow(e, LONG_JUMP.RUNWAY, -6);
    expect(s.count('jump')).toBe(1);
    expect(s.count('sand')).toBe(1);
    expect(s.count('cheer')).toBe(e.lastMark! >= 7 ? 1 : 0);
  });

  it('javelin: whoosh on release, thud on landing', () => {
    const s = recorder();
    const e = new JavelinEvent();
    e.init(ctx(s));
    fieldThrow(e, JAVELIN.RUNWAY, -6);
    expect(s.count('whoosh')).toBe(1);
    expect(s.count('thud')).toBe(1);
  });

  it('a foul buzzes', () => {
    const s = recorder();
    const e = new LongJumpEvent();
    e.init(ctx(s));
    e.update(STEP, pressed('P1_LEFT'));
    e.runner.position = LONG_JUMP.RUNWAY - 0.1;
    e.runner.speed = 10;
    for (let i = 0; i < 10; i++) e.update(STEP, NOTHING);
    expect(e.phase).toBe('foul');
    expect(s.count('buzzer')).toBe(1);
  });

  it('runs without a sound sink (silent by default)', () => {
    const e = new JavelinEvent();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1) });
    expect(() => fieldThrow(e, JAVELIN.RUNWAY, -6)).not.toThrow();
  });
});
