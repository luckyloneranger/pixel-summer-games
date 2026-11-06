// Gamepads (browser Gamepad API): polled every step and turned into "Pad..."
// key codes, so they go through the same key map as the keyboard and touch.

import { GAMEPAD } from '../game/tuning';

/** Standard-layout button numbers -> our codes. */
const BUTTONS: Record<number, string> = {
  0: 'PadA',
  1: 'PadB',
  2: 'PadX',
  3: 'PadY',
  4: 'PadLB',
  5: 'PadRB',
  7: 'PadRT',
  8: 'PadSelect',
  9: 'PadStart',
  12: 'PadUp',
  13: 'PadDown',
  14: 'PadLeft',
  15: 'PadRight',
};

/** The parts of a Gamepad we read (so tests can pass a fake). */
export interface PadLike {
  buttons: readonly { pressed: boolean }[];
  axes: readonly number[];
}

/**
 * Which of our codes a pad is holding right now (the left stick counts as the
 * d-pad). The first pad's codes start "Pad", the second's "Pad2" (player 2).
 */
export function heldCodes(pad: PadLike, second = false): Set<string> {
  const held = new Set<string>();
  const add = (code: string) => held.add(second ? code.replace(/^Pad/, 'Pad2') : code);
  pad.buttons.forEach((b, i) => {
    const code = BUTTONS[i];
    if (code && b.pressed) add(code);
  });
  const [x = 0, y = 0] = pad.axes;
  if (x < -GAMEPAD.STICK) add('PadLeft');
  if (x > GAMEPAD.STICK) add('PadRight');
  if (y < -GAMEPAD.STICK) add('PadUp');
  if (y > GAMEPAD.STICK) add('PadDown');
  return held;
}

/** Turns pad changes into key presses and releases. */
export class GamepadPoller {
  private held = new Set<string>();
  /** Pads connected at the last poll. */
  count = 0;

  /**
   * Compare what's held now with last time and report the changes. Returns
   * true if any button was newly pressed (the player is using the pad).
   */
  poll(pads: readonly (PadLike | null)[], press: (code: string) => void, release: (code: string) => void): boolean {
    const now = new Set<string>();
    // The first connected pad is player 1, the next one player 2.
    const connected = pads.filter((p): p is PadLike => p !== null);
    connected.slice(0, 2).forEach((p, i) => {
      for (const c of heldCodes(p, i === 1)) now.add(c);
    });
    this.count = connected.length;
    let pressed = false;
    for (const c of now) {
      if (!this.held.has(c)) {
        press(c);
        pressed = true;
      }
    }
    for (const c of this.held) if (!now.has(c)) release(c);
    this.held = now;
    return pressed;
  }
}

/** The connected pads (empty where the browser has no Gamepad API). */
export function connectedPads(): readonly (PadLike | null)[] {
  return typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
}
