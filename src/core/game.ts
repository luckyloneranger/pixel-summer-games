import { DebugOverlay } from './debug';
import { Input, attachKeyboard } from './input';
import { FixedStepClock, startLoop } from './loop';
import { Renderer } from './renderer';
import { Rng, seedFromQuery } from './rng';
import { SceneManager } from './scene-manager';
import { TitleScene } from '../scenes/title';
import { DEBUG } from '../game/tuning';
import type { Difficulty } from '../events/event';

/** Owns the loop, the canvas, the scene stack and the shared services. */
export class Game {
  readonly renderer: Renderer;
  readonly input = new Input();
  readonly scenes = new SceneManager();
  readonly rng: Rng;
  readonly debug: DebugOverlay;
  /** Temporary settings until the player setup screen (Phase 6). */
  readonly settings: { difficulty: Difficulty } = { difficulty: 'normal' };
  private readonly clock = new FixedStepClock();
  private lastRenderMs = -1;
  private timeScaleIndex = DEBUG.TIME_SCALES.indexOf(1);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.rng = new Rng(seedFromQuery(location.search));
    this.debug = new DebugOverlay(location.search);
    attachKeyboard(this.input);
  }

  start(): void {
    this.scenes.push(new TitleScene(this));
    startLoop(
      this.clock,
      (dt) => this.update(dt),
      (nowMs) => this.render(nowMs),
    );
  }

  private update(dt: number): void {
    this.input.beginStep();
    if (this.input.justPressed('DEBUG')) this.debug.visible = !this.debug.visible;
    if (this.debug.visible) {
      // Debug-only slow motion / fast forward with [ and ].
      const last = DEBUG.TIME_SCALES.length - 1;
      if (this.input.justPressed('DEBUG_SLOWER')) this.timeScaleIndex = Math.max(0, this.timeScaleIndex - 1);
      if (this.input.justPressed('DEBUG_FASTER')) this.timeScaleIndex = Math.min(last, this.timeScaleIndex + 1);
    }
    this.scenes.update(dt * DEBUG.TIME_SCALES[this.timeScaleIndex], this.input);
  }

  private render(nowMs: number): void {
    if (this.lastRenderMs >= 0) this.debug.fpsCounter.frame((nowMs - this.lastRenderMs) / 1000);
    this.lastRenderMs = nowMs;

    this.scenes.render(this.renderer);
    if (this.debug.visible) this.debug.render(this.renderer, this.buildDebugLines());
    this.renderer.present();
  }

  /** Debug text is rebuilt every frame, but only while the overlay is open. */
  private buildDebugLines(): string[] {
    const top = this.scenes.top;
    return [
      `FPS   ${this.debug.fpsCounter.fps}`,
      `SCENE ${top?.name ?? '-'}`,
      `SCALE ${this.renderer.scale}X  SEED ${this.rng.seed}`,
      `GAME SPEED ${DEBUG.TIME_SCALES[this.timeScaleIndex]}X ([ ])`,
      ...(top?.debugLines?.() ?? []),
    ];
  }
}
