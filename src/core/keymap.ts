// Logical actions the game understands, and which keys trigger them.
// Keys use KeyboardEvent.code, so they follow physical key positions
// on any keyboard layout. Options will allow remapping later.

export type Action =
  | 'P1_LEFT'
  | 'P1_RIGHT'
  | 'P1_ACTION'
  | 'P2_LEFT'
  | 'P2_RIGHT'
  | 'P2_ACTION'
  | 'P1_CHORD'
  | 'PAUSE'
  | 'MENU_UP'
  | 'MENU_DOWN'
  | 'MENU_LEFT'
  | 'MENU_RIGHT'
  | 'CONFIRM'
  | 'BACK'
  | 'MUTE'
  | 'DEBUG'
  | 'DEBUG_SLOWER'
  | 'DEBUG_FASTER'
  | 'DEBUG_SKIP';

export type KeyMap = Record<Action, string[]>;

// Codes starting with "Touch" come from the on-screen buttons (ui/touch-controls.ts),
// and "Pad" from a gamepad (core/gamepad.ts): LB/RB or X/Y to run, A to act, B back.
export const DEFAULT_KEYMAP: KeyMap = {
  P1_LEFT: ['KeyA', 'TouchLeft', 'PadLB', 'PadX'],
  P1_RIGHT: ['KeyD', 'TouchRight', 'PadRB', 'PadY'],
  P1_ACTION: ['KeyW', 'Space', 'TouchAction', 'PadA', 'PadRT'],
  P2_LEFT: ['ArrowLeft', 'Pad2LB', 'Pad2X'],
  P2_RIGHT: ['ArrowRight', 'Pad2RB', 'Pad2Y'],
  P2_ACTION: ['ArrowUp', 'Pad2A', 'Pad2RT'],
  P1_CHORD: ['TouchChord'], // both run pads at once (touch): the hurdles' jump
  PAUSE: ['PadStart', 'Pad2Start'], // Start pauses an event (it also confirms in menus)
  MENU_UP: ['ArrowUp', 'KeyW', 'TouchUp', 'PadUp'],
  MENU_DOWN: ['ArrowDown', 'KeyS', 'TouchDown', 'PadDown'],
  MENU_LEFT: ['ArrowLeft', 'KeyA', 'TouchLeft', 'PadLeft'],
  MENU_RIGHT: ['ArrowRight', 'KeyD', 'TouchRight', 'PadRight'],
  CONFIRM: ['Enter', 'NumpadEnter', 'TouchOk', 'PadA', 'PadStart'],
  BACK: ['Escape', 'KeyP', 'TouchBack', 'TouchPause', 'PadB', 'PadSelect'],
  MUTE: ['KeyM', 'TouchMute'],
  DEBUG: ['Backquote'],
  DEBUG_SLOWER: ['BracketLeft'],
  DEBUG_FASTER: ['BracketRight'],
  DEBUG_SKIP: ['KeyN'],
};

/** Keys whose browser default (page scrolling) we block. */
export const NO_SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

/** The gameplay keys players can remap in Options > Controls. */
export const REMAPPABLE: readonly Action[] = ['P1_LEFT', 'P1_RIGHT', 'P1_ACTION', 'P2_LEFT', 'P2_RIGHT', 'P2_ACTION'];
export type Controls = Record<string, string[]>;

/** Keys kept for menus and pause, so nobody can remap themselves into a corner. */
export const RESERVED_KEYS = new Set(['Enter', 'NumpadEnter', 'Escape', 'KeyP', 'KeyM', 'Backquote']);

/** The keyboard keys (no touch codes) each remappable action starts with. */
export function defaultControls(): Controls {
  const c: Controls = {};
  for (const a of REMAPPABLE) c[a] = DEFAULT_KEYMAP[a].filter((k) => !isFixedCode(k));
  return c;
}

/**
 * Give `action` the new key. If another remappable action used that key, it
 * loses it, and if that leaves it with no key it takes this action's old keys
 * (a swap). Returns null if the key is reserved for menus.
 */
export function remapKey(controls: Controls | null, action: Action, key: string): Controls | null {
  if (RESERVED_KEYS.has(key)) return null;
  const next: Controls = { ...(controls ?? defaultControls()) };
  const old = next[action];
  for (const other of REMAPPABLE) {
    if (other === action || !next[other].includes(key)) continue;
    const left = next[other].filter((k) => k !== key);
    next[other] = left.length ? left : old;
  }
  next[action] = [key];
  return next;
}

/** On-screen buttons and gamepad buttons: always mapped, never remapped. */
export function isFixedCode(code: string): boolean {
  return code.startsWith('Touch') || code.startsWith('Pad');
}

/** The full key map with saved controls applied (touch and pad codes always kept). */
export function buildKeymap(controls: Controls | null): KeyMap {
  const map: KeyMap = { ...DEFAULT_KEYMAP };
  if (!controls) return map;
  for (const a of REMAPPABLE) {
    const touch = DEFAULT_KEYMAP[a].filter(isFixedCode);
    map[a] = [...(controls[a] ?? defaultControls()[a]), ...touch];
  }
  return map;
}

/** A friendly name for a key code: "KeyA" -> "A", "ArrowLeft" -> "LEFT". */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  if (code.startsWith('Numpad')) return `NUM${code.slice(6).toUpperCase()}`;
  return code.replace(/(Left|Right)$/, ' $1').toUpperCase();
}
