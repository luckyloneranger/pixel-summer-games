import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import { ANIMATION, RUNNER } from '../game/tuning';
import { STADIUM_THEMES, Stadium } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import { AthleteSprites, RUN_CYCLE, type Pose } from '../gfx/sprites/athlete';
import { AngleMeter } from './angle-meter';
import { cpuFieldMarks, cpuLineup, playerLook } from './cpu';
import { qualifyingMark } from '../game/scoring';
import { SILENT, type AthleticsEvent, type Difficulty, type EventContext, type EventId, type EventResult, type SoundCue, type SoundSink } from './event';
import { Footsteps, runningCrowd } from './footsteps';
import { AUDIO } from '../game/tuning';
import { FieldAttempts, type AttemptTracker } from './field-attempts';
import type { Rng } from '../core/rng';
import { Projectile } from './projectile';
import { TapRunner, applyRunPresses } from './tap-runner';
import { keysFor } from './player-input';
import { DustPuffs, DustTrail } from '../gfx/effects';
import { EFFECTS } from '../game/tuning';
import { NO_EFFECTS, type EffectsSink } from './event';
import type { Look } from '../gfx/sprite';
import type { NetLink } from './event';
import { KEYBOARD_PROMPTS, type Prompts } from '../ui/prompts';
import { NET } from '../game/tuning';
import type { GameMessage } from '../net/protocol';

/** Field-event messages from the other player's game. */
type FieldMessage = Extract<GameMessage, { k: 'field' | 'release' | 'landed' | 'foul' }>;

/** A human taking part: their attempts and how they look. */
export interface FieldCompetitor {
  playerIndex: number;
  name: string;
  look: Look;
  record: AttemptTracker;
  sprites: AthleteSprites | null;
}

/** Where the current attempt is up to. */
export type FieldPhase = 'ready' | 'runup' | 'hold' | 'flight' | 'landed' | 'foul' | 'finished';

/** The numbers every run-up field event needs (see tuning.ts). */
export interface RunUpConfig {
  RUNWAY: number; // m from the start of the runway to the foul line
  ATTEMPTS: number;
  LAUNCH_EFFICIENCY: number; // launch speed = run speed x this
  GRAVITY: number; // m/s²
  RESULT_TIME: number; // s the mark (or FOUL) stays up
}

/**
 * Shared rules for the long jump and javelin: tap to run up, hold Action to
 * raise the angle, release before the foul line. Three attempts, best counts.
 * Distances are in metres from the foul line (negative = on the runway).
 * Subclasses add what flies, how the mark is scored, and all the drawing.
 */
export abstract class RunUpFieldEvent implements AthleticsEvent {
  abstract readonly id: EventId;
  abstract readonly name: string;
  readonly kind = 'field';
  readonly attempts: number;

  phase: FieldPhase = 'ready';
  readonly runner = new TapRunner(RUNNER);
  readonly meter = new AngleMeter();
  readonly flight: Projectile;
  /** The human(s) taking part, in turn order. */
  competitors: FieldCompetitor[] = [];
  /** Whose turn it is (index into competitors). */
  turn = 0;
  /** Release point (m from the line) of the current attempt. */
  takeoffX = 0;
  lastMark: number | null = null;
  foulReason = '';

  /** Qualifying mark for this difficulty (m). The crowd cheers marks that reach it. */
  protected qualifyMark = 0;
  /** Practice mode doesn't show the qualifying mark. */
  private showQualify = true;
  protected cpus: { name: string; marks: (number | null)[] }[] = [];
  protected phaseTimer = 0;
  protected clock = 0; // s since the event started (animations)
  protected readonly stadium = new Stadium();
  private assist = false;
  protected effects: EffectsSink = NO_EFFECTS;
  protected readonly dust = new DustPuffs();
  private readonly trail = new DustTrail();
  protected sound: SoundSink = SILENT;
  private readonly footsteps = new Footsteps();
  /** Sounds for letting go and for landing (set by each event). */
  protected abstract readonly releaseCue: SoundCue;
  protected abstract readonly landCue: SoundCue;

  // Online: the device whose player is up runs the attempt and reports it;
  // the other device replays it. Attempts are numbered across all players.
  private net: NetLink | null = null;
  /** Where each athlete last took off (m from the line), for the marker flag. */
  private readonly lastTakeoff = new Map<number, number>();
  protected prompts: Prompts = KEYBOARD_PROMPTS;
  /** Number of the attempt in progress (0 = first of the event). */
  attemptNo = 0;
  private readonly netQueue: FieldMessage[] = [];
  private sendTimer = 0; // s since the last run-up update was sent
  /** Official mark for the remote attempt, if it arrived before our replay landed. */
  private pendingMark: { mark: number | null } | null = null;

  constructor(
    protected readonly cfg: RunUpConfig,
    private readonly cpuRanges: Record<Difficulty, readonly number[]>,
  ) {
    this.attempts = cfg.ATTEMPTS;
    this.flight = new Projectile(cfg.GRAVITY);
  }

  /** The competitor whose turn it is. */
  get current(): FieldCompetitor {
    return this.competitors[this.turn];
  }

  /** The current competitor's attempts. */
  get record(): AttemptTracker {
    return this.current.record;
  }

  init(ctx: EventContext): void {
    this.sound = ctx.sound ?? SILENT;
    this.assist = ctx.assist ?? false;
    this.effects = ctx.effects ?? NO_EFFECTS;
    this.dust.clear();
    this.stadium.theme = STADIUM_THEMES[this.id];
    this.net = ctx.net ?? null;
    this.prompts = ctx.prompts ?? KEYBOARD_PROMPTS;
    this.netQueue.length = 0;
    this.competitors = ctx.players.map((p, i) => ({
      playerIndex: p.index ?? i,
      name: p.initials,
      look: playerLook(p.team),
      record: this.createTracker(),
      sprites: null,
    }));
    this.turn = 0;
    this.qualifyMark = qualifyingMark(this.id, ctx.difficulty);
    this.showQualify = !ctx.practice;
    this.cpus = cpuLineup(ctx.players.map((p) => p.team)).map((a) => ({
      name: a.name,
      marks: this.cpuMarks(this.cpuRanges[ctx.difficulty], ctx.rng),
    }));
    this.clock = 0;
    this.startAttempt();
  }

  protected startAttempt(): void {
    // Take turns: whoever (still in) has had the fewest attempts goes next,
    // player 1 first. Both online games work this out the same way.
    let next = -1;
    this.competitors.forEach((c, i) => {
      if (c.record.done) return;
      if (next < 0 || c.record.marks.length < this.competitors[next].record.marks.length) next = i;
    });
    this.turn = Math.max(0, next);
    this.attemptNo = this.competitors.reduce((n, c) => n + c.record.marks.length, 0);
    this.sendTimer = NET.SNAPSHOT_EVERY; // send the first update straight away
    this.pendingMark = null;
    this.runner.reset();
    this.meter.reset();
    this.footsteps.reset();
    this.trail.reset();
    this.takeoffX = 0;
    this.lastMark = null;
    this.foulReason = '';
    this.enterPhase('ready');
  }

  protected enterPhase(phase: FieldPhase): void {
    this.phase = phase;
    this.phaseTimer = 0;
  }

  /** Athlete's position on the runway, in m from the foul line. */
  get athleteX(): number {
    return this.runner.position - this.cfg.RUNWAY;
  }

  // ------------------------------------------------ hooks for subclasses

  /** Height (m) the projectile leaves from. */
  protected launchHeight(): number {
    return 0;
  }
  /** Called right after a legal release. */
  protected onRelease(): void {}
  /** Every step after the release (flight and landed). */
  protected afterRelease(_dt: number): void {}
  /** Action pressed while in the air (the triple jump times its contacts with it). */
  protected onFlightAction(): void {}
  /** On touchdown: return true to take off again instead of landing (call relaunch). */
  protected bounce(): boolean {
    return false;
  }
  /** Take off again from where the flight touched down (the other game is told too). */
  protected relaunch(speed: number, angle: number): void {
    this.takeoffX = this.flight.x;
    this.net?.send({ k: 'release', n: this.attemptNo, x: this.takeoffX, speed, angle });
    this.launch(speed, angle);
  }
  /** Called once when the athlete or javelin comes down (sand bursts and the like). */
  protected onLand(): void {}
  /** Screen y (px) of the runway surface, where dust puffs start. */
  protected dustGroundY(): number {
    return 0;
  }
  /** Turn the landing point (m from the line) into the recorded mark (null = no mark). */
  protected abstract markFor(landX: number): number | null;
  /** How each competitor's attempts are tracked (3 attempts unless overridden). */
  protected createTracker(): AttemptTracker {
    return new FieldAttempts(this.cfg.ATTEMPTS);
  }
  /** A CPU's marks for this event (drawn from the difficulty's range). */
  protected cpuMarks(range: readonly number[], rng: Rng): (number | null)[] {
    return cpuFieldMarks(range, this.cfg.ATTEMPTS, rng);
  }
  /** Big text on the ready card ("ATTEMPT 2 OF 3"). */
  protected readyTitle(): string {
    return `ATTEMPT ${this.record.current} OF ${this.cfg.ATTEMPTS}`;
  }

  // ------------------------------------------------ rules

  /** Is the attempt in progress run by this device? (Always, offline.) */
  get localTurn(): boolean {
    return !this.net || this.current.playerIndex === this.net.localIndex;
  }

  update(dt: number, input: InputSnapshot): void {
    this.clock += dt;
    this.phaseTimer += dt;
    this.dust.update(dt);
    this.stadium.time = this.clock;
    this.stadium.flashes = this.crowdWaves && !this.effects.calm;
    if (this.net) this.receiveNet();
    if (!this.localTurn) {
      this.spectate(dt);
      return;
    }
    this.play(dt, input);
    if (this.net) this.sendRunUp(dt);
  }

  /** The attempt in progress is ours: read the keys. */
  private play(dt: number, input: InputSnapshot): void {
    // Only the athlete whose turn it is reads keys (both sets for a lone or online player).
    const keys = keysFor(input, this.current.playerIndex, this.competitors.length === 1 || this.net !== null);
    const { left, right } = keys;
    const actionPressed = keys.action;
    const actionHeld = keys.actionHeld;

    switch (this.phase) {
      case 'ready':
      case 'runup':
        if (applyRunPresses(this.runner, left, right)) this.phase = 'runup';
        if (this.assist && keys.runHeld && this.runner.assist(dt)) this.phase = 'runup';
        // The meter only starts once you're moving, so you can't get stuck at a standstill.
        if (actionPressed && this.runner.speed > 0) {
          this.meter.start();
          this.runner.canAccelerate = false; // keep current speed, no more gains
          this.phase = 'hold';
          // A tap so quick it's already released counts as releasing straight away.
          if (!actionHeld) {
            this.release();
            return;
          }
        }
        this.moveOnRunway(dt);
        return;

      case 'hold':
        // The release happened during this step, at the current spot.
        if (!actionHeld) {
          this.release();
          return;
        }
        this.meter.update(dt);
        this.moveOnRunway(dt);
        return;

      case 'flight':
        if (actionPressed) this.onFlightAction();
        this.flight.update(dt);
        this.afterRelease(dt);
        // Touching down ends the attempt, unless the event bounces on (triple jump).
        if (this.flight.landed && !this.bounce()) this.land();
        return;

      case 'landed':
        this.afterRelease(dt);
        this.waitForNext();
        return;

      case 'foul':
        this.waitForNext();
        return;

      case 'finished':
        return;
    }
  }

  // ------------------------------------------------ online

  /** Send our run-up a few times a second (only the latest matters). */
  private sendRunUp(dt: number): void {
    const p = this.phase;
    if (p !== 'ready' && p !== 'runup' && p !== 'hold') return;
    this.sendTimer += dt;
    if (this.sendTimer < NET.SNAPSHOT_EVERY) return;
    this.sendTimer = 0;
    this.net!.send({ k: 'field', n: this.attemptNo, x: this.athleteX, speed: this.runner.speed, angle: this.meter.angle, phase: p });
  }

  /** Work through the other game's messages, in order. */
  private receiveNet(): void {
    this.netQueue.push(...this.net!.take('field', 'release', 'landed', 'foul'));
    while (this.netQueue.length) {
      const m = this.netQueue[0];
      if (m.n < this.attemptNo) {
        this.netQueue.shift(); // old news
        continue;
      }
      if (m.n > this.attemptNo) {
        // They've moved on to the next attempt: catch up if we can.
        if (!this.catchUp()) {
          if (m.k === 'field') this.netQueue.shift();
          else break; // wait for this attempt's result first
        }
        continue;
      }
      this.netQueue.shift();
      if (!this.localTurn) this.applyRemote(m);
    }
  }

  /** Finish the current attempt now so the next one can start. False if its result isn't known yet. */
  private catchUp(): boolean {
    if (this.phase === 'flight' && this.pendingMark) this.land(this.pendingMark.mark);
    if (this.phase !== 'landed' && this.phase !== 'foul') return false;
    if (this.competitors.every((c) => c.record.done)) return false;
    this.startAttempt();
    return true;
  }

  /** Mirror the other player's attempt. */
  private applyRemote(m: FieldMessage): void {
    const before = this.phase === 'ready' || this.phase === 'runup' || this.phase === 'hold';
    switch (m.k) {
      case 'field':
        if (!before) return;
        this.runner.position = m.x + this.cfg.RUNWAY;
        this.runner.speed = m.speed;
        this.meter.angle = m.angle;
        if (m.phase !== this.phase) this.phase = m.phase;
        return;
      case 'release':
        // A second take-off mid-flight is the next phase of a triple jump.
        if (!before && this.phase !== 'flight') return;
        this.runner.position = m.x + this.cfg.RUNWAY;
        this.meter.angle = m.angle;
        this.takeoffX = m.x;
        this.launch(m.speed, m.angle);
        return;
      case 'landed':
        if (this.phase === 'flight' && this.flight.landed) this.land(m.mark);
        else this.pendingMark = { mark: m.mark };
        return;
      case 'foul':
        if (this.phase !== 'landed' && this.phase !== 'foul') this.foul(m.reason);
        return;
    }
  }

  /** Watch the other player's attempt (no keys). */
  private spectate(dt: number): void {
    switch (this.phase) {
      case 'ready':
      case 'runup':
      case 'hold':
        // Carry on at their last speed until the next update; never past the
        // line (a foul is theirs to call).
        this.runner.position = Math.min(this.runner.position + this.runner.speed * dt, this.cfg.RUNWAY);
        this.footsteps.update(this.runner, this.sound);
        if (this.trail.due(this.runner.position, this.runner.speedFraction)) {
          this.dust.add(this.athleteX - 0.4, this.dustGroundY());
        }
        return;
      case 'flight':
        this.flight.update(dt);
        this.afterRelease(dt);
        // Land with the official mark from their game.
        if (this.flight.landed && this.pendingMark) this.land(this.pendingMark.mark);
        return;
      case 'landed':
        this.afterRelease(dt);
        this.waitForNext();
        return;
      case 'foul':
        this.waitForNext();
        return;
      case 'finished':
        return;
    }
  }

  private waitForNext(): void {
    if (this.phaseTimer < this.cfg.RESULT_TIME) return;
    if (this.competitors.every((c) => c.record.done)) this.enterPhase('finished');
    else this.startAttempt();
  }

  /** Move along the runway; crossing the line without releasing is a foul. */
  private moveOnRunway(dt: number): void {
    this.runner.update(dt);
    this.footsteps.update(this.runner, this.sound);
    if (this.trail.due(this.runner.position, this.runner.speedFraction)) {
      this.dust.add(this.athleteX - 0.4, this.dustGroundY());
    }
    if (this.athleteX > 0) this.foul('OVER THE LINE');
  }

  private release(): void {
    const angle = this.meter.release();
    this.takeoffX = this.athleteX;
    if (this.takeoffX > 0) {
      this.foul('OVER THE LINE');
      return;
    }
    const speed = this.runner.speed * this.cfg.LAUNCH_EFFICIENCY;
    this.net?.send({ k: 'release', n: this.attemptNo, x: this.takeoffX, speed, angle });
    this.launch(speed, angle);
  }

  /** Take off from `takeoffX` (both for our own jump and a replayed one). */
  private launch(speed: number, angle: number): void {
    // Remember where this athlete took off (not the triple jump's later bounces): next
    // time a flag marks the spot, to aim for or beat.
    if (this.phase !== 'flight') this.lastTakeoff.set(this.current.playerIndex, this.takeoffX);
    this.flight.launch(this.takeoffX, this.launchHeight(), speed, angle);
    this.onRelease();
    // A jump or throw heading for the qualifying mark gets a slow-motion highlight.
    const predicted = this.markFor(this.flight.landingX);
    if (predicted !== null && predicted >= this.qualifyMark) this.effects.highlight();
    this.sound.play(this.releaseCue);
    this.enterPhase('flight');
  }

  /** Record the landing. `official` is the other game's mark for a replayed attempt. */
  private land(official?: number | null): void {
    this.lastMark = official !== undefined ? official : this.markFor(this.flight.x);
    if (official === undefined) this.net?.send({ k: 'landed', n: this.attemptNo, mark: this.lastMark });
    this.pendingMark = null;
    this.record.record(this.lastMark);
    this.sound.play(this.landCue);
    this.onLand();
    this.effects.shake(EFFECTS.SHAKE_LAND);
    if (this.lastMark !== null && this.lastMark >= this.qualifyMark) this.sound.play('cheer', 0.8);
    this.enterPhase('landed');
  }

  private foul(reason: string): void {
    if (this.localTurn) this.net?.send({ k: 'foul', n: this.attemptNo, reason });
    this.foulReason = reason;
    this.record.record(null);
    this.sound.play('buzzer');
    this.enterPhase('foul');
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  getResults(): EventResult[] {
    const all: EventResult[] = [
      ...this.competitors.map((c) => resultFor(c.playerIndex, c.name, c.record.marks)),
      ...this.cpus.map((c) => resultFor(-1, c.name, c.marks)),
    ];
    // Best mark first; anyone with no valid attempt goes last.
    return all.sort((a, b) => (b.mark ?? -1) - (a.mark ?? -1));
  }

  crowdLevel(): number {
    switch (this.phase) {
      case 'runup':
      case 'hold':
        return runningCrowd(this.runner.speedFraction);
      case 'flight':
        return AUDIO.CROWD_RUNNING; // everyone watches the flight
      default:
        return AUDIO.CROWD_IDLE;
    }
  }

  debugLines(): string[] {
    return [
      `STATE ${this.phase}`,
      `SPEED ${this.runner.speed.toFixed(2)}`,
      `ANGLE ${this.meter.angle.toFixed(1)}`,
      `X     ${this.athleteX.toFixed(2)}`,
      `FLIGHT ${this.flight.x.toFixed(1)} / ${this.flight.y.toFixed(1)}`,
      ...(this.net ? [`ATTEMPT# ${this.attemptNo}`, this.localTurn ? 'MY TURN' : 'THEIR TURN'] : []),
    ];
  }

  // ------------------------------------------------ shared drawing helpers

  abstract render(r: Renderer): void;

  /** Where the athlete up now took off last time (m), during their run-up; null otherwise. */
  protected get takeoffMarker(): number | null {
    if (this.phase !== 'ready' && this.phase !== 'runup' && this.phase !== 'hold') return null;
    return this.lastTakeoff.get(this.current.playerIndex) ?? null;
  }

  /** A small flag beside the runway at screen x, standing on groundY: last time's take-off. */
  protected drawTakeoffFlag(r: Renderer, x: number, groundY: number): void {
    r.rect(x, groundY - 10, 1, 10, PALETTE.GREY_LIGHT);
    r.rect(x + 1, groundY - 10, 4, 3, PALETTE.CYAN);
  }

  /** "RUN A+D  HOLD W" for whoever is up (keys or buttons). */
  protected runHoldHint(): string {
    const p = this.current.playerIndex;
    return `RUN ${this.prompts.run(p)}  HOLD ${this.prompts.action(p)}`;
  }

  /** Scoreboard note: "ATTEMPT 2/3", or "DAA 2/3" with two players. */
  protected attemptNote(): string {
    const n = `${this.record.current}/${this.cfg.ATTEMPTS}`;
    return this.competitors.length > 1 ? `${this.current.name} ${n}` : `ATTEMPT ${n}`;
  }

  /** True when the crowd should wave (a qualifying mark is on the board). */
  protected get crowdWaves(): boolean {
    return this.phase === 'landed' && (this.lastMark ?? 0) >= this.qualifyMark;
  }

  protected get waveFrame(): number {
    return this.crowdWaves ? Math.floor(this.clock / ANIMATION.WAVE_FRAME_TIME) % 2 : 0;
  }

  protected runPose(): Pose {
    return RUN_CYCLE[Math.floor(this.runner.position / ANIMATION.STRIDE_PER_FRAME) % RUN_CYCLE.length];
  }

  protected athleteSprites(): AthleteSprites {
    const c = this.current;
    c.sprites ??= new AthleteSprites(c.look);
    return c.sprites;
  }

  /** Quarter-circle guide with the current angle as a bright line. */
  protected drawAngle(r: Renderer, cx: number, cy: number): void {
    const radius = 22;
    for (let a = 0; a <= 90; a += 6) {
      const rad = (a * Math.PI) / 180;
      r.rect(cx + Math.cos(rad) * radius, cy - Math.sin(rad) * radius, 1, 1, PALETTE.GREY_LIGHT);
    }
    const rad = (this.meter.angle * Math.PI) / 180;
    for (let i = 4; i <= radius; i++) {
      r.rect(cx + Math.cos(rad) * i, cy - Math.sin(rad) * i, 2, 2, PALETTE.YELLOW);
    }
    r.text(`${Math.round(this.meter.angle)}°`, cx + radius + 4, cy - radius, PALETTE.YELLOW);
  }

  /** "ATTEMPT n OF 3" card, FOUL, and the result line. `extra` is shown under a mark. */
  protected drawMessages(r: Renderer, hint: string, showMark: boolean, extra = ''): void {
    const cx = r.width / 2;
    const y = 36;
    const band = () => r.rect(0, y - 4, r.width, 36, PALETTE.INK);
    switch (this.phase) {
      case 'ready':
        band();
        // With two players, say whose turn it is.
        const who = this.competitors.length > 1 ? `${this.current.name} ` : '';
        r.text(`${who}${this.readyTitle()}`, cx, y, PALETTE.WHITE, 'center', 2);
        const target = this.showQualify ? `QUALIFY ${this.qualifyMark.toFixed(2)} M  ` : '';
        r.text(`${target}${hint}`, cx, y + 20, PALETTE.YELLOW, 'center');
        break;
      case 'landed':
        if (!showMark) break;
        band();
        r.text(`${(this.lastMark ?? 0).toFixed(2)} M`, cx, y, PALETTE.YELLOW, 'center', 2);
        if (extra) r.text(extra, cx, y + 20, PALETTE.GREEN, 'center');
        break;
      case 'foul':
        band();
        r.text('FOUL', cx, y, PALETTE.RED, 'center', 2);
        r.text(this.foulReason, cx, y + 20, PALETTE.WHITE, 'center');
        break;
      default:
        // Online, during the other player's attempt: say whose it is.
        if (this.net && !this.localTurn) watching(r, this.current.name);
        break;
    }
  }
}

function resultFor(playerIndex: number, name: string, marks: (number | null)[]): EventResult {
  const valid = marks.filter((m): m is number => m !== null);
  return {
    playerIndex,
    name,
    mark: valid.length ? Math.max(...valid) : null,
    foul: valid.length === 0,
    disqualified: false,
    points: 0,
    attempts: [...marks],
  };
}

/** "WATCHING ANN" just under the scoreboard, during the other player's attempt online. */
export function watching(r: Renderer, name: string): void {
  const text = `WATCHING ${name}`;
  r.rect(r.width / 2 - text.length * 4 - 4, 26, text.length * 8 + 8, 10, PALETTE.INK);
  r.text(text, r.width / 2, 27, PALETTE.CYAN, 'center');
}
