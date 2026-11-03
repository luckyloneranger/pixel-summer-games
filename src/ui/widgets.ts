import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import { PALETTE } from '../gfx/palette';

/** Move a menu selection with up/down, wrapping around. */
export function moveSelection(input: InputSnapshot, index: number, count: number): number {
  if (input.justPressed('MENU_UP')) return (index + count - 1) % count;
  if (input.justPressed('MENU_DOWN')) return (index + 1) % count;
  return index;
}

/** -1 for left, +1 for right, 0 for neither (menu keys: arrows, A/D or touch). */
export function leftRight(input: InputSnapshot): number {
  const left = input.justPressed('MENU_LEFT');
  const right = input.justPressed('MENU_RIGHT');
  return (right ? 1 : 0) - (left ? 1 : 0);
}

/**
 * Is blinking text visible right now? With "reduce flashing" on (`steady`)
 * it's always shown, so nothing flashes.
 */
export function blink(time: number, period: number, steady: boolean): boolean {
  return steady || time % period < period / 2;
}

/** Step through a list of choices with left/right, wrapping around. */
export function cycle<T>(list: readonly T[], current: T, step: number): T {
  const i = list.indexOf(current);
  return list[(i + step + list.length) % list.length];
}

/** Dark header bar with a big title. */
export function drawHeader(r: Renderer, title: string): void {
  r.rect(0, 0, r.width, 24, PALETTE.INK);
  r.text(title, r.width / 2, 4, PALETTE.WHITE, 'center', 2);
}

export interface MenuItem {
  label: string;
  enabled?: boolean; // false = greyed out
  note?: string; // shown after the label, e.g. "PHASE 8"
}

/** A vertical menu with a > cursor on the selected item. */
export function drawMenu(r: Renderer, items: readonly MenuItem[], selected: number, x: number, y: number, lineH = 12): void {
  items.forEach((item, i) => {
    const iy = y + i * lineH;
    const isSel = i === selected;
    const enabled = item.enabled !== false;
    if (isSel) r.text('>', x - 14, iy, PALETTE.YELLOW);
    const colour = !enabled ? PALETTE.GREY_DARK : isSel ? PALETTE.WHITE : PALETTE.GREY_LIGHT;
    r.text(item.label, x, iy, colour);
    if (item.note) r.text(item.note, x + (item.label.length + 1) * 8, iy, PALETTE.GREY);
  });
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Arcade-style 3-letter initials: up/down change the letter, left/right move,
 * Enter goes to the next letter (and finishes on the last), Esc goes back.
 */
export class InitialsEntry {
  readonly letters: string[];
  position = 0;
  done = false;

  constructor(initial = 'AAA') {
    this.letters = initial.padEnd(3, 'A').slice(0, 3).toUpperCase().split('');
  }

  get value(): string {
    return this.letters.join('');
  }

  update(input: InputSnapshot): void {
    if (this.done) return;
    const i = Math.max(0, LETTERS.indexOf(this.letters[this.position]));
    if (input.justPressed('MENU_UP')) this.letters[this.position] = LETTERS[(i + 1) % LETTERS.length];
    if (input.justPressed('MENU_DOWN')) this.letters[this.position] = LETTERS[(i + LETTERS.length - 1) % LETTERS.length];
    const step = leftRight(input);
    if (step !== 0) this.position = Math.min(2, Math.max(0, this.position + step));
    if (input.justPressed('CONFIRM')) {
      if (this.position < 2) this.position++;
      else this.done = true;
    } else if (input.justPressed('BACK') && this.position > 0) {
      this.position--;
    }
  }

  /** Big letters centred at cx, with the current one blinking/underlined. */
  render(r: Renderer, cx: number, y: number, time: number, active = true, steady = false): void {
    const size = 16;
    const left = cx - (size * 3 + 8) / 2;
    for (let i = 0; i < 3; i++) {
      const x = left + i * (size + 4);
      const current = active && i === this.position;
      const show = !current || blink(time, 0.5, steady);
      if (show) r.text(this.letters[i], x, y, current ? PALETTE.YELLOW : PALETTE.WHITE, 'left', 2);
      r.rect(x, y + size + 2, size - 2, 2, current ? PALETTE.YELLOW : PALETTE.GREY_DARK);
    }
  }
}
