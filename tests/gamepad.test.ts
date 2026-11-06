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

  it('A mashes to run and confirms, B acts and goes back, LB and RB still run', () => {
    const input = new Input(DEFAULT_KEYMAP);
    input.keyDown('PadLB');
    input.beginStep();
    expect(input.justPressed('P1_LEFT')).toBe(true);
    input.keyDown('PadA');
    input.beginStep();
    expect(input.justPressed('P1_MASH')).toBe(true);
    expect(input.justPressed('CONFIRM')).toBe(true);
    expect(input.justPressed('P1_ACTION')).toBe(false);
    input.keyDown('PadB');
    input.beginStep();
    expect(input.justPressed('P1_ACTION')).toBe(true);
    expect(input.justPressed('BACK')).toBe(true);
    expect(input.justPressed('PAUSE')).toBe(false); // B mid-event jumps; it doesn't pause
  });

  it('changing keyboard keys keeps the pad buttons', () => {
    const map = buildKeymap(remapKey(null, 'P1_LEFT', 'KeyJ'));
    expect(map.P1_LEFT).toEqual(expect.arrayContaining(['KeyJ', 'PadLB', 'PadX', 'TouchLeft']));
    expect(map.P1_LEFT).not.toContain('KeyA');
  });

  it('hints name the pad buttons while it is in use', () => {
    const p = new Prompts(() => 'pad');
    expect(p.run()).toBe('A');
    expect(p.action()).toBe('B');
    expect(p.pressOk()).toBe('PRESS A');
    expect(p.backTo()).toBe('B: BACK');
    expect(p.eventHint('longJump')).toBe('MASH A  HOLD B, LET GO TO JUMP');
    expect(p.eventHint('dash100')).toBe('MASH A TO RUN');
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
    input.keyDown('Pad2B');
    input.beginStep();
    expect(input.justPressed('P2_LEFT')).toBe(true);
    expect(input.justPressed('P2_MASH')).toBe(true);
    expect(input.justPressed('P2_ACTION')).toBe(true);
    expect(input.justPressed('P1_LEFT')).toBe(false);
  });

  it('player 2 hints name pad buttons only when a second pad is connected', () => {
    expect(new Prompts(() => 'pad', () => null, () => 1).run(1)).toBe('LEFT+RIGHT');
    expect(new Prompts(() => 'pad', () => null, () => 2).run(1)).toBe('A');
  });

  it('Start pauses (and still confirms in menus)', () => {
    const input = new Input(DEFAULT_KEYMAP);
    input.keyDown('PadStart');
    input.beginStep();
    expect(input.justPressed('PAUSE')).toBe(true);
    expect(input.justPressed('CONFIRM')).toBe(true);
  });
});

describe('mashing A to run', () => {
  it('every press counts, with no need to alternate', async () => {
    const { TapRunner, applyRunPresses } = await import('../src/events/tap-runner');
    const r = new TapRunner();
    expect(applyRunPresses(r, false, false, true, true)).toBe(true);
    expect(applyRunPresses(r, false, false, true, true)).toBe(true);
    expect(r.taps).toBe(2);
  });

  it('about 7 presses a second on a pad keeps up with about 9 alternating key taps', async () => {
    const { TapRunner, applyRunPresses } = await import('../src/events/tap-runner');
    const run = (rate: number, mash: boolean) => {
      const r = new TapRunner();
      const dt = 1 / 60;
      let next = 0;
      let left = true;
      for (let t = 0; t < 6; t += dt) {
        if (t >= next) {
          next += 1 / rate;
          if (mash) applyRunPresses(r, false, false, true, true);
          else applyRunPresses(r, left, !left);
          left = !left;
        }
        r.update(dt);
      }
      return r.speed;
    };
    const keys = run(9, false);
    const pad = run(7, true);
    expect(Math.abs(pad - keys) / keys).toBeLessThan(0.08);
    expect(run(7, false)).toBeLessThan(keys * 0.95); // without the boost a pad would lag
  });
});
