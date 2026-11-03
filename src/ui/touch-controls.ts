import type { Input } from '../core/input';
import type { Renderer } from '../core/renderer';
import { DISPLAY, TOUCH } from '../game/tuning';
import { PALETTE } from '../gfx/palette';

/**
 * On-screen buttons for phones and tablets. Each button presses a "Touch..."
 * key code (see keymap.ts), so touch goes through exactly the same input
 * pipeline as the keyboard and every screen works unchanged.
 */
export interface TouchButton {
  code: string; // key code it presses, e.g. "TouchLeft"
  label: string;
  x: number; // game pixels
  y: number;
  w: number;
  h: number;
  big?: boolean; // draw the label at double size
  hidden?: boolean; // works but isn't drawn (the title's tap-anywhere area)
}

export type TouchLayout = 'event' | 'menu' | 'title';

const W = DISPLAY.WIDTH;
const H = DISPLAY.HEIGHT;
const M = TOUCH.MARGIN;

/** Buttons during an event: two run pads, the action button and two icons. */
export function eventButtons(): TouchButton[] {
  return [
    { code: 'TouchLeft', label: '←', x: M, y: H - M - TOUCH.PAD_H, w: TOUCH.PAD_W, h: TOUCH.PAD_H, big: true },
    { code: 'TouchRight', label: '→', x: W - M - TOUCH.PAD_W, y: H - M - TOUCH.PAD_H, w: TOUCH.PAD_W, h: TOUCH.PAD_H, big: true },
    { code: 'TouchAction', label: 'ACTION', x: (W - TOUCH.ACTION_W) / 2, y: H - M - TOUCH.ACTION_H, w: TOUCH.ACTION_W, h: TOUCH.ACTION_H },
    { code: 'TouchPause', label: 'II', x: W / 2 - TOUCH.ICON_W - 2, y: 1, w: TOUCH.ICON_W, h: TOUCH.ICON_H },
    { code: 'TouchMute', label: 'M', x: W / 2 + 2, y: 1, w: TOUCH.ICON_W, h: TOUCH.ICON_H },
  ];
}

/** Top of the menu control bar (game px); menu screens keep the space below it for the buttons. */
export const MENU_BAR_TOP = H - TOUCH.BAR_H;

/**
 * Buttons on menu screens, in one bar along the bottom edge so they never
 * cover the menu itself: arrows on the left, BACK and OK on the right.
 */
export function menuButtons(): TouchButton[] {
  const y = MENU_BAR_TOP + (TOUCH.BAR_H - TOUCH.BTN_H) / 2;
  const arrow = (code: string, label: string, i: number): TouchButton => ({
    code, label, x: M + i * (TOUCH.ARROW_W + 2), y, w: TOUCH.ARROW_W, h: TOUCH.BTN_H,
  });
  const okX = W - M - TOUCH.MENU_BTN_W;
  return [
    arrow('TouchLeft', '←', 0),
    arrow('TouchUp', '↑', 1),
    arrow('TouchDown', '↓', 2),
    arrow('TouchRight', '→', 3),
    { code: 'TouchBack', label: 'BACK', x: okX - TOUCH.MENU_BTN_W - 4, y, w: TOUCH.MENU_BTN_W, h: TOUCH.BTN_H },
    { code: 'TouchOk', label: 'OK', x: okX, y, w: TOUCH.MENU_BTN_W, h: TOUCH.BTN_H },
    { code: 'TouchMute', label: 'M', x: 2, y: 2, w: TOUCH.ICON_W, h: TOUCH.ICON_H },
  ];
}

/** The title and demo: tap anywhere to start (the sound icon still works). */
export function titleButtons(): TouchButton[] {
  return [
    { code: 'TouchMute', label: 'M', x: 2, y: 2, w: TOUCH.ICON_W, h: TOUCH.ICON_H }, // first, so it wins
    { code: 'TouchOk', label: '', x: 0, y: 0, w: W, h: H, hidden: true },
  ];
}

/** Convert a touch at (clientX, clientY) on the page into game pixels. */
export function screenToGame(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * W,
    y: ((clientY - rect.top) / rect.height) * H,
  };
}

/** The button under a point (with a little extra slop), or null. */
export function hitTest(buttons: readonly TouchButton[], x: number, y: number): TouchButton | null {
  const s = TOUCH.HIT_SLOP;
  for (const b of buttons) {
    if (x >= b.x - s && x < b.x + b.w + s && y >= b.y - s && y < b.y + b.h + s) return b;
  }
  return null;
}

/** Is this a phone or tablet (a coarse pointer with touch)? */
function looksLikeTouchDevice(): boolean {
  try {
    return navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * Shows the buttons and turns touches into key presses. Several fingers at
 * once are tracked separately; sliding a finger from one pad to another
 * releases the first and presses the second (handy for running).
 */
export class TouchControls {
  enabled = looksLikeTouchDevice();
  private layout: TouchLayout = 'menu';
  private buttons = menuButtons();
  private readonly fingers = new Map<number, string>(); // pointer id -> code held
  private guardUntil = 0; // ms timestamp: ignore new touches until then

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly input: Input,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // no long-press menu
    // A physical keyboard hides the buttons; touching the screen shows them again.
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.enabled = false;
    });
  }

  setLayout(layout: TouchLayout): void {
    if (layout === this.layout) return;
    this.releaseAll();
    // A finger still drumming on a run pad must not hit the menu button now in
    // its place. Only needed after an event: elsewhere taps are single and slow.
    if (this.layout === 'event') this.guardUntil = performance.now() + TOUCH.SWITCH_GUARD * 1000;
    this.layout = layout;
    this.buttons = layout === 'event' ? eventButtons() : layout === 'title' ? titleButtons() : menuButtons();
  }

  private at(e: PointerEvent): TouchButton | null {
    const p = screenToGame(e.clientX, e.clientY, this.canvas.getBoundingClientRect());
    return hitTest(this.buttons, p.x, p.y);
  }

  private down(e: PointerEvent): void {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.enabled = true;
    if (!this.enabled) return;
    e.preventDefault();
    if (performance.now() < this.guardUntil) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    const b = this.at(e);
    if (b) this.press(e.pointerId, b.code);
  }

  private move(e: PointerEvent): void {
    if (!this.fingers.has(e.pointerId)) return;
    const b = this.at(e);
    const held = this.fingers.get(e.pointerId);
    if (b?.code === held) return;
    this.release(e.pointerId);
    if (b) this.press(e.pointerId, b.code);
  }

  private up(e: PointerEvent): void {
    this.release(e.pointerId);
  }

  private press(id: number, code: string): void {
    this.fingers.set(id, code);
    this.input.keyDown(code);
  }

  private release(id: number): void {
    const code = this.fingers.get(id);
    if (code === undefined) return;
    this.fingers.delete(id);
    // Only lift the key if no other finger is still on the same button.
    if (![...this.fingers.values()].includes(code)) this.input.keyUp(code);
  }

  private releaseAll(): void {
    for (const id of [...this.fingers.keys()]) this.release(id);
  }

  /** Outlined buttons (no fill, so the game shows through); pressed ones light up. */
  render(r: Renderer): void {
    if (!this.enabled) return;
    if (this.layout === 'menu') {
      // A solid bar, covering the keyboard hint lines (the buttons say it all).
      r.rect(0, MENU_BAR_TOP, r.width, r.height - MENU_BAR_TOP, PALETTE.INK);
      r.rect(0, MENU_BAR_TOP, r.width, 1, PALETTE.GOLD);
    }
    const held = new Set(this.fingers.values());
    for (const b of this.buttons) {
      if (b.hidden) continue;
      const on = held.has(b.code);
      const colour = on ? PALETTE.YELLOW : PALETTE.WHITE;
      r.rect(b.x, b.y, b.w, 1, colour);
      r.rect(b.x, b.y + b.h - 1, b.w, 1, colour);
      r.rect(b.x, b.y, 1, b.h, colour);
      r.rect(b.x + b.w - 1, b.y, 1, b.h, colour);
      const scale = b.big ? 2 : 1;
      const ty = b.y + (b.h - 8 * scale) / 2;
      r.text(b.label, b.x + b.w / 2, ty, colour, 'center', scale);
    }
  }
}

/** Shown on a touch device held upright. */
export function drawRotateNotice(r: Renderer): void {
  r.clear(PALETTE.BLACK);
  r.text('ROTATE YOUR', r.width / 2, 64, PALETTE.YELLOW, 'center', 2);
  r.text('PHONE', r.width / 2, 86, PALETTE.YELLOW, 'center', 2);
  r.text('THIS GAME PLAYS SIDEWAYS', r.width / 2, 120, PALETTE.WHITE, 'center');
}
