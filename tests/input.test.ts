import { describe, expect, it } from 'vitest';
import { Input } from '../src/core/input';
import { DEFAULT_KEYMAP, type Action } from '../src/core/keymap';

describe('Input', () => {
  it('reports a press for exactly one step, then held', () => {
    const input = new Input();
    input.keyDown('KeyA');
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(true);
    expect(input.isDown('P1_LEFT')).toBe(true);
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(false);
    expect(input.isDown('P1_LEFT')).toBe(true);
  });

  it('ignores keyboard auto-repeat', () => {
    const input = new Input();
    input.keyDown('KeyA');
    input.beginStep();
    input.keyDown('KeyA', true);
    input.keyDown('KeyA'); // some browsers repeat without the flag
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(false);
  });

  it('reports a release', () => {
    const input = new Input();
    input.keyDown('KeyD');
    input.beginStep();
    input.keyUp('KeyD');
    input.beginStep();
    expect(input.justReleased('P1_RIGHT')).toBe(true);
    expect(input.isDown('P1_RIGHT')).toBe(false);
  });

  it('keeps a tap that is pressed and released between two steps', () => {
    const input = new Input();
    input.keyDown('KeyA');
    input.keyUp('KeyA');
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(true);
    expect(input.justReleased('P1_LEFT')).toBe(true);
    expect(input.isDown('P1_LEFT')).toBe(false);
  });

  it('holds events until the next step instead of losing them', () => {
    const input = new Input();
    input.beginStep();
    input.keyDown('Enter');
    // No step yet (a frame with zero logic steps) – the press must wait.
    input.beginStep();
    expect(input.justPressed('CONFIRM')).toBe(true);
  });

  it('keeps an action down while any of its keys is held', () => {
    const input = new Input();
    input.keyDown('KeyW');
    input.keyDown('Space');
    input.beginStep();
    input.keyUp('KeyW');
    input.beginStep();
    expect(input.isDown('P1_ACTION')).toBe(true);
    expect(input.justReleased('P1_ACTION')).toBe(false);
  });

  it('one key can drive several actions (W is jump and menu up)', () => {
    const input = new Input();
    input.keyDown('KeyW');
    input.beginStep();
    expect(input.justPressed('P1_ACTION')).toBe(true);
    expect(input.justPressed('MENU_UP')).toBe(true);
  });

  it('ignores unmapped keys', () => {
    const input = new Input();
    input.keyDown('KeyZ');
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(false);
  });

  it('releases everything when focus is lost', () => {
    const input = new Input();
    input.keyDown('KeyA');
    input.beginStep();
    input.releaseAll();
    input.beginStep();
    expect(input.isDown('P1_LEFT')).toBe(false);
    expect(input.justReleased('P1_LEFT')).toBe(true);
  });

  it('follows a remapped key', () => {
    const input = new Input();
    input.setKeymap({ ...defaultMapWith('P1_LEFT', ['KeyJ']) });
    input.keyDown('KeyA');
    input.keyDown('KeyJ');
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(true);
    input.keyUp('KeyJ');
    input.beginStep();
    expect(input.isDown('P1_LEFT')).toBe(false);
  });
});

function defaultMapWith(action: Action, keys: string[]) {
  return { ...DEFAULT_KEYMAP, [action]: keys };
}
