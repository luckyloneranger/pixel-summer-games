import { DebugOverlay } from './debug';
import { Input, attachKeyboard } from './input';
import { FixedStepClock, startLoop } from './loop';
import { Renderer } from './renderer';
import { Rng, seedFromQuery } from './rng';
import { SceneManager } from './scene-manager';
import { TitleScene } from '../scenes/title';
import { DEBUG } from '../game/tuning';
import { Session } from '../game/session';
import { SaveStore } from './storage';
import { MusicPlayer } from '../audio/music';
import { playSfx, type SoundName } from '../audio/sfx';
import { AudioEngine } from '../audio/synth';
import type { SoundSink } from '../events/event';
import { AUDIO } from '../game/tuning';
import { PALETTE } from '../gfx/palette';

/** Owns the loop, the canvas, the scene stack and the shared services. */
export class Game {
  readonly renderer: Renderer;
  readonly input = new Input();
  readonly scenes = new SceneManager();
  readonly rng: Rng;
  readonly debug: DebugOverlay;
  /** Saved settings, high scores and personal bests. */
  readonly store = new SaveStore();
  /** The championship or practice run in progress, if any. */
  session: Session | null = null;
  readonly audio: AudioEngine;
  private readonly music: MusicPlayer;
  private toastText = '';
  private toastTime = 0;
  private readonly clock = new FixedStepClock();
  private lastRenderMs = -1;
  private timeScaleIndex = DEBUG.TIME_SCALES.indexOf(1);

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.rng = new Rng(seedFromQuery(location.search));
    this.debug = new DebugOverlay(location.search);
    attachKeyboard(this.input);
    this.audio = new AudioEngine(this.store.data.settings);
    this.music = new MusicPlayer(this.audio);
    // Browsers only allow sound after the player interacts, so switch it on then.
    const unlock = () => this.audio.unlock();
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
    // Pause events when the tab is hidden or the window loses focus.
    const focusLost = () => this.scenes.top?.onFocusLost?.();
    window.addEventListener('blur', focusLost);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) focusLost();
    });
  }

  start(): void {
    this.scenes.push(new TitleScene(this));
    startLoop(
      this.clock,
      (dt) => this.update(dt),
      (nowMs) => this.render(nowMs),
    );
  }

  /** Play a sound effect (silent until audio is unlocked). */
  sfx(name: SoundName, param = 0): void {
    playSfx(this.audio, name, param);
  }

  /** Sound output handed to events. */
  readonly sound: SoundSink = { play: (cue, param) => this.sfx(cue, param) };

  /** Re-apply volume settings after Options changes them. */
  applyVolumes(): void {
    this.audio.setVolumes(this.store.data.settings);
  }

  private toggleMute(): void {
    const s = this.store.data.settings;
    s.muted = !s.muted;
    this.store.save();
    this.applyVolumes();
    this.toastText = s.muted ? 'SOUND OFF' : 'SOUND ON';
    this.toastTime = AUDIO.TOAST_TIME;
  }

  /** Blips for menu screens, based on the keys pressed this step. */
  private menuSounds(): void {
    const i = this.input;
    if (!this.scenes.top?.isMenu) return;
    if (i.justPressed('CONFIRM')) this.sfx('menuSelect');
    else if (i.justPressed('BACK')) this.sfx('menuBack');
    else if (
      i.justPressed('MENU_UP') || i.justPressed('MENU_DOWN') ||
      i.justPressed('P1_LEFT') || i.justPressed('P1_RIGHT') ||
      i.justPressed('P2_LEFT') || i.justPressed('P2_RIGHT')
    ) {
      this.sfx('menuMove');
    }
  }

  private update(dt: number): void {
    this.input.beginStep();
    if (this.input.justPressed('DEBUG')) this.debug.visible = !this.debug.visible;
    if (this.input.justPressed('MUTE')) this.toggleMute();
    this.toastTime = Math.max(0, this.toastTime - dt);
    this.menuSounds();
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

    // Music follows the screen; the crowd follows the event (silent elsewhere).
    this.music.play(this.scenes.music);
    this.music.tick();
    this.audio.setCrowd(this.scenes.top?.crowdLevel?.() ?? 0);

    this.scenes.render(this.renderer);
    if (this.toastTime > 0) {
      const w = this.toastText.length * 8 + 8;
      this.renderer.rect(this.renderer.width - w - 2, this.renderer.height - 14, w, 12, PALETTE.INK);
      this.renderer.text(this.toastText, this.renderer.width - 6, this.renderer.height - 12, PALETTE.YELLOW, 'right');
    }
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
