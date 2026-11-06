import { EFFECTS } from '../game/tuning';
import { SMALL_GLYPHS, SMALL_H, SMALL_ORDER, SMALL_W, smallGlyphIndex, smallTextWidth } from '../gfx/small-font';
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

  /**
   * Copy the low-resolution frame to the screen, shifted by whole game pixels
   * for shake. `zoom` above 1 enlarges the middle of the picture (highlights).
   */
  present(shakeX = 0, shakeY = 0, zoom = 1): void {
    const ctx = this.screenCtx;
    ctx.imageSmoothingEnabled = false;
    if (shakeX !== 0 || shakeY !== 0) {
      ctx.fillStyle = PALETTE.BLACK;
      ctx.fillRect(0, 0, this.screen.width, this.screen.height);
    }
    const s = this.scale;
    if (zoom > 1) {
      // Crop round a point a little below the middle (where the athletes are).
      const w = this.width / zoom;
      const h = this.height / zoom;
      const sx = (this.width - w) / 2;
      const sy = Math.min(this.height - h, (this.height - h) * 0.7);
      ctx.drawImage(this.low, sx, sy, w, h, shakeX * s, shakeY * s, this.screen.width, this.screen.height);
    } else {
      ctx.drawImage(this.low, shakeX * s, shakeY * s, this.screen.width, this.screen.height);
    }
    if (this.crt) ctx.drawImage(this.crtOverlay(), 0, 0);
  }

  /** Retro TV look (Options): scanlines and darker corners over the finished picture. */
  crt = false;
  private crtImage: HTMLCanvasElement | null = null;

  /** The scanline and vignette layer, built once per screen size. */
  private crtOverlay(): HTMLCanvasElement {
    const { width, height } = this.screen;
    if (this.crtImage && this.crtImage.width === width && this.crtImage.height === height) return this.crtImage;
    const img = document.createElement('canvas');
    img.width = width;
    img.height = height;
    const c = get2d(img);
    // A dark line along the bottom of each game pixel row.
    const line = Math.max(1, Math.floor(this.scale / 3));
    c.fillStyle = `rgba(0, 0, 0, ${EFFECTS.CRT_SCANLINE_DARK})`;
    for (let y = 0; y < this.height; y++) c.fillRect(0, (y + 1) * this.scale - line, width, line);
    // Corners fade darker, like the curved glass of an old TV.
    const g = c.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.45, width / 2, height / 2, Math.hypot(width, height) / 2);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, `rgba(0, 0, 0, ${EFFECTS.CRT_VIGNETTE})`);
    c.fillStyle = g;
    c.fillRect(0, 0, width, height);
    this.crtImage = img;
    return img;
  }

  /** Narrow 3x5 text (tables and small notes). */
  textSmall(str: string, x: number, y: number, colour: string, align: TextAlign = 'left'): void {
    const font = this.smallFontImage(colour);
    let left = Math.round(x);
    if (align === 'center') left -= Math.floor(smallTextWidth(str) / 2);
    else if (align === 'right') left -= smallTextWidth(str);
    for (let i = 0; i < str.length; i++) {
      this.ctx.drawImage(font, smallGlyphIndex(str[i]) * SMALL_W, 0, SMALL_W, SMALL_H, left + i * SMALL_W, Math.round(y), SMALL_W, SMALL_H);
    }
  }

  /** Draw something only inside a rectangle (e.g. a two-tone heading). */
  clipped(x: number, y: number, w: number, h: number, draw: () => void): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
    draw();
    this.ctx.restore();
  }

  private readonly smallByColour = new Map<string, HTMLCanvasElement>();

  private smallFontImage(colour: string): HTMLCanvasElement {
    let img = this.smallByColour.get(colour);
    if (img) return img;
    img = document.createElement('canvas');
    img.width = SMALL_ORDER.length * SMALL_W;
    img.height = SMALL_H;
    const c = get2d(img);
    c.fillStyle = colour;
    SMALL_ORDER.forEach((ch, i) =>
      SMALL_GLYPHS[ch].forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === '#') c.fillRect(i * SMALL_W + x, y, 1, 1);
      }),
    );
    this.smallByColour.set(colour, img);
    return img;
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
