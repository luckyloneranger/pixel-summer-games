import type { InputSnapshot } from '../src/core/input';
import type { Action } from '../src/core/keymap';

/** A fake input for one logic step: the listed actions were just pressed. */
export function pressed(...actions: Action[]): InputSnapshot {
  const set = new Set(actions);
  return {
    isDown: (a) => set.has(a),
    justPressed: (a) => set.has(a),
    justReleased: () => false,
  };
}

export const NOTHING = pressed();
export const STEP = 1 / 60;
