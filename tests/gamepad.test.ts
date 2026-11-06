import { describe, expect, it } from 'vitest';
import { GamepadPoller, heldCodes, type PadLike } from '../src/core/gamepad';
import { DEFAULT_KEYMAP, buildKeymap, remapKey } from '../src/core/keymap';
import { Input } from '../src/core/input';
import { Prompts } from '../src/ui/prompts';

/** A standard pad with these buttons held and the stick at (x, y). */
function pad(buttons: number[] = [], x = 0, y = 0): PadLike {
  return { buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })), axes: [x, y, 0, 0] };
}

describe('gamepad', () => {
  it('reads buttons, the d-pad and the left stick', () => {
    expect([...heldCodes(pad([0, 4]))].sort()).toEqual(['PadA', 'PadLB']);
    expect(heldCodes(pad([], -0.9, 0)).has('PadLeft')).toBe(true);
    expect(heldCodes(pad([], 0.3, 0)).size).toBe(0); // a small nudge isn't a press
    expect(heldCodes(pad([15])).has('PadRight')).toBe(true);
  });

  it('reports presses and releases once each', () => {
    const poller = new GamepadPoller();
    const log: string[] = [];
    const press = (c: string) => log.push(`+${c}`);
    const release = (c: string) => log.push(`-${c}`);
    expect(poller.poll([pad([4])], press, release)).toBe(true);
    expect(poller.poll([pad([4])], press, release)).toBe(false); // still held: nothing new
    poller.poll([pad([5])], press, release);
    expect(log).toEqual(['+PadLB', '+PadRB', '-PadLB']);
    expect(poller.poll([null], press, release)).toBe(false); // pad unplugged: everything released
    expect(log.at(-1)).toBe('-PadRB');
  });

  it('LB and RB run, A acts and confirms, B goes back', () => {
    const input = new Input(DEFAULT_KEYMAP);
    input.keyDown('PadLB');
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(true);
    input.keyDown('PadA');
    input.beginStep();
    expect(input.justPressed('P1_ACTION')).toBe(true);
    expect(input.justPressed('CONFIRM')).toBe(true);
    input.keyDown('PadB');
    input.beginStep();
    expect(input.justPressed('BACK')).toBe(true);
  });

  it('changing keyboard keys keeps the pad buttons', () => {
    const map = buildKeymap(remapKey(null, 'P1_LEFT', 'KeyJ'));
    expect(map.P1_LEFT).toEqual(expect.arrayContaining(['KeyJ', 'PadLB', 'PadX', 'TouchLeft']));
    expect(map.P1_LEFT).not.toContain('KeyA');
  });

  it('hints name the pad buttons while it is in use', () => {
    const p = new Prompts(() => 'pad');
    expect(p.run()).toBe('LB+RB');
    expect(p.action()).toBe('A');
    expect(p.pressOk()).toBe('PRESS A');
    expect(p.backTo()).toBe('B: BACK');
    expect(p.eventHint('longJump')).toBe('RUN LB+RB  HOLD A, LET GO TO JUMP');
    expect(p.run(1)).toBe('LEFT+RIGHT'); // player 2 is still on the keyboard
  });
});

describe('two gamepads', () => {
  it('the second pad drives player 2', () => {
    const poller = new GamepadPoller();
    const pressedCodes: string[] = [];
    poller.poll([pad([4]), pad([4, 0])], (c) => pressedCodes.push(c), () => {});
    expect(pressedCodes.sort()).toEqual(['Pad2A', 'Pad2LB', 'PadLB']);
    expect(poller.count).toBe(2);
    const input = new Input(DEFAULT_KEYMAP);
    input.keyDown('Pad2LB');
    input.keyDown('Pad2A');
    input.beginStep();
    expect(input.justPressed('P2_LEFT')).toBe(true);
    expect(input.justPressed('P2_ACTION')).toBe(true);
    expect(input.justPressed('P1_LEFT')).toBe(false);
  });

  it('player 2 hints name pad buttons only when a second pad is connected', () => {
    expect(new Prompts(() => 'pad', () => null, () => 1).run(1)).toBe('LEFT+RIGHT');
    expect(new Prompts(() => 'pad', () => null, () => 2).run(1)).toBe('LB+RB');
  });

  it('Start pauses (and still confirms in menus)', () => {
    const input = new Input(DEFAULT_KEYMAP);
    input.keyDown('PadStart');
    input.beginStep();
    expect(input.justPressed('PAUSE')).toBe(true);
    expect(input.justPressed('CONFIRM')).toBe(true);
  });
});
