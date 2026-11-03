import { DebugOverlay } from './debug';
import { Input, attachKeyboard } from './input';
import { FixedStepClock, startLoop } from './loop';
import { Renderer } from './renderer';
import { Rng, seedFromQuery } from './rng';
import { SceneManager } from './scene-manager';
import { TitleScene } from '../scenes/title';

/** Owns the loop, the canvas, the scene stack and the shared services. */
export class Game {
  readonly renderer: Renderer;
  readonly input = new Input();
  readonly scenes = new SceneManager();
  readonly rng: Rng;
  readonly debug: DebugOverlay;
  private readonly clock = new FixedStepClock();
  private lastRenderMs = -1;
  private fpsText = '';
  private sceneText = '';
  private readonly debugLines: string[] = [];

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
    this.scenes.update(dt, this.input);
  }

  private render(nowMs: number): void {
    if (this.lastRenderMs >= 0) this.debug.fpsCounter.frame((nowMs - this.lastRenderMs) / 1000);
    this.lastRenderMs = nowMs;

    this.scenes.render(this.renderer);
    if (this.debug.visible) this.debug.render(this.renderer, this.buildDebugLines());
    this.renderer.present();
  }

  /** Rebuild the overlay text only when a value changes, to avoid per-frame garbage. */
  private buildDebugLines(): readonly string[] {
    const fps = `FPS   ${this.debug.fpsCounter.fps}`;
    const scene = `SCENE ${this.scenes.top?.name ?? '-'}`;
    if (fps !== this.fpsText || scene !== this.sceneText || this.debugLines.length === 0) {
      this.fpsText = fps;
      this.sceneText = scene;
      this.debugLines.length = 0;
      this.debugLines.push(fps, scene, `SCALE ${this.renderer.scale}X`, `SEED  ${this.rng.seed}`);
    }
    return this.debugLines;
  }
}
