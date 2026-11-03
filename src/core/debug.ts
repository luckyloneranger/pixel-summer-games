import { DEBUG } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import type { Renderer } from './renderer';
import { textWidth } from '../gfx/font';

/** Counts frames to give a smooth FPS reading. */
export class FpsCounter {
  fps = 0;
  private frames = 0;
  private elapsed = 0;

  constructor(private readonly samplePeriod: number = DEBUG.FPS_SAMPLE_PERIOD) {}

  /** Call once per drawn frame with the seconds since the last one. */
  frame(seconds: number): void {
    this.frames++;
    this.elapsed += seconds;
    if (this.elapsed >= this.samplePeriod) {
      this.fps = Math.round(this.frames / this.elapsed);
      this.frames = 0;
      this.elapsed = 0;
    }
  }
}

/**
 * Developer overlay: open with ?debug=1 in the URL or the ` (backtick) key.
 * Later phases add speed, tap rate, angle and positions to `lines`.
 */
export class DebugOverlay {
  visible: boolean;
  readonly fpsCounter = new FpsCounter();

  constructor(query: string) {
    this.visible = new URLSearchParams(query).get('debug') === '1';
  }

  render(r: Renderer, lines: readonly string[]): void {
    if (!this.visible) return;
    const lineHeight = 9; // px: 8px glyph + 1px gap
    let widest = 0;
    for (const line of lines) widest = Math.max(widest, textWidth(line));
    r.rect(0, 0, widest + 4, lines.length * lineHeight + 3, PALETTE.BLACK);
    for (let i = 0; i < lines.length; i++) r.text(lines[i], 2, 2 + i * lineHeight, PALETTE.GREEN);
  }
}
