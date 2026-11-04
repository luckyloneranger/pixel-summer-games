import { describe, expect, it } from 'vitest';
import { Input } from '../src/core/input';
import { DEFAULT_KEYMAP, REMAPPABLE, buildKeymap, defaultControls, keyName, remapKey } from '../src/core/keymap';
import { Rng } from '../src/core/rng';
import { STORAGE_KEY, SaveStore, type StorageBackend } from '../src/core/storage';
import { Dash100Event } from '../src/events/dash100';
import { Hurdles110Event } from '../src/events/hurdles110';
import { LongJumpEvent } from '../src/events/long-jump';
import { TapRunner } from '../src/events/tap-runner';
import { ASSIST, DISPLAY, LONG_JUMP, RUNNER } from '../src/game/tuning';
import { eventButtons, hitTest, menuButtons, screenToGame } from '../src/ui/touch-controls';
import { blink } from '../src/ui/widgets';
import type { InputSnapshot } from '../src/core/input';
import type { Action } from '../src/core/keymap';
import { NOTHING, STEP, pressed } from './helpers';

describe('touch controls', () => {
  it('converts screen positions to game pixels at any scale', () => {
    const rect = { left: 10, top: 20, width: 640, height: 360 };
    expect(screenToGame(10, 20, rect)).toEqual({ x: 0, y: 0 });
    expect(screenToGame(650, 380, rect)).toEqual({ x: 320, y: 180 });
    expect(screenToGame(330, 200, rect)).toEqual({ x: 160, y: 90 });
    const big = { left: 0, top: 0, width: 1280, height: 720 };
    expect(screenToGame(640, 360, big)).toEqual({ x: 160, y: 90 });
  });

  it('finds the button under a finger, with a little slop', () => {
    const buttons = eventButtons();
    const left = buttons.find((b) => b.code === 'TouchLeft')!;
    expect(hitTest(buttons, left.x + 5, left.y + 5)?.code).toBe('TouchLeft');
    expect(hitTest(buttons, left.x - 2, left.y + 5)?.code).toBe('TouchLeft');
    expect(hitTest(buttons, 160, 90)).toBeNull();
  });

  it('every button fits on screen and none overlap', () => {
    for (const layout of [eventButtons(), menuButtons()]) {
      for (const b of layout) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(DISPLAY.WIDTH);
        expect(b.y + b.h).toBeLessThanOrEqual(DISPLAY.HEIGHT);
      }
      for (const a of layout) {
        for (const b of layout) {
          if (a === b) continue;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap, `${a.code} / ${b.code}`).toBe(false);
        }
      }
    }
  });

  it('touch buttons drive the same actions as keys', () => {
    const input = new Input();
    input.keyDown('TouchLeft');
    input.keyDown('TouchAction');
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(true);
    expect(input.justPressed('MENU_LEFT')).toBe(true);
    expect(input.justPressed('P1_ACTION')).toBe(true);
    input.keyDown('TouchPause');
    input.beginStep();
    expect(input.justPressed('BACK')).toBe(true);
  });
});

describe('key remapping', () => {
  it('gives an action the new key', () => {
    const c = remapKey(null, 'P1_ACTION', 'KeyJ')!;
    expect(c.P1_ACTION).toEqual(['KeyJ']);
    expect(c.P1_LEFT).toEqual(['KeyA']);
  });

  it('swaps when the key belonged to another action', () => {
    const c = remapKey(null, 'P1_LEFT', 'KeyD')!; // D was P1 RIGHT
    expect(c.P1_LEFT).toEqual(['KeyD']);
    expect(c.P1_RIGHT).toEqual(['KeyA']);
  });

  it('takes a key away from an action that still has another', () => {
    const c = remapKey(null, 'P2_ACTION', 'Space')!; // P1 ACTION had W and Space
    expect(c.P1_ACTION).toEqual(['KeyW']);
    expect(c.P2_ACTION).toEqual(['Space']);
  });

  it('refuses keys reserved for menus', () => {
    expect(remapKey(null, 'P1_LEFT', 'Enter')).toBeNull();
    expect(remapKey(null, 'P1_LEFT', 'Escape')).toBeNull();
  });

  it('builds the key map with touch codes kept and menu keys untouched', () => {
    const map = buildKeymap(remapKey(null, 'P1_LEFT', 'KeyJ'));
    expect(map.P1_LEFT).toEqual(['KeyJ', 'TouchLeft', 'PadLB', 'PadX']); // on-screen and pad buttons stay
    expect(map.MENU_LEFT).toEqual(DEFAULT_KEYMAP.MENU_LEFT);
    expect(buildKeymap(null)).toEqual(DEFAULT_KEYMAP);
    const input = new Input(map);
    input.keyDown('KeyJ');
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(true);
  });

  it('is saved and loaded back', () => {
    const items = new Map<string, string>();
    const backend: StorageBackend = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) };
    const a = new SaveStore(backend);
    a.data.settings.controls = remapKey(null, 'P2_LEFT', 'KeyJ');
    a.save();
    expect(items.has(STORAGE_KEY)).toBe(true);
    expect(new SaveStore(backend).data.settings.controls?.P2_LEFT).toEqual(['KeyJ']);
  });

  it('defaults list every remappable action without touch codes', () => {
    const d = defaultControls();
    for (const a of REMAPPABLE) {
      expect(d[a].length).toBeGreaterThan(0);
      expect(d[a].some((k) => k.startsWith('Touch'))).toBe(false);
    }
  });

  it('remembers the last physical key pressed', () => {
    const input = new Input();
    input.keyDown('KeyQ'); // not mapped to anything
    expect(input.takeLastKey()).toBe('KeyQ');
    expect(input.takeLastKey()).toBeNull();
    input.keyDown('TouchLeft');
    expect(input.takeLastKey()).toBeNull();
  });

  it('names keys nicely', () => {
    expect(keyName('KeyA')).toBe('A');
    expect(keyName('ArrowLeft')).toBe('LEFT');
    expect(keyName('Space')).toBe('SPACE');
    expect(keyName('Digit5')).toBe('5');
  });
});

/** Input with run keys held but nothing freshly pressed. */
function holdingRun(extra: Action[] = []): InputSnapshot {
  const held = new Set<Action>(['P1_RIGHT', ...extra]);
  return { isDown: (a) => held.has(a), justPressed: () => false, justReleased: () => false };
}

describe('assist run', () => {
  it('builds up to 80% of top speed and no further', () => {
    const r = new TapRunner();
    for (let i = 0; i < 600; i++) {
      r.assist(STEP);
      r.update(STEP);
    }
    expect(r.speedFraction).toBeLessThanOrEqual(ASSIST.SPEED_FRACTION);
    expect(r.speedFraction).toBeGreaterThan(ASSIST.SPEED_FRACTION - 0.02);
  });

  it('does nothing while the angle meter is held', () => {
    const r = new TapRunner();
    r.canAccelerate = false;
    expect(r.assist(STEP)).toBe(false);
    expect(r.speed).toBe(0);
  });

  it('lets a player run a race by holding a key', () => {
    const e = new Dash100Event();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1), assist: true });
    e.update(STEP, NOTHING);
    for (let i = 0; e.phase !== 'running' && i < 10_000; i++) e.update(STEP, NOTHING);
    for (let i = 0; i < 600; i++) e.update(STEP, holdingRun());
    expect(e.runner.position).toBeGreaterThan(40);
    expect(e.runner.speedFraction).toBeLessThanOrEqual(ASSIST.SPEED_FRACTION);
  });

  it('is off unless the option is on', () => {
    const e = new Dash100Event();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1) });
    for (let i = 0; e.phase !== 'running' && i < 10_000; i++) e.update(STEP, NOTHING);
    for (let i = 0; i < 120; i++) e.update(STEP, holdingRun());
    expect(e.runner.position).toBe(0);
  });

  it('pressing a run key before GO is still a false start', () => {
    const e = new Dash100Event();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1), assist: true });
    e.update(STEP, pressed('P1_RIGHT'));
    expect(e.phase).toBe('falseStart');
  });

  it('adds no speed in the air over a hurdle', () => {
    const e = new Hurdles110Event();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1), assist: true });
    for (let i = 0; e.phase !== 'running' && i < 10_000; i++) e.update(STEP, NOTHING);
    e.runner.speed = 5;
    e.update(STEP, pressed('P1_ACTION')); // take off
    const before = e.runner.speed;
    e.update(STEP, holdingRun());
    expect(e.runner.speed).toBeLessThan(before);
  });

  it('works on the long jump runway, and not during the angle hold', () => {
    const e = new LongJumpEvent();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1), assist: true });
    for (let i = 0; i < 120; i++) e.update(STEP, holdingRun());
    expect(e.phase).toBe('runup');
    expect(e.runner.speed).toBeGreaterThan(5);
    const speed = e.runner.speed;
    const holdAction = { isDown: (a: Action) => a === 'P1_ACTION' || a === 'P1_RIGHT', justPressed: (a: Action) => a === 'P1_ACTION', justReleased: () => false };
    e.update(STEP, holdAction);
    expect(e.phase).toBe('hold');
    expect(e.runner.position).toBeLessThan(LONG_JUMP.RUNWAY);
    const held = { ...holdAction, justPressed: () => false };
    for (let i = 0; i < 5; i++) e.update(STEP, held);
    expect(e.runner.speed).toBeCloseTo(speed + 0, 0);
    expect(e.runner.speed).toBeLessThanOrEqual(RUNNER.MAX_SPEED * ASSIST.SPEED_FRACTION);
  });
});

describe('reduce flashing', () => {
  it('keeps blinking text steady', () => {
    expect(blink(0.6, 1, false)).toBe(false);
    expect(blink(0.6, 1, true)).toBe(true);
    expect(blink(0.2, 1, false)).toBe(true);
  });
});
