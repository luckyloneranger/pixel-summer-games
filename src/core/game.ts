import { DebugOverlay } from './debug';
import { Input, attachKeyboard } from './input';
import { FixedStepClock, startLoop } from './loop';
import { Renderer } from './renderer';
import { Rng, seedFromQuery } from './rng';
import { SceneManager } from './scene-manager';
import { TitleScene } from '../scenes/title';
import { DisconnectedScene } from '../scenes/disconnected';
import { onlineStatus } from '../net/status';
import { clearRejoin, loadRejoin } from '../net/rejoin';
import { RejoinScene } from '../scenes/rejoin';
import { EventIntroScene } from '../scenes/event-intro';
import type { Championship } from '../game/championship';
import type { OnlineMatch } from '../game/session';
import { DEBUG } from '../game/tuning';
import { Session } from '../game/session';
import { SaveStore } from './storage';
import { MusicPlayer } from '../audio/music';
import { playSfx, type SoundName } from '../audio/sfx';
import { AudioEngine } from '../audio/synth';
import type { EffectsSink, SoundSink } from '../events/event';
import { AUDIO, AWARDS, EFFECTS } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { achievement, newAwards } from '../game/achievements';
import { drawWipe, highlightZoom, wipeCover } from '../gfx/screen-fx';
import type { Scene } from './scene-manager';
import { TouchControls, drawRotateNotice } from '../ui/touch-controls';
import { buildKeymap } from './keymap';
import { GamepadPoller, connectedPads } from './gamepad';
import { Prompts } from '../ui/prompts';

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
  private readonly pads = new GamepadPoller();
  /** The last thing the player pressed was a gamepad button. */
  private padActive = false;
  private awardQueue: string[] = [];
  private awardTime = 0; // s the current award banner has been up
  private lastFrameDt = 0; // s since the last frame was drawn
  private highlightAge = Infinity; // s since a big-jump highlight started
  private wipeAge = 0; // s since the current screen appeared (for the wipe)
  private lastTop: Scene | undefined;
  private toastTime = 0;
  /** Online: what to say while a connection is being waited for (null = nothing). */
  private onlineBanner: string | null = null;
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
    // A tap on a list menu's row picks it (and presses OK on it, as a tap on a phone list does).
    this.touch.onMissedTap = (x, y) => {
      if (!this.scenes.top?.selectAt?.(x, y)) return;
      this.input.keyDown('TouchOk');
      this.input.keyUp('TouchOk');
    };
    this.audio = new AudioEngine(this.store.data.settings);
    this.music = new MusicPlayer(this.audio);
    // The last device used decides the hints: a key or a touch stops gamepad hints.
    window.addEventListener('keydown', () => (this.padActive = false));
    window.addEventListener('pointerdown', () => (this.padActive = false));
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
    // Reloaded in the middle of an online match: go straight back into it.
    const rejoin = loadRejoin();
    if (rejoin) this.scenes.push(new RejoinScene(this, rejoin));
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
  readonly effects: EffectsSink & { calm: boolean } = {
    shake: (pixels) => {
      if (this.steady) return;
      this.shakePixels = Math.max(this.shakePixels, pixels);
      this.shakeLeft = EFFECTS.SHAKE_TIME;
    },
    // Slow motion would put the two online games out of step, so it's offline only.
    highlight: () => {
      if (this.session?.online || this.steady) return;
      this.highlightAge = 0;
    },
    calm: false, // kept up to date in update()
  };

  /** Sound output handed to events. */
  readonly sound: SoundSink = { play: (cue, param) => this.sfx(cue, param) };

  /** Apply saved key remapping. */
  applyControls(): void {
    this.input.setKeymap(buildKeymap(this.store.data.settings.controls));
  }

  /** Words for the controls, matching the keyboard or the on-screen buttons in use. */
  readonly prompts = new Prompts(
    () => (this.padActive ? 'pad' : this.touch.enabled ? 'touch' : 'keys'),
    () => this.store.data.settings.controls,
    () => this.pads.count,
  );

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

  /** Online match: if the other player leaves (or the connection drops), say so. */
  private watchOnline(): void {
    this.onlineBanner = null;
    const online = this.session?.online;
    if (!online || this.scenes.has('DISCONNECTED')) return;
    const series = this.session?.series;
    if (series?.state !== 'playing') {
      clearRejoin(); // match finished: nothing to come back to
      return;
    }
    if (online.conn.state === 'closed') clearRejoin();
    this.answerRejoin(online, series);
    const peer = this.session!.players[1 - online.localIndex]?.initials ?? 'YOUR FRIEND';
    const status = onlineStatus(online.conn, peer);
    if (status.over) {
      clearRejoin();
      this.scenes.push(new DisconnectedScene(this, status.over));
    } else this.onlineBanner = status.banner;
  }

  /**
   * The friend reloaded their page and is back: send them the standings, and
   * restart the event in progress from its intro card (its half-run state is
   * gone on their side). On a results screen the event is already scored, so
   * nothing needs restarting.
   */
  private answerRejoin(online: OnlineMatch, series: Championship): void {
    if (!online.conn.take('rejoin').length) return;
    online.conn.send({ k: 'sync', s: series.snapshot() });
    if (this.scenes.top?.name === 'PAUSE') this.scenes.pop();
    const top = this.scenes.top?.name;
    if (top === 'EVENT' || top === 'INTRO') {
      this.scenes.replace(new EventIntroScene(this, this.session!, series.currentEvent));
      this.showToast(`${this.session!.players[1 - online.localIndex]?.initials ?? 'FRIEND'} IS BACK`);
    }
  }

  /** A short note in the corner (sound on/off, a friend rejoining). */
  showToast(text: string): void {
    this.toastText = text;
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
    // Gamepad buttons become key presses before this step's input is read.
    const padPressed = this.pads.poll(connectedPads(), (c) => this.input.keyDown(c), (c) => this.input.keyUp(c));
    if (padPressed) {
      this.padActive = true;
      this.touch.enabled = false; // no on-screen buttons while playing with a pad
      this.audio.unlock();
    }
    this.input.beginStep();
    this.effects.calm = this.steady;
    this.highlightAge += dt;
    this.wipeAge += dt;
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
    this.watchOnline();
    if (this.debug.visible) {
      // Debug-only slow motion / fast forward with [ and ].
      const last = DEBUG.TIME_SCALES.length - 1;
      if (this.input.justPressed('DEBUG_SLOWER')) this.timeScaleIndex = Math.max(0, this.timeScaleIndex - 1);
      if (this.input.justPressed('DEBUG_FASTER')) this.timeScaleIndex = Math.min(last, this.timeScaleIndex + 1);
    }
    // A big-jump highlight slows the event down for a moment (game time only).
    const slow = this.highlightAge < EFFECTS.HIGHLIGHT_TIME && this.scenes.top?.name === 'EVENT' ? EFFECTS.SLOW_MO : 1;
    this.scenes.update(dt * slow * DEBUG.TIME_SCALES[this.timeScaleIndex], this.input);
    this.noticeNewScreen();
  }

  private render(nowMs: number): void {
    this.lastFrameDt = this.lastRenderMs >= 0 ? Math.min(0.1, (nowMs - this.lastRenderMs) / 1000) : 0;
    if (this.lastRenderMs >= 0) this.debug.fpsCounter.frame((nowMs - this.lastRenderMs) / 1000);
    this.lastRenderMs = nowMs;

    // Music follows the screen; the crowd follows the event (silent elsewhere).
    this.music.play(this.scenes.music);
    this.music.tick();
    this.audio.setCrowd(this.scenes.top?.crowdLevel?.() ?? 0);

    this.scenes.render(this.renderer);
    drawWipe(this.renderer, wipeCover(this.wipeAge));
    const top = this.scenes.top?.name;
    const eventLayout = this.scenes.top?.touchLayout?.() ?? 'event';
    this.touch.setLayout(top === 'EVENT' ? eventLayout : top === 'TITLE' || top === 'DEMO' ? 'title' : 'menu');
    this.touch.render(this.renderer);
    if (this.onlineBanner) this.drawBanner(this.onlineBanner);
    this.drawAward(this.lastFrameDt);
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
    this.renderer.crt = this.store.data.settings.crt;
    const zoom = this.steady ? 1 : highlightZoom(this.highlightAge);
    this.renderer.present(sx, sy, zoom);
  }

  /** A new screen (not a pause overlay coming or going) starts the blinds wipe. */
  private noticeNewScreen(): void {
    const top = this.scenes.top;
    if (top === this.lastTop) return;
    const overlay = top?.isOverlay || this.lastTop?.isOverlay;
    this.lastTop = top;
    if (!overlay) this.wipeAge = 0;
  }

  /** Earn awards (ones already earned are ignored); each new one gets a banner. */
  unlock(ids: readonly string[]): void {
    const have = this.store.data.achievements;
    const fresh = newAwards(have, ids);
    if (!fresh.length) return;
    for (const id of fresh) have[id] = Date.now();
    this.store.save();
    this.awardQueue.push(...fresh);
  }

  /** "AWARD! FIRST STEPS" across the top, one at a time. */
  private drawAward(dt: number): void {
    if (!this.awardQueue.length) return;
    this.awardTime += dt;
    if (this.awardTime >= AWARDS.BANNER_TIME) {
      this.awardQueue.shift();
      this.awardTime = 0;
      if (!this.awardQueue.length) return;
    }
    const a = achievement(this.awardQueue[0]);
    if (!a) return;
    const r = this.renderer;
    // Over the title bar, where it hides nothing that matters for a moment.
    r.rect(0, 0, r.width, 24, PALETTE.INK);
    r.rect(0, 23, r.width, 1, PALETTE.YELLOW);
    r.text('AWARD!', r.width / 2, 3, PALETTE.YELLOW, 'center');
    r.text(a.name, r.width / 2, 13, PALETTE.WHITE, 'center');
  }

  /** A strip across the top of the screen (online connection trouble). */
  private drawBanner(text: string): void {
    const r = this.renderer;
    r.rect(0, 2, r.width, 12, PALETTE.INK);
    r.text(text, r.width / 2, 4, PALETTE.YELLOW, 'center');
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
