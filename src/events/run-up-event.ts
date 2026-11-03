import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import { ANIMATION, RUNNER } from '../game/tuning';
import { Stadium } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import { AthleteSprites, RUN_CYCLE, type Pose } from '../gfx/sprites/athlete';
import { AngleMeter } from './angle-meter';
import { cpuFieldMarks, cpuLineup, playerLook } from './cpu';
import { qualifyingMark } from '../game/scoring';
import { SILENT, type AthleticsEvent, type Difficulty, type EventContext, type EventId, type EventResult, type SoundCue, type SoundSink } from './event';
import { Footsteps, runningCrowd } from './footsteps';
import { AUDIO } from '../game/tuning';
import { FieldAttempts } from './field-attempts';
import { Projectile } from './projectile';
import { TapRunner, applyRunPresses } from './tap-runner';
import { keysFor } from './player-input';
import type { Look } from '../gfx/sprite';

/** A human taking part: their attempts and how they look. */
export interface FieldCompetitor {
  playerIndex: number;
  name: string;
  look: Look;
  record: FieldAttempts;
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
  protected sound: SoundSink = SILENT;
  private readonly footsteps = new Footsteps();
  /** Sounds for letting go and for landing (set by each event). */
  protected abstract readonly releaseCue: SoundCue;
  protected abstract readonly landCue: SoundCue;

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
  get record(): FieldAttempts {
    return this.current.record;
  }

  init(ctx: EventContext): void {
    this.sound = ctx.sound ?? SILENT;
    this.assist = ctx.assist ?? false;
    this.competitors = ctx.players.map((p, i) => ({
      playerIndex: p.index ?? i,
      name: p.initials,
      look: playerLook(p.team),
      record: new FieldAttempts(this.cfg.ATTEMPTS),
      sprites: null,
    }));
    this.turn = 0;
    this.qualifyMark = qualifyingMark(this.id, ctx.difficulty);
    this.showQualify = !ctx.practice;
    this.cpus = cpuLineup(ctx.players.map((p) => p.team)).map((a) => ({
      name: a.name,
      marks: cpuFieldMarks(this.cpuRanges[ctx.difficulty], this.cfg.ATTEMPTS, ctx.rng),
    }));
    this.clock = 0;
    this.startAttempt();
  }

  protected startAttempt(): void {
    // Take turns: whoever has had the fewest attempts goes next (player 1 first).
    let next = 0;
    this.competitors.forEach((c, i) => {
      if (c.record.marks.length < this.competitors[next].record.marks.length) next = i;
    });
    this.turn = next;
    this.runner.reset();
    this.meter.reset();
    this.footsteps.reset();
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
  /** Turn the landing point (m from the line) into the recorded mark. */
  protected abstract markFor(landX: number): number;

  // ------------------------------------------------ rules

  update(dt: number, input: InputSnapshot): void {
    this.clock += dt;
    this.phaseTimer += dt;
    // Only the athlete whose turn it is reads keys (both sets for a lone player).
    const keys = keysFor(input, this.current.playerIndex, this.competitors.length === 1);
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
        this.flight.update(dt);
        this.afterRelease(dt);
        if (this.flight.landed) this.land();
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
    this.flight.launch(this.takeoffX, this.launchHeight(), speed, angle);
    this.onRelease();
    this.sound.play(this.releaseCue);
    this.enterPhase('flight');
  }

  private land(): void {
    this.lastMark = this.markFor(this.flight.x);
    this.record.record(this.lastMark);
    this.sound.play(this.landCue);
    if (this.lastMark >= this.qualifyMark) this.sound.play('cheer', 0.8);
    this.enterPhase('landed');
  }

  private foul(reason: string): void {
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
    ];
  }

  // ------------------------------------------------ shared drawing helpers

  abstract render(r: Renderer): void;

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
        r.text(`${who}ATTEMPT ${this.record.current} OF ${this.cfg.ATTEMPTS}`, cx, y, PALETTE.WHITE, 'center', 2);
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
