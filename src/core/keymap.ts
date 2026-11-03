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
  | 'MENU_UP'
  | 'MENU_DOWN'
  | 'CONFIRM'
  | 'BACK'
  | 'MUTE'
  | 'DEBUG'
  | 'DEBUG_SLOWER'
  | 'DEBUG_FASTER'
  | 'DEBUG_SKIP';

export type KeyMap = Record<Action, string[]>;

export const DEFAULT_KEYMAP: KeyMap = {
  P1_LEFT: ['KeyA'],
  P1_RIGHT: ['KeyD'],
  P1_ACTION: ['KeyW', 'Space'],
  P2_LEFT: ['ArrowLeft'],
  P2_RIGHT: ['ArrowRight'],
  P2_ACTION: ['ArrowUp'],
  MENU_UP: ['ArrowUp', 'KeyW'],
  MENU_DOWN: ['ArrowDown', 'KeyS'],
  CONFIRM: ['Enter', 'NumpadEnter'],
  BACK: ['Escape', 'KeyP'],
  MUTE: ['KeyM'],
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
