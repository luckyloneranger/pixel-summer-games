import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import { ANIMATION, CPU_FIELD, LONG_JUMP, RUNNER } from '../game/tuning';
import { Stadium } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import { ATHLETE_H, ATHLETE_W, AthleteSprites, RUN_CYCLE, makeLook, type Pose } from '../gfx/sprites/athlete';
import { drawScoreboard } from '../ui/hud';
import { AngleMeter } from './angle-meter';
import { CPU_ATHLETES, cpuFieldMarks } from './cpu';
import type { AthleticsEvent, EventContext, EventResult } from './event';
import { FieldAttempts, floorCentimetres } from './field-attempts';
import { Projectile } from './projectile';
import { TapRunner, applyRunPresses } from './tap-runner';

/** Where the current attempt is up to. */
export type JumpPhase = 'ready' | 'runup' | 'hold' | 'flight' | 'landed' | 'foul' | 'finished';

interface CpuJumper {
  name: string;
  marks: (number | null)[];
}

/**
 * Long jump: sprint down the runway, hold Action to set the angle,
 * release to take off. Three attempts, best counts. Distances are in
 * metres measured from the foul line (negative = still on the runway).
 */
export class LongJumpEvent implements AthleticsEvent {
  readonly id = 'longJump';
  readonly name = 'LONG JUMP';
  readonly kind = 'field';
  readonly attempts = LONG_JUMP.ATTEMPTS;

  phase: JumpPhase = 'ready';
  readonly runner = new TapRunner(RUNNER);
  readonly meter = new AngleMeter();
  readonly flight = new Projectile(LONG_JUMP.GRAVITY);
  record = new FieldAttempts(LONG_JUMP.ATTEMPTS);
  /** Take-off point (m from the line) of the current jump. */
  takeoffX = 0;
  perfect = false;
  lastMark: number | null = null;
  foulReason = '';

  private playerName = 'P1';
  private cpus: CpuJumper[] = [];
  private phaseTimer = 0;
  private clock = 0; // s since the event started (animations)
  private readonly stadium = new Stadium();
  private sprites: AthleteSprites | null = null;

  init(ctx: EventContext): void {
    this.playerName = ctx.players[0].initials;
    this.record = new FieldAttempts(LONG_JUMP.ATTEMPTS);
    this.cpus = CPU_ATHLETES.map((a) => ({
      name: a.name,
      marks: cpuFieldMarks(CPU_FIELD.LONG_JUMP[ctx.difficulty], LONG_JUMP.ATTEMPTS, ctx.rng),
    }));
    this.clock = 0;
    this.startAttempt();
  }

  private startAttempt(): void {
    this.runner.reset();
    this.meter.reset();
    this.takeoffX = 0;
    this.perfect = false;
    this.lastMark = null;
    this.foulReason = '';
    this.enterPhase('ready');
  }

  private enterPhase(phase: JumpPhase): void {
    this.phase = phase;
    this.phaseTimer = 0;
  }

  /** Athlete's position along the ground, in m from the foul line. */
  get athleteX(): number {
    if (this.phase === 'flight' || this.phase === 'landed') return this.flight.x;
    return this.runner.position - LONG_JUMP.RUNWAY;
  }

  update(dt: number, input: InputSnapshot): void {
    this.clock += dt;
    this.phaseTimer += dt;
    const left = input.justPressed('P1_LEFT') || input.justPressed('P2_LEFT');
    const right = input.justPressed('P1_RIGHT') || input.justPressed('P2_RIGHT');
    const actionPressed = input.justPressed('P1_ACTION') || input.justPressed('P2_ACTION');
    const actionHeld = input.isDown('P1_ACTION') || input.isDown('P2_ACTION');

    switch (this.phase) {
      case 'ready':
      case 'runup':
        if (applyRunPresses(this.runner, left, right)) this.phase = 'runup';
        // The meter only starts once you're moving, so you can't get stuck at a standstill.
        if (actionPressed && this.runner.speed > 0) {
          this.meter.start();
          this.runner.canAccelerate = false; // keep current speed, no more gains
          this.phase = 'hold';
          // A tap so quick it's already released counts as releasing straight away.
          if (!actionHeld) {
            this.takeOff();
            return;
          }
        }
        this.moveOnRunway(dt);
        return;

      case 'hold':
        // The release happened during this step, at the current spot.
        if (!actionHeld) {
          this.takeOff();
          return;
        }
        this.meter.update(dt);
        this.moveOnRunway(dt);
        return;

      case 'flight':
        this.flight.update(dt);
        if (this.flight.landed) this.land();
        return;

      case 'landed':
      case 'foul':
        if (this.phaseTimer >= LONG_JUMP.RESULT_TIME) {
          if (this.record.done) this.enterPhase('finished');
          else this.startAttempt();
        }
        return;

      case 'finished':
        return;
    }
  }

  /** Move along the runway; running over the line without jumping is a foul. */
  private moveOnRunway(dt: number): void {
    this.runner.update(dt);
    if (this.athleteX > 0) this.foul('OVER THE LINE');
  }

  private takeOff(): void {
    const angle = this.meter.release();
    this.takeoffX = this.athleteX;
    if (this.takeoffX > 0) {
      this.foul('OVER THE LINE');
      return;
    }
    this.perfect = this.takeoffX >= -LONG_JUMP.PERFECT_ZONE;
    this.flight.launch(this.takeoffX, 0, this.runner.speed * LONG_JUMP.LAUNCH_EFFICIENCY, angle);
    this.enterPhase('flight');
  }

  private land(): void {
    const bonus = this.perfect ? 1 + LONG_JUMP.PERFECT_BONUS : 1;
    this.lastMark = floorCentimetres(Math.max(0, this.flight.x * bonus));
    this.record.record(this.lastMark);
    this.enterPhase('landed');
  }

  private foul(reason: string): void {
    this.foulReason = reason;
    this.record.record(null);
    this.enterPhase('foul');
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  getResults(): EventResult[] {
    const all: EventResult[] = [
      this.resultFor(0, this.playerName, this.record.marks),
      ...this.cpus.map((c) => this.resultFor(-1, c.name, c.marks)),
    ];
    // Best mark first; anyone with no valid jump goes last.
    return all.sort((a, b) => (b.mark ?? -1) - (a.mark ?? -1));
  }

  private resultFor(playerIndex: number, name: string, marks: (number | null)[]): EventResult {
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

  debugLines(): string[] {
    return [
      `STATE ${this.phase}`,
      `SPEED ${this.runner.speed.toFixed(2)}`,
      `ANGLE ${this.meter.angle.toFixed(1)}`,
      `X     ${this.athleteX.toFixed(2)}`,
      `HEIGHT ${this.flight.y.toFixed(2)}`,
    ];
  }

  // ---------------------------------------------------------------- drawing

  render(r: Renderer): void {
    const ppm = LONG_JUMP.PIXELS_PER_METER;
    const cameraPx = this.athleteX * ppm - LONG_JUMP.CAMERA_LEAD;
    const toScreen = (m: number) => m * ppm - cameraPx;

    const bigJump = this.phase === 'landed' && (this.lastMark ?? 0) >= LONG_JUMP.QUALIFY;
    const waveFrame = bigJump ? Math.floor(this.clock / ANIMATION.WAVE_FRAME_TIME) % 2 : 0;
    this.stadium.drawStands(r, cameraPx, ANIMATION.CROWD_PARALLAX, waveFrame);
    this.drawRunwayAndPit(r, toScreen);

    const x = toScreen(this.athleteX);
    const lift = Math.round(this.flight.y * ppm);
    const flying = this.phase === 'flight' || this.phase === 'landed';
    r.image(this.athleteSprites().get(this.pose()), x - ATHLETE_W / 2, GROUND_Y - ATHLETE_H + 1 - (flying ? lift : 0));

    if (this.phase === 'hold' || this.phase === 'flight') this.drawAngle(r, x, GROUND_Y - 12);
    if (this.phase === 'landed') this.drawLanding(r, toScreen);

    const best = this.record.best;
    drawScoreboard(
      r,
      this.name,
      best === null ? '-' : `${best.toFixed(2)} M`,
      this.runner.speedFraction,
      `ATTEMPT ${this.record.current}/${LONG_JUMP.ATTEMPTS}`,
      PALETTE.GREY_LIGHT,
    );
    this.drawMessages(r);
  }

  private drawRunwayAndPit(r: Renderer, toScreen: (m: number) => number): void {
    // Runway strip (it simply runs off the left of the screen).
    const startX = toScreen(-LONG_JUMP.RUNWAY);
    r.rect(Math.max(startX, 0), RUNWAY_TOP, r.width, RUNWAY_H, PALETTE.ORANGE);
    r.rect(Math.max(startX, 0), RUNWAY_TOP, r.width, 1, PALETTE.WHITE);
    r.rect(Math.max(startX, 0), RUNWAY_TOP + RUNWAY_H - 1, r.width, 1, PALETTE.WHITE);

    // Sand pit with a darker rim and a few speckles.
    const pitL = toScreen(LONG_JUMP.PIT_START);
    const pitR = toScreen(LONG_JUMP.PIT_END);
    r.rect(pitL - 1, PIT_TOP - 1, pitR - pitL + 2, PIT_H + 2, PALETTE.BROWN);
    r.rect(pitL, PIT_TOP, pitR - pitL, PIT_H, PALETTE.GOLD);
    for (let m = LONG_JUMP.PIT_START; m < LONG_JUMP.PIT_END; m += 0.5) {
      const sx = toScreen(m);
      r.rect(sx + 3, PIT_TOP + 4 + ((m * 2) % 3) * 5, 1, 1, PALETTE.YELLOW);
    }
    // Grass between the board and the pit.
    r.rect(toScreen(0), RUNWAY_TOP, pitL - toScreen(0), RUNWAY_H, PALETTE.GREEN);

    // Take-off board (white) with the foul line at its front edge.
    const lineX = toScreen(0);
    r.rect(toScreen(-LONG_JUMP.PERFECT_ZONE), RUNWAY_TOP + 1, LONG_JUMP.PERFECT_ZONE * LONG_JUMP.PIXELS_PER_METER, RUNWAY_H - 2, PALETTE.WHITE);
    r.rect(lineX, RUNWAY_TOP + 1, 2, RUNWAY_H - 2, PALETTE.RED);

    // Distance-to-board markers along the runway, and metre marks along the pit.
    for (let m = 10; m < LONG_JUMP.RUNWAY; m += 10) {
      const sx = toScreen(-m);
      if (sx < -20 || sx > r.width + 20) continue;
      r.rect(sx - 9, RUNWAY_TOP - 12, 18, 9, PALETTE.WHITE);
      r.text(String(m), sx, RUNWAY_TOP - 11, PALETTE.INK, 'center');
    }
    for (let m = Math.ceil(LONG_JUMP.PIT_START + 1); m < LONG_JUMP.PIT_END; m++) {
      const sx = toScreen(m);
      r.rect(sx, PIT_TOP + PIT_H + 1, 1, 3, PALETTE.WHITE);
      r.text(String(m), sx, PIT_TOP + PIT_H + 5, PALETTE.WHITE, 'center');
    }
  }

  /** Quarter-circle guide with the current angle as a bright line. */
  private drawAngle(r: Renderer, cx: number, cy: number): void {
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

  /** Sand puff on landing, then the tape measure running out from the line. */
  private drawLanding(r: Renderer, toScreen: (m: number) => number): void {
    const landX = toScreen(this.flight.x);
    const t = this.phaseTimer;
    if (t < LONG_JUMP.PUFF_TIME) {
      const spread = Math.round((t / LONG_JUMP.PUFF_TIME) * 10);
      for (const [dx, dy] of PUFF) r.rect(landX + dx * spread, GROUND_Y - 2 - Math.abs(dy) * spread, 2, 2, PALETTE.YELLOW);
    }
    const run = Math.min(1, t / LONG_JUMP.TAPE_TIME);
    const lineX = toScreen(0);
    r.rect(lineX, GROUND_Y + 3, (landX - lineX) * run, 1, PALETTE.YELLOW);
    if (run >= 1) r.rect(landX, GROUND_Y - 2, 1, 6, PALETTE.YELLOW);
  }

  private pose(): Pose {
    if (this.phase === 'flight') return 'jump';
    if (this.phase === 'landed') return 'land';
    const moving = this.runner.speed > 0 && (this.phase === 'runup' || this.phase === 'hold');
    return moving ? this.runPose() : 'stand';
  }

  private runPose(): Pose {
    return RUN_CYCLE[Math.floor(this.runner.position / ANIMATION.STRIDE_PER_FRAME) % RUN_CYCLE.length];
  }

  private athleteSprites(): AthleteSprites {
    this.sprites ??= new AthleteSprites(makeLook('red', 'light', PALETTE.BROWN));
    return this.sprites;
  }

  private drawMessages(r: Renderer): void {
    const cx = r.width / 2;
    const y = 36;
    const band = () => r.rect(0, y - 4, r.width, 36, PALETTE.INK);
    switch (this.phase) {
      case 'ready':
        band();
        r.text(`ATTEMPT ${this.record.current} OF ${LONG_JUMP.ATTEMPTS}`, cx, y, PALETTE.WHITE, 'center', 2);
        r.text(`QUALIFY ${LONG_JUMP.QUALIFY.toFixed(2)} M  RUN A+D  HOLD W`, cx, y + 20, PALETTE.YELLOW, 'center');
        break;
      case 'landed':
        if (this.phaseTimer < LONG_JUMP.TAPE_TIME) break;
        band();
        r.text(`${(this.lastMark ?? 0).toFixed(2)} M`, cx, y, PALETTE.YELLOW, 'center', 2);
        if (this.perfect) r.text('PERFECT TAKE-OFF!', cx, y + 20, PALETTE.GREEN, 'center');
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

// Layout in screen pixels (drawing only).
const RUNWAY_TOP = 124;
const RUNWAY_H = 14;
const GROUND_Y = RUNWAY_TOP + 10; // where the athlete's feet touch
const PIT_TOP = RUNWAY_TOP - 6;
const PIT_H = RUNWAY_H + 12;
const PUFF: [number, number][] = [[-1, 1], [-0.5, 1.5], [0, 2], [0.5, 1.5], [1, 1], [1.4, 0.5], [-1.4, 0.5]];
