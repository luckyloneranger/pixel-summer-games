import type { Renderer } from '../core/renderer';
import { ANIMATION, CPU_FIELD, LONG_JUMP } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { ATHLETE_H, ATHLETE_W, type Pose, celebrationFor } from '../gfx/sprites/athlete';
import { drawScoreboard } from '../ui/hud';
import { floorCentimetres } from './field-attempts';
import { RunUpFieldEvent, type RunUpConfig } from './run-up-event';
import type { Difficulty, EventId } from './event';
import { drawGroundShadow, drawSpeedLines } from '../gfx/effects';

export type { FieldPhase as JumpPhase } from './run-up-event';

/**
 * Long jump: sprint down the runway, hold Action to set the angle,
 * release to take off. The athlete is the projectile.
 */
export class LongJumpEvent extends RunUpFieldEvent {
  readonly id: EventId = 'longJump';
  readonly name: string = 'LONG JUMP';
  protected readonly releaseCue = 'jump';
  protected readonly landCue = 'sand';
  /** True when the current jump took off within the perfect zone. */
  perfect = false;

  constructor(
    cfg: RunUpConfig = LONG_JUMP,
    cpuRange: Record<Difficulty, readonly number[]> = CPU_FIELD.LONG_JUMP,
    /** Where the sand is (m past the board), and whether the runway goes all the way to it. */
    protected readonly pit = { start: LONG_JUMP.PIT_START, end: LONG_JUMP.PIT_END, runwayToPit: false },
  ) {
    super(cfg, cpuRange);
  }

  /** A word above the athlete in the air (the triple jump's HOP / STEP / JUMP). */
  protected flightNote(): string {
    return '';
  }

  protected startAttempt(): void {
    super.startAttempt();
    this.perfect = false;
  }

  /** In the air (and after landing) the athlete is wherever the flight is. */
  get athleteX(): number {
    if (this.phase === 'flight' || this.phase === 'landed') return this.flight.x;
    return super.athleteX;
  }

  protected onRelease(): void {
    this.perfect = this.takeoffX >= -LONG_JUMP.PERFECT_ZONE;
  }

  /** Sand sprays up where the jumper lands. */
  protected onLand(): void {
    for (const dx of [-0.5, -0.2, 0.1, 0.4, 0.7]) this.dust.add(this.flight.x + dx, GROUND_Y);
  }

  protected dustGroundY(): number {
    return GROUND_Y;
  }

  protected markFor(landX: number): number {
    const bonus = this.perfect ? 1 + LONG_JUMP.PERFECT_BONUS : 1;
    return floorCentimetres(Math.max(0, landX * bonus));
  }

  // ---------------------------------------------------------------- drawing

  render(r: Renderer): void {
    const ppm = LONG_JUMP.PIXELS_PER_METER;
    const cameraPx = this.athleteX * ppm - LONG_JUMP.CAMERA_LEAD;
    const toScreen = (m: number) => m * ppm - cameraPx;

    this.stadium.drawStands(r, cameraPx, ANIMATION.CROWD_PARALLAX, this.waveFrame);
    this.drawRunwayAndPit(r, toScreen);
    this.dust.render(r, toScreen);

    const marker = this.takeoffMarker;
    if (marker !== null) this.drawTakeoffFlag(r, toScreen(marker), GROUND_Y);
    const x = toScreen(this.athleteX);
    const flying = this.phase === 'flight' || this.phase === 'landed';
    const lift = flying ? Math.round(this.flight.y * ppm) : 0;
    const top = GROUND_Y - ATHLETE_H + 1 - lift;
    const inPit = this.athleteX >= this.pit.start && this.athleteX <= this.pit.end;
    drawGroundShadow(r, x, GROUND_Y, lift, inPit ? PALETTE.GOLD : PALETTE.ORANGE_DARK);
    const note = this.phase === 'flight' ? this.flightNote() : '';
    if (note) r.text(note, x, top - 10, PALETTE.YELLOW, 'center');
    if (this.phase === 'runup' || this.phase === 'hold') drawSpeedLines(r, x - ATHLETE_W / 2, top, this.runner.speedFraction, this.clock);
    r.image(this.athleteSprites().get(this.pose()), x - ATHLETE_W / 2, top);

    if (this.phase === 'hold' || this.phase === 'flight') this.drawAngle(r, x, GROUND_Y - 12);
    if (this.phase === 'landed') this.drawLanding(r, toScreen);

    const best = this.record.best;
    drawScoreboard(
      r,
      this.name,
      best === null ? '-' : `${best.toFixed(2)} M`,
      this.runner.speedFraction,
      this.attemptNote(),
      PALETTE.GREY_LIGHT,
    );
    const showMark = this.phaseTimer >= LONG_JUMP.TAPE_TIME;
    this.drawMessages(r, this.runHoldHint(), showMark, this.perfect ? 'PERFECT TAKE-OFF!' : '');
  }

  private drawRunwayAndPit(r: Renderer, toScreen: (m: number) => number): void {
    // Runway strip (it simply runs off the left of the screen).
    const startX = Math.max(toScreen(-LONG_JUMP.RUNWAY), 0);
    r.rect(startX, RUNWAY_TOP, r.width, RUNWAY_H, PALETTE.ORANGE);
    r.rect(startX, RUNWAY_TOP, r.width, 1, PALETTE.WHITE);
    r.rect(startX, RUNWAY_TOP + RUNWAY_H - 1, r.width, 1, PALETTE.WHITE);

    // Sand pit with a darker rim and a few speckles.
    const pitL = toScreen(this.pit.start);
    const pitR = toScreen(this.pit.end);
    r.rect(pitL - 1, PIT_TOP - 1, pitR - pitL + 2, PIT_H + 2, PALETTE.BROWN);
    r.rect(pitL, PIT_TOP, pitR - pitL, PIT_H, PALETTE.GOLD);
    for (let m = this.pit.start; m < this.pit.end; m += 0.5) {
      r.rect(toScreen(m) + 3, PIT_TOP + 4 + ((m * 2) % 3) * 5, 1, 1, PALETTE.YELLOW);
    }
    // Grass between the board and the pit (the triple jump's runway carries on to it).
    if (!this.pit.runwayToPit) r.rect(toScreen(0), RUNWAY_TOP, pitL - toScreen(0), RUNWAY_H, PALETTE.GREEN);

    // Take-off board (white) with the foul line at its front edge.
    const boardW = LONG_JUMP.PERFECT_ZONE * LONG_JUMP.PIXELS_PER_METER;
    r.rect(toScreen(-LONG_JUMP.PERFECT_ZONE), RUNWAY_TOP + 1, boardW, RUNWAY_H - 2, PALETTE.WHITE);
    r.rect(toScreen(0), RUNWAY_TOP + 1, 2, RUNWAY_H - 2, PALETTE.RED);

    // Distance-to-board markers along the runway, and metre marks along the pit.
    for (let m = 10; m < LONG_JUMP.RUNWAY; m += 10) {
      const sx = toScreen(-m);
      if (sx < -20 || sx > r.width + 20) continue;
      r.rect(sx - 9, RUNWAY_TOP - 12, 18, 9, PALETTE.WHITE);
      r.text(String(m), sx, RUNWAY_TOP - 11, PALETTE.INK, 'center');
    }
    for (let m = Math.ceil(this.pit.start + 1); m < this.pit.end; m++) {
      const sx = toScreen(m);
      r.rect(sx, PIT_TOP + PIT_H + 1, 1, 3, PALETTE.WHITE);
      if (m < 10 || m % 2 === 0) r.text(String(m), sx, PIT_TOP + PIT_H + 5, PALETTE.WHITE, 'center'); // two-digit labels need room
    }
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
    if (this.phase === 'landed') {
      const good = (this.lastMark ?? 0) >= this.qualifyMark && this.phaseTimer > CELEBRATE_AFTER;
      return good ? celebrationFor(this.current.playerIndex) : 'land';
    }
    const moving = this.runner.speed > 0 && (this.phase === 'runup' || this.phase === 'hold');
    return moving ? this.runPose() : 'stand';
  }
}

// Layout in screen pixels (drawing only).
const RUNWAY_TOP = 124;
const RUNWAY_H = 14;
const GROUND_Y = RUNWAY_TOP + 10; // where the athlete's feet touch
const PIT_TOP = RUNWAY_TOP - 6;
const PIT_H = RUNWAY_H + 12;
const PUFF: [number, number][] = [[-1, 1], [-0.5, 1.5], [0, 2], [0.5, 1.5], [1, 1], [1.4, 0.5], [-1.4, 0.5]];
const CELEBRATE_AFTER = 1.4; // s after a qualifying landing (once the tape is out) before celebrating
