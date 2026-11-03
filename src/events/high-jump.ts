import type { Renderer } from '../core/renderer';
import type { Rng } from '../core/rng';
import { ANIMATION, CPU_FIELD, HIGH_JUMP } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { ATHLETE_H, ATHLETE_W, type Pose } from '../gfx/sprites/athlete';
import { drawScoreboard } from '../ui/hud';
import type { AttemptTracker } from './field-attempts';
import { HeightAttempts } from './height-attempts';
import { RunUpFieldEvent } from './run-up-event';

/** Highest bar height at or below `best`, or null if it's under the first height. */
export function heightFor(best: number): number | null {
  let h: number | null = null;
  for (const height of HIGH_JUMP.HEIGHTS) if (height <= best + 1e-9) h = height;
  return h;
}

/**
 * High jump: the same run-up and angle meter as the long jump, but the jump
 * must carry the athlete over a bar just past the take-off line. The bar goes
 * up after each clearance; three misses in a row and you're out. The best
 * height cleared counts.
 */
export class HighJumpEvent extends RunUpFieldEvent {
  readonly id = 'highJump';
  readonly name = 'HIGH JUMP';
  protected readonly releaseCue = 'jump';
  protected readonly landCue = 'thud';
  /** The bar height for the jump in progress (m). */
  jumpBar = 0;
  /** Body height as it passes the bar (m), or null if it never got there. */
  crossing: number | null = null;
  /** Did this jump clear the bar? (null until released) */
  cleared: boolean | null = null;
  private knockedAt = -1; // clock time the bar was hit (for the falling animation)

  constructor() {
    super(HIGH_JUMP, CPU_FIELD.HIGH_JUMP);
  }

  protected createTracker(): AttemptTracker {
    return new HeightAttempts(HIGH_JUMP.HEIGHTS, HIGH_JUMP.ATTEMPTS);
  }

  /** The current competitor's heights. */
  get heights(): HeightAttempts {
    return this.record as HeightAttempts;
  }

  protected startAttempt(): void {
    super.startAttempt();
    this.jumpBar = this.heights.height;
    this.crossing = null;
    this.cleared = null;
    this.knockedAt = -1;
  }

  get athleteX(): number {
    if (this.phase === 'flight' || this.phase === 'landed') return this.flight.x;
    return super.athleteX;
  }

  protected launchHeight(): number {
    return HIGH_JUMP.TAKEOFF_HEIGHT;
  }

  /** Decide clear or knock from the exact flight path, the moment you let go. */
  protected onRelease(): void {
    this.crossing = this.flight.heightAt(HIGH_JUMP.BAR_X);
    this.cleared = this.crossing !== null && this.crossing >= this.jumpBar;
  }

  /** The bar falls (with a clank) as the athlete reaches it on a failed jump. */
  protected afterRelease(_dt: number): void {
    if (this.cleared === false && this.knockedAt < 0 && this.flight.x >= HIGH_JUMP.BAR_X) {
      this.knockedAt = this.clock;
      this.sound.play('clank');
    }
  }

  protected markFor(_landX: number): number | null {
    return this.cleared ? this.jumpBar : null;
  }

  /** CPUs get one best height from their range, snapped to the bar heights. */
  protected cpuMarks(range: readonly number[], rng: Rng): (number | null)[] {
    return [heightFor(rng.range(range[0], range[1]))];
  }

  protected readyTitle(): string {
    return `${this.heights.height.toFixed(2)} M TRY ${this.record.current}/${this.cfg.ATTEMPTS}`;
  }

  protected attemptNote(): string {
    const h = `${this.heights.height.toFixed(2)}`;
    return this.competitors.length > 1 ? `${this.current.name} ${h}` : `BAR ${h} TRY ${this.record.current}`;
  }

  debugLines(): string[] {
    const c = this.crossing === null ? '-' : this.crossing.toFixed(2);
    return [...super.debugLines(), `BAR ${this.jumpBar.toFixed(2)} CROSS ${c}`];
  }

  // ---------------------------------------------------------------- drawing

  render(r: Renderer): void {
    const ppm = HIGH_JUMP.PIXELS_PER_METER;
    const cameraPx = this.athleteX * ppm - HIGH_JUMP.CAMERA_LEAD;
    const toScreen = (m: number) => m * ppm - cameraPx;

    this.stadium.drawStands(r, cameraPx, ANIMATION.CROWD_PARALLAX, this.waveFrame);
    this.drawRunwayAndMat(r, toScreen);
    this.dust.render(r, toScreen);
    this.drawUprights(r, toScreen);
    this.drawAthlete(r, toScreen);
    this.drawBar(r, toScreen);

    const best = this.record.best;
    drawScoreboard(
      r,
      this.name,
      best === null ? '-' : `${best.toFixed(2)} M`,
      this.runner.speedFraction,
      this.attemptNote(),
      PALETTE.GREY_LIGHT,
    );
    this.drawMessages(r, 'RUN A+D  HOLD W', false);
    if (this.phase === 'landed') this.drawResult(r);
    if (this.phase === 'hold') this.drawAngle(r, toScreen(this.athleteX), GROUND_Y - 12);
  }

  private drawRunwayAndMat(r: Renderer, toScreen: (m: number) => number): void {
    const start = Math.max(toScreen(-HIGH_JUMP.RUNWAY), 0);
    const line = toScreen(0);
    r.rect(start, RUNWAY_TOP, Math.max(0, line - start), RUNWAY_H, PALETTE.ORANGE);
    r.rect(start, RUNWAY_TOP, Math.max(0, line - start), 1, PALETTE.WHITE);
    r.rect(line, RUNWAY_TOP, 2, RUNWAY_H, PALETTE.WHITE); // take-off line
    // Landing mat: a deep blue block with a lighter top edge.
    const matL = toScreen(HIGH_JUMP.MAT_START);
    const matR = toScreen(HIGH_JUMP.MAT_END);
    r.rect(matL, MAT_TOP, matR - matL, GROUND_Y - MAT_TOP + 2, PALETTE.BLUE);
    r.rect(matL, MAT_TOP, matR - matL, 2, PALETTE.SKY);
    r.rect(matL, MAT_TOP + 5, matR - matL, 1, PALETTE.NAVY);
    // Distance-to-line boards on the run-up.
    for (let m = 5; m < HIGH_JUMP.RUNWAY; m += 5) {
      const sx = toScreen(-m);
      if (sx < -20 || sx > r.width + 20) continue;
      r.rect(sx - 9, RUNWAY_TOP - 12, 18, 9, PALETTE.WHITE);
      r.text(String(m), sx, RUNWAY_TOP - 11, PALETTE.INK, 'center');
    }
  }

  private drawUprights(r: Renderer, toScreen: (m: number) => number): void {
    const x = toScreen(HIGH_JUMP.BAR_X);
    const top = GROUND_Y - Math.round(UPRIGHT_HEIGHT * HIGH_JUMP.PIXELS_PER_METER);
    r.rect(x - 6, top, 2, GROUND_Y - top, PALETTE.GREY_LIGHT);
    r.rect(x + 5, top, 2, GROUND_Y - top, PALETTE.GREY_LIGHT);
    // Height board above the uprights.
    const label = `${this.jumpBar.toFixed(2)}`;
    r.rect(x - 18, top - 12, 37, 10, PALETTE.INK);
    r.text(label, x + 1, top - 11, PALETTE.YELLOW, 'center');
  }

  /** The bar: striped, at height; a knocked bar drops onto the mat. */
  private drawBar(r: Renderer, toScreen: (m: number) => number): void {
    const ppm = HIGH_JUMP.PIXELS_PER_METER;
    const x = toScreen(HIGH_JUMP.BAR_X);
    let y = GROUND_Y - Math.round(this.jumpBar * ppm);
    if (this.knockedAt >= 0) {
      const t = Math.min(1, (this.clock - this.knockedAt) / HIGH_JUMP.BAR_FALL_TIME);
      y = Math.round(y + (MAT_TOP - 2 - y) * t * t); // falls faster and faster
    }
    for (let i = 0; i < 14; i += 2) r.rect(x - 7 + i, y, 2, 2, (i / 2) % 2 === 0 ? PALETTE.WHITE : PALETTE.RED);
  }

  private drawAthlete(r: Renderer, toScreen: (m: number) => number): void {
    const ppm = HIGH_JUMP.PIXELS_PER_METER;
    const x = toScreen(this.athleteX) - ATHLETE_W / 2;
    const flying = this.phase === 'flight' || this.phase === 'landed';
    const onMat = this.athleteX >= HIGH_JUMP.MAT_START && this.athleteX <= HIGH_JUMP.MAT_END;
    const floor = onMat ? MAT_TOP + 1 : GROUND_Y;
    let bottom = GROUND_Y + 1;
    if (flying) {
      // The body's centre follows the flight; the sprite is drawn around it.
      const centre = GROUND_Y - this.flight.y * ppm;
      bottom = Math.min(floor + 1, Math.round(centre + ATHLETE_H / 2));
    }
    r.image(this.athleteSprites().get(this.pose(onMat)), x, bottom - ATHLETE_H);
  }

  private pose(onMat: boolean): Pose {
    if (this.phase === 'flight') return this.flight.x > HIGH_JUMP.BAR_X - FLOP_FROM ? 'flop' : 'jump';
    if (this.phase === 'landed') return onMat ? 'lie' : 'land';
    const moving = this.runner.speed > 0 && (this.phase === 'runup' || this.phase === 'hold');
    return moving ? this.runPose() : 'stand';
  }

  /** CLEARED / MISS, with why it missed and whether that was the last chance. */
  private drawResult(r: Renderer): void {
    if (this.phaseTimer < RESULT_DELAY) return;
    const cx = r.width / 2;
    const y = 36;
    r.rect(0, y - 4, r.width, 36, PALETTE.INK);
    if (this.cleared) {
      r.text(`CLEARED ${this.jumpBar.toFixed(2)} M`, cx, y, PALETTE.YELLOW, 'center', 2);
      if (this.heights.done) r.text('ALL HEIGHTS CLEARED!', cx, y + 20, PALETTE.GREEN, 'center');
      return;
    }
    r.text('MISS', cx, y, PALETTE.RED, 'center', 2);
    const why = this.crossing === null ? 'SHORT OF THE BAR' : 'KNOCKED THE BAR';
    const best = this.record.best;
    const out = this.heights.done ? `  OUT - BEST ${best === null ? 'NONE' : best.toFixed(2)}` : '';
    r.text(`${why}${out}`, cx, y + 20, PALETTE.WHITE, 'center');
  }
}

// Layout in screen pixels (drawing only).
const RUNWAY_TOP = 138;
const RUNWAY_H = 12;
const GROUND_Y = RUNWAY_TOP + 10; // where feet touch the ground
const MAT_TOP = GROUND_Y - 9; // top surface of the landing mat
const UPRIGHT_HEIGHT = 2.6; // m, height of the uprights
const FLOP_FROM = 0.6; // m before the bar where the athlete turns into the arched flop
const RESULT_DELAY = 0.3; // s after landing before CLEARED / MISS shows
