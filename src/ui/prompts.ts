// The words on screen for each control, so hints match the device in hand:
// keyboard names (your own keys if you changed them) or the on-screen buttons.

import type { EventId } from '../events/event';
import { defaultControls, keyName, type Controls } from '../core/keymap';

export type PromptMode = 'keys' | 'touch';

/** Lowest y (px) for a line of text above the phone control bar (it starts at 154). */
const NOTE_LIMIT = 144;

export class Prompts {
  constructor(
    private readonly mode: () => PromptMode,
    private readonly controls: () => Controls | null = () => null,
  ) {}

  /** Is the player using the on-screen buttons right now? */
  get touch(): boolean {
    return this.mode() === 'touch';
  }

  /** The two run keys: "A+D" (player 1), "LEFT+RIGHT" (player 2), or "← →". */
  run(player = 0): string {
    if (this.touch) return '← →';
    const p = player === 1 ? 'P2' : 'P1';
    return `${this.key(`${p}_LEFT`)}+${this.key(`${p}_RIGHT`)}`;
  }

  /** The jump / throw key: "W", "UP", or the ACTION button. */
  action(player = 0): string {
    return this.touch ? 'ACTION' : this.key(player === 1 ? 'P2_ACTION' : 'P1_ACTION');
  }

  ok(): string {
    return this.touch ? 'OK' : 'ENTER';
  }

  back(): string {
    return this.touch ? 'BACK' : 'ESC';
  }

  upDown(): string {
    return this.touch ? '↑ ↓' : 'UP/DOWN';
  }

  leftRight(): string {
    return this.touch ? '← →' : 'LEFT/RIGHT';
  }

  /** "PRESS ENTER" or "TAP OK". */
  pressOk(): string {
    return this.touch ? 'TAP OK' : 'PRESS ENTER';
  }

  /** The title screen's call to action (a tap anywhere starts on a phone). */
  start(): string {
    return this.touch ? 'TAP TO START' : 'PRESS START';
  }

  /** "ENTER: NEXT" / "OK: NEXT". */
  okTo(what: string): string {
    return `${this.ok()}: ${what}`;
  }

  /** "ESC: BACK"; on a phone nothing, as the BACK button already says it (other uses: "BACK: LEAVE"). */
  backTo(what = 'BACK'): string {
    return this.touch && what === 'BACK' ? '' : `${this.back()}: ${what}`;
  }

  /**
   * Where a note near the bottom goes: on a phone the control bar takes the
   * bottom of the screen, so notes move up above it.
   */
  noteY(keyboardY: number): number {
    return this.touch ? Math.min(keyboardY, NOTE_LIMIT) : keyboardY;
  }

  /** Join hint parts with a gap, skipping empty ones. */
  hint(...parts: string[]): string {
    return parts.filter((p) => p).join('  ');
  }

  /** Letter entry (initials, room code). */
  letters(): string {
    return this.touch ? '↑ ↓ LETTER  ← → MOVE  OK NEXT' : 'UP/DOWN LETTER  L/R MOVE  ENTER OK';
  }

  /** One-line controls for each event's intro card. */
  eventHint(id: EventId, player = 0): string {
    const run = this.run(player);
    const act = this.action(player);
    switch (id) {
      case 'dash100':
        return this.touch ? 'TAP ← AND → IN TURN TO RUN' : `ALTERNATE ${run} TO RUN`;
      case 'longJump':
      case 'highJump':
        return `RUN ${run}  HOLD ${act}, LET GO TO JUMP`;
      case 'javelin':
        return `RUN ${run}  HOLD ${act}, THEN LET GO`;
      case 'hurdles110':
        return `RUN ${run}  TAP ${act} TO JUMP`;
    }
  }

  /** The first key bound to a remappable action, by name. */
  private key(action: string): string {
    const keys = (this.controls() ?? defaultControls())[action] ?? defaultControls()[action];
    return keyName(keys[0]);
  }
}

/** Keyboard words with the standard keys (tests and anything without a game). */
export const KEYBOARD_PROMPTS = new Prompts(() => 'keys');
