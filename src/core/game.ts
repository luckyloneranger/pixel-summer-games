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
import type { EffectsSink, SoundSink } from '../events/event';
import { AUDIO, EFFECTS } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { TouchControls, drawRotateNotice } from '../ui/touch-controls';
import { buildKeymap } from './keymap';

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
  readonly touch: TouchControls;
  private portrait = false;
  private shakeLeft = 0; // s of screen shake left
  private shakePixels = 0;
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
    this.applyControls();
    this.touch = new TouchControls(canvas, this.input);
    this.audio = new AudioEngine(this.store.data.settings);
    this.music = new MusicPlayer(this.audio);
    // Browsers only allow sound after the player interacts, so switch it on then.
    const unlock = () => this.audio.unlock();
    // iPhone Safari is picky about which gesture may start audio, so try them all.
    for (const type of ['keydown', 'pointerdown', 'touchstart', 'touchend', 'click']) {
      window.addEventListener(type, unlock);
    }
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

  /** Screen effects handed to events. Shake is skipped with "reduce flashing" on. */
  readonly effects: EffectsSink = {
    shake: (pixels) => {
      if (this.steady) return;
      this.shakePixels = Math.max(this.shakePixels, pixels);
      this.shakeLeft = EFFECTS.SHAKE_TIME;
    },
  };

  /** Sound output handed to events. */
  readonly sound: SoundSink = { play: (cue, param) => this.sfx(cue, param) };

  /** Apply saved key remapping. */
  applyControls(): void {
    this.input.setKeymap(buildKeymap(this.store.data.settings.controls));
  }

  /** Reduce shake and flashing is on: blinking text stays steady. */
  get steady(): boolean {
    return this.store.data.settings.reduceFlashing;
  }

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
      i.justPressed('MENU_LEFT') || i.justPressed('MENU_RIGHT')
    ) {
      this.sfx('menuMove');
    }
  }

  private update(dt: number): void {
    this.input.beginStep();
    if (this.input.justPressed('DEBUG')) this.debug.visible = !this.debug.visible;
    if (this.input.justPressed('MUTE')) this.toggleMute();
    this.toastTime = Math.max(0, this.toastTime - dt);
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    if (this.shakeLeft === 0) this.shakePixels = 0;
    // A touch device held upright: pause everything until it's turned sideways.
    const portrait = this.touch.enabled && window.innerHeight > window.innerWidth;
    if (portrait && !this.portrait) this.scenes.top?.onFocusLost?.();
    this.portrait = portrait;
    if (portrait) return;
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
    this.touch.setLayout(this.scenes.top?.name === 'EVENT' ? 'event' : 'menu');
    this.touch.render(this.renderer);
    if (this.portrait) drawRotateNotice(this.renderer);
    if (this.toastTime > 0) {
      const w = this.toastText.length * 8 + 8;
      this.renderer.rect(this.renderer.width - w - 2, this.renderer.height - 14, w, 12, PALETTE.INK);
      this.renderer.text(this.toastText, this.renderer.width - 6, this.renderer.height - 12, PALETTE.YELLOW, 'right');
    }
    if (this.debug.visible) this.debug.render(this.renderer, this.buildDebugLines());
    // Shake: jump the whole picture a pixel or few, fading out.
    let sx = 0;
    let sy = 0;
    if (this.shakeLeft > 0) {
      const amount = Math.round(this.shakePixels * (this.shakeLeft / EFFECTS.SHAKE_TIME));
      sx = Math.round((Math.random() * 2 - 1) * amount); // visual only: keep the seeded rng for gameplay
      sy = Math.round((Math.random() * 2 - 1) * amount);
    }
    this.renderer.present(sx, sy);
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
