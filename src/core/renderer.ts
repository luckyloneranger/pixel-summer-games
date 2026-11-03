import { DISPLAY } from '../game/tuning';
import { GLYPHS, GLYPH_ORDER, GLYPH_SIZE, glyphIndex, textWidth } from '../gfx/font';
import { PALETTE } from '../gfx/palette';

/** Largest whole-number scale at which a w x h image fits the available space. */
export function computeScale(availW: number, availH: number, w: number, h: number): number {
  return Math.max(1, Math.floor(Math.min(availW / w, availH / h)));
}

export type TextAlign = 'left' | 'center' | 'right';

/**
 * Everything is drawn on a small 320x180 canvas, then copied to the visible
 * canvas at a whole-number scale so every game pixel stays a sharp square.
 */
export class Renderer {
  readonly width = DISPLAY.WIDTH;
  readonly height = DISPLAY.HEIGHT;
  /** Current scale in physical screen pixels per game pixel. */
  scale = 1;

  private readonly low: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly screenCtx: CanvasRenderingContext2D;
  private readonly fontByColour = new Map<string, HTMLCanvasElement>();

  constructor(private readonly screen: HTMLCanvasElement) {
    this.low = document.createElement('canvas');
    this.low.width = this.width;
    this.low.height = this.height;
    this.ctx = get2d(this.low);
    this.screenCtx = get2d(screen);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Fit the visible canvas to the window. Called on resize and rotation. */
  resize(): void {
    // Work in physical pixels so each game pixel covers a whole number of them.
    const dpr = window.devicePixelRatio || 1;
    this.scale = computeScale(window.innerWidth * dpr, window.innerHeight * dpr, this.width, this.height);
    this.screen.width = this.width * this.scale;
    this.screen.height = this.height * this.scale;
    this.screen.style.width = `${this.screen.width / dpr}px`;
    this.screen.style.height = `${this.screen.height / dpr}px`;
    this.screenCtx.imageSmoothingEnabled = false;
  }

  clear(colour: string): void {
    this.rect(0, 0, this.width, this.height, colour);
  }

  rect(x: number, y: number, w: number, h: number, colour: string): void {
    this.ctx.fillStyle = colour;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  /** Draw an image (sprite or prebuilt background) at its natural size. */
  image(img: HTMLCanvasElement, x: number, y: number): void {
    this.ctx.drawImage(img, Math.round(x), Math.round(y));
  }

  /** Draw part of an image: the w x h area at (sx, sy) of `img`, placed at (x, y). */
  imagePart(img: HTMLCanvasElement, sx: number, sy: number, w: number, h: number, x: number, y: number): void {
    this.ctx.drawImage(img, sx, sy, w, h, Math.round(x), Math.round(y), w, h);
  }

  /** Draw a 1px line (used for the javelin at any angle). */
  line(x1: number, y1: number, x2: number, y2: number, colour: string): void {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    this.ctx.fillStyle = colour;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.ctx.fillRect(Math.round(x1 + (x2 - x1) * t), Math.round(y1 + (y2 - y1) * t), 1, 1);
    }
  }

  /** Draw text with the bitmap font. `scale` makes chunkier letters (2 = 16x16). */
  text(str: string, x: number, y: number, colour: string, align: TextAlign = 'left', scale = 1): void {
    const font = this.fontImage(colour);
    const size = GLYPH_SIZE * scale;
    let left = Math.round(x);
    if (align === 'center') left -= Math.floor(textWidth(str, scale) / 2);
    else if (align === 'right') left -= textWidth(str, scale);
    const top = Math.round(y);
    for (let i = 0; i < str.length; i++) {
      const g = glyphIndex(str[i]);
      this.ctx.drawImage(font, g * GLYPH_SIZE, 0, GLYPH_SIZE, GLYPH_SIZE, left + i * size, top, size, size);
    }
  }

  /** Copy the low-resolution frame to the screen, shifted by whole game pixels for shake. */
  present(shakeX = 0, shakeY = 0): void {
    this.screenCtx.imageSmoothingEnabled = false;
    if (shakeX !== 0 || shakeY !== 0) {
      this.screenCtx.fillStyle = PALETTE.BLACK;
      this.screenCtx.fillRect(0, 0, this.screen.width, this.screen.height);
    }
    const s = this.scale;
    this.screenCtx.drawImage(this.low, shakeX * s, shakeY * s, this.screen.width, this.screen.height);
  }

  /** The font as one strip image in a colour, built once and then reused. */
  private fontImage(colour: string): HTMLCanvasElement {
    let img = this.fontByColour.get(colour);
    if (img) return img;
    img = document.createElement('canvas');
    img.width = GLYPH_ORDER.length * GLYPH_SIZE;
    img.height = GLYPH_SIZE;
    const c = get2d(img);
    c.fillStyle = colour;
    GLYPH_ORDER.forEach((ch, i) => {
      GLYPHS[ch].forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          if (row[x] === '#') c.fillRect(i * GLYPH_SIZE + x, y, 1, 1);
        }
      });
    });
    this.fontByColour.set(colour, img);
    return img;
  }
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
