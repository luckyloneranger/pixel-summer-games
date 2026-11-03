import type { Renderer } from '../core/renderer';
import { ANIMATION, CPU_FIELD, JAVELIN } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { ATHLETE_H, ATHLETE_W, type Pose } from '../gfx/sprites/athlete';
import { drawScoreboard } from '../ui/hud';
import { floorCentimetres } from './field-attempts';
import { RunUpFieldEvent } from './run-up-event';

/**
 * Where the camera sits (in px) for something at `x` m along the field and
 * `height` m up. It follows sideways, and rises once the object gets high, so
 * the javelin always stays on screen.
 */
export function javelinCamera(x: number, height: number): { x: number; y: number } {
  const ppm = JAVELIN.PIXELS_PER_METER;
  return {
    x: x * ppm - JAVELIN.CAMERA_LEAD,
    y: Math.max(0, height * ppm - JAVELIN.CAMERA_RISE_START),
  };
}

/** Screen position of a point `x` m along and `height` m up, for a camera. */
export function javelinToScreen(x: number, height: number, cam: { x: number; y: number }): { sx: number; sy: number } {
  const ppm = JAVELIN.PIXELS_PER_METER;
  return { sx: x * ppm - cam.x, sy: GROUND_Y - height * ppm + cam.y };
}

/**
 * Javelin throw: the same run-up and angle meter as the long jump, but the
 * javelin flies (from shoulder height) while the athlete brakes to a stop.
 */
export class JavelinEvent extends RunUpFieldEvent {
  readonly id = 'javelin';
  readonly name = 'JAVELIN';
  protected readonly releaseCue = 'whoosh';
  protected readonly landCue = 'thud';
  /** Direction the javelin was pointing when it stuck in, in degrees. */
  landingHeading = -45;

  constructor() {
    super(JAVELIN, CPU_FIELD.JAVELIN);
  }

  protected launchHeight(): number {
    return JAVELIN.RELEASE_HEIGHT;
  }

  /** After letting go, the athlete brakes to a stop. */
  protected afterRelease(dt: number): void {
    this.runner.speed = Math.max(0, this.runner.speed - JAVELIN.BRAKE * dt);
    this.runner.update(dt);
  }

  protected markFor(landX: number): number {
    this.landingHeading = this.flight.headingDegrees;
    return floorCentimetres(Math.max(0, landX));
  }

  /** What the camera follows: the athlete, then the javelin once it's thrown. */
  get focus(): { x: number; height: number } {
    const thrown = this.phase === 'flight' || this.phase === 'landed';
    return thrown ? { x: this.flight.x, height: this.flight.y } : { x: this.athleteX, height: 0 };
  }

  debugLines(): string[] {
    return [...super.debugLines(), `TILT  ${this.flight.headingDegrees.toFixed(0)}`];
  }

  // ---------------------------------------------------------------- drawing

  render(r: Renderer): void {
    const focus = this.focus;
    const cam = javelinCamera(focus.x, focus.height);
    const at = (x: number, h: number) => javelinToScreen(x, h, cam);

    this.stadium.drawStands(r, cam.x, ANIMATION.CROWD_PARALLAX, this.waveFrame, cam.y);
    this.drawField(r, at, cam.y);

    // Athlete, carrying the javelin until it's thrown.
    const athlete = at(this.athleteX, 0);
    r.image(this.athleteSprites().get(this.pose()), athlete.sx - ATHLETE_W / 2, athlete.sy - ATHLETE_H + 1);
    const thrown = this.phase === 'flight' || this.phase === 'landed';
    if (!thrown) {
      const carryAngle = this.phase === 'hold' ? this.meter.angle : CARRY_ANGLE;
      drawJavelin(r, athlete.sx - 2, athlete.sy - 19, carryAngle);
    }
    if (this.phase === 'hold') this.drawAngle(r, athlete.sx, athlete.sy - 12);

    if (this.phase === 'flight') {
      const j = at(this.flight.x, this.flight.y);
      drawJavelin(r, j.sx, j.sy, this.flight.headingDegrees);
    } else if (this.phase === 'landed') {
      this.drawStuckJavelin(r, at);
    }

    const best = this.record.best;
    drawScoreboard(
      r,
      this.name,
      best === null ? '-' : `${best.toFixed(2)} M`,
      this.runner.speedFraction,
      this.attemptNote(),
      PALETTE.GREY_LIGHT,
    );
    this.drawMessages(r, 'RUN A+D  HOLD W', this.phaseTimer >= MARK_DELAY);
  }

  private drawField(r: Renderer, at: (x: number, h: number) => { sx: number; sy: number }, shift: number): void {
    const top = RUNWAY_TOP + shift;
    // Runway, ending at the foul line.
    const start = Math.max(at(-JAVELIN.RUNWAY, 0).sx, 0);
    const line = at(0, 0).sx;
    if (line > 0) {
      r.rect(start, top, line - start, RUNWAY_H, PALETTE.ORANGE);
      r.rect(start, top, line - start, 1, PALETTE.WHITE);
      r.rect(start, top + RUNWAY_H - 1, line - start, 1, PALETTE.WHITE);
    }
    r.rect(line, top - 2, 2, RUNWAY_H + 4, PALETTE.WHITE); // foul line

    // Distance-to-line boards on the runway.
    for (let m = 10; m < JAVELIN.RUNWAY; m += 10) {
      const sx = at(-m, 0).sx;
      if (sx < -20 || sx > r.width + 20) continue;
      r.rect(sx - 9, top - 12, 18, 9, PALETTE.WHITE);
      r.text(String(m), sx, top - 11, PALETTE.INK, 'center');
    }
    // Distance lines on the grass every 10 m from 20 m out.
    for (let m = FIRST_FIELD_LINE; m <= LAST_FIELD_LINE; m += FIELD_LINE_EVERY) {
      const sx = at(m, 0).sx;
      if (sx < -20 || sx > r.width + 20) continue;
      r.rect(sx, top - 2, 1, RUNWAY_H + 4, PALETTE.WHITE);
      r.text(String(m), sx, top + RUNWAY_H + 5, PALETTE.WHITE, 'center');
    }
  }

  /** The javelin stuck in the grass, wobbling for a moment. */
  private drawStuckJavelin(r: Renderer, at: (x: number, h: number) => { sx: number; sy: number }): void {
    const t = this.phaseTimer;
    const fade = Math.max(0, 1 - t / JAVELIN.WOBBLE_TIME);
    const angle = this.landingHeading + JAVELIN.WOBBLE_DEGREES * Math.sin(t * JAVELIN.WOBBLE_SPEED) * fade;
    const tip = at(this.flight.x, 0);
    const rad = (angle * Math.PI) / 180;
    // The tip is buried slightly; draw the javelin back from it.
    const tipX = tip.sx;
    const tipY = tip.sy + 2;
    const centreX = tipX - Math.cos(rad) * HALF_LENGTH;
    const centreY = tipY + Math.sin(rad) * HALF_LENGTH;
    drawJavelin(r, centreX, centreY, angle);
    // A little marker flag beside it.
    r.rect(tipX + 2, tip.sy - 10, 1, 10, PALETTE.WHITE);
    r.rect(tipX + 3, tip.sy - 10, 5, 3, PALETTE.RED);
  }

  private pose(): Pose {
    switch (this.phase) {
      case 'flight':
        return 'throw';
      case 'landed':
        return this.runner.speed > 0 ? 'throw' : 'stand';
      case 'runup':
      case 'hold':
        return this.runner.speed > 0 ? this.runPose() : 'stand';
      default:
        return 'stand';
    }
  }
}

/** A javelin centred on (cx, cy), pointing `angle` degrees above horizontal. */
function drawJavelin(r: Renderer, cx: number, cy: number, angle: number): void {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) * HALF_LENGTH;
  const dy = -Math.sin(rad) * HALF_LENGTH;
  // A dark shadow line underneath keeps it visible against the busy crowd.
  r.line(cx - dx, cy - dy + 1, cx + dx, cy + dy + 1, PALETTE.INK);
  r.line(cx - dx, cy - dy, cx + dx, cy + dy, PALETTE.WHITE); // shaft
  r.line(cx + dx * 0.7, cy + dy * 0.7, cx + dx, cy + dy, PALETTE.YELLOW); // metal tip
  r.line(cx - dx * 0.15, cy - dy * 0.15, cx + dx * 0.15, cy + dy * 0.15, PALETTE.RED); // grip
}

// Layout in screen pixels (drawing only).
const RUNWAY_TOP = 136;
const RUNWAY_H = 12;
export const GROUND_Y = RUNWAY_TOP + 9; // where the athlete's feet touch
const HALF_LENGTH = 12; // px, half the drawn javelin
const CARRY_ANGLE = 10; // degrees, javelin held over the shoulder during the run-up
const MARK_DELAY = 0.4; // s after landing before the distance is shown
const FIRST_FIELD_LINE = 20; // m
const LAST_FIELD_LINE = 110; // m
const FIELD_LINE_EVERY = 10; // m
