import { type Action, type KeyMap, DEFAULT_KEYMAP, NO_SCROLL_KEYS } from './keymap';

/** What scenes read each logic step. */
export interface InputSnapshot {
  isDown(action: Action): boolean;
  justPressed(action: Action): boolean;
  justReleased(action: Action): boolean;
}

/**
 * Collects raw key events and turns them into one snapshot per logic step.
 * Events wait in a queue until the next step, so a quick tap is never lost,
 * even if the press and release both land between two steps.
 */
export class Input implements InputSnapshot {
  private readonly actionsByKey = new Map<string, Action[]>();
  private readonly heldKeys = new Set<string>();
  private readonly pendingPressed = new Set<Action>();
  private readonly pendingReleased = new Set<Action>();
  private readonly down = new Set<Action>();
  private readonly pressed = new Set<Action>();
  private readonly released = new Set<Action>();
  /** The most recent physical key pressed (any key, mapped or not). */
  private lastKey: string | null = null;

  constructor(private keymap: KeyMap = DEFAULT_KEYMAP) {
    this.setKeymap(keymap);
  }

  setKeymap(keymap: KeyMap): void {
    this.keymap = keymap;
    this.actionsByKey.clear();
    for (const action of Object.keys(keymap) as Action[]) {
      for (const code of keymap[action]) {
        const list = this.actionsByKey.get(code) ?? [];
        list.push(action);
        this.actionsByKey.set(code, list);
      }
    }
  }

  /** Raw key press. Auto-repeat (key held down) is ignored. */
  keyDown(code: string, repeat = false): void {
    if (repeat || this.heldKeys.has(code)) return;
    if (!code.startsWith('Touch') && !code.startsWith('Pad')) this.lastKey = code; // keyboard keys only (for remapping)
    const actions = this.actionsByKey.get(code);
    if (!actions) return;
    for (const a of actions) {
      if (!this.isActionHeld(a)) this.pendingPressed.add(a);
    }
    this.heldKeys.add(code);
  }

  /** Raw key release. */
  keyUp(code: string): void {
    if (!this.heldKeys.delete(code)) return;
    for (const a of this.actionsByKey.get(code) ?? []) {
      if (!this.isActionHeld(a)) this.pendingReleased.add(a);
    }
  }

  /** Release everything, e.g. when the window loses focus, so no key sticks. */
  releaseAll(): void {
    for (const code of [...this.heldKeys]) this.keyUp(code);
  }

  /** Call once at the start of every logic step. */
  beginStep(): void {
    swap(this.pendingPressed, this.pressed);
    swap(this.pendingReleased, this.released);
    this.down.clear();
    for (const action of Object.keys(this.keymap) as Action[]) {
      if (this.isActionHeld(action)) this.down.add(action);
    }
  }

  /** Take (and forget) the last physical key pressed, for remapping. */
  takeLastKey(): string | null {
    const k = this.lastKey;
    this.lastKey = null;
    return k;
  }

  isDown(action: Action): boolean {
    return this.down.has(action);
  }
  justPressed(action: Action): boolean {
    return this.pressed.has(action);
  }
  justReleased(action: Action): boolean {
    return this.released.has(action);
  }

  private isActionHeld(action: Action): boolean {
    for (const code of this.keymap[action]) if (this.heldKeys.has(code)) return true;
    return false;
  }
}

/** Move everything from `from` into `to` (which is emptied first). */
function swap(from: Set<Action>, to: Set<Action>): void {
  to.clear();
  for (const a of from) to.add(a);
  from.clear();
}

/** Wire browser keyboard and focus events into an Input. */
export function attachKeyboard(input: Input, target: Window = window): void {
  target.addEventListener('keydown', (e) => {
    if (NO_SCROLL_KEYS.has(e.code)) e.preventDefault();
    input.keyDown(e.code, e.repeat);
  });
  target.addEventListener('keyup', (e) => input.keyUp(e.code));
  target.addEventListener('blur', () => input.releaseAll());
}
