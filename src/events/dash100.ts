import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Rng } from '../core/rng';
import { DASH100, RUNNER } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import type { AthleticsEvent, EventContext, EventResult } from './event';
import { TapRunner, applyRunPresses } from './tap-runner';

/** Where the race is up to. */
export type DashPhase = 'marks' | 'set' | 'running' | 'finished' | 'falseStart' | 'disqualified';

/**
 * 100 m dash, Phase 1 version: one player, plain boxes.
 * update() holds all the rules; render() only draws the current state.
 */
export class Dash100Event implements AthleticsEvent {
  readonly id = 'dash100';
  readonly name = '100 M DASH';
  readonly kind = 'race';
  readonly attempts = 1;

  readonly runner = new TapRunner(RUNNER);
  phase: DashPhase = 'marks';
  falseStarts = 0;
  /** Seconds since GO. */
  raceTime = 0;
  finishTime: number | null = null;
  reactionTime: number | null = null;

  private rng!: Rng;
  private phaseTimer = 0; // s spent in the current phase
  private setWait = 0; // s, random gap between SET and GO for this start

  init(ctx: EventContext): void {
    this.rng = ctx.rng;
    this.falseStarts = 0;
    this.restartStart();
  }

  /** Back to the blocks (used at the start and after a false start). */
  private restartStart(): void {
    this.runner.reset();
    this.raceTime = 0;
    this.finishTime = null;
    this.reactionTime = null;
    this.enterPhase('marks');
  }

  private enterPhase(phase: DashPhase): void {
    this.phase = phase;
    this.phaseTimer = 0;
    if (phase === 'set') this.setWait = this.rng.range(DASH100.SET_WAIT_MIN, DASH100.SET_WAIT_MAX);
  }

  update(dt: number, input: InputSnapshot): void {
    // In 1-player games both key sets work.
    const left = input.justPressed('P1_LEFT') || input.justPressed('P2_LEFT');
    const right = input.justPressed('P1_RIGHT') || input.justPressed('P2_RIGHT');
    this.phaseTimer += dt;

    switch (this.phase) {
      case 'marks':
      case 'set':
        if (left || right) {
          this.falseStart();
          return;
        }
        if (this.phase === 'marks' && this.phaseTimer >= DASH100.MARKS_TIME) this.enterPhase('set');
        else if (this.phase === 'set' && this.phaseTimer >= this.setWait) this.enterPhase('running');
        return;

      case 'running': {
        const tapped = applyRunPresses(this.runner, left, right);
        // The press happened some time during this step, so count the whole step.
        if (tapped && this.reactionTime === null) this.reactionTime = this.raceTime + dt;
        const before = this.runner.position;
        this.runner.update(dt);
        const after = this.runner.position;
        if (after >= DASH100.DISTANCE) {
          // Work out the exact moment within this step that the line was crossed.
          const fraction = (DASH100.DISTANCE - before) / (after - before);
          this.finishTime = this.raceTime + fraction * dt;
          this.enterPhase('finished');
        }
        this.raceTime += dt;
        return;
      }

      case 'finished':
        this.runner.update(dt); // coast to a stop past the line
        return;

      case 'falseStart':
        if (this.phaseTimer >= DASH100.FALSE_START_TEXT_TIME) this.restartStart();
        return;

      case 'disqualified':
        return;
    }
  }

  private falseStart(): void {
    this.falseStarts++;
    this.enterPhase(this.falseStarts >= DASH100.FALSE_STARTS_TO_DQ ? 'disqualified' : 'falseStart');
  }

  isFinished(): boolean {
    return this.phase === 'finished' || this.phase === 'disqualified';
  }

  getResults(): EventResult[] {
    const dq = this.phase === 'disqualified';
    return [
      {
        playerIndex: 0,
        mark: dq || this.finishTime === null ? null : roundHundredths(this.finishTime),
        foul: false,
        disqualified: dq,
        points: 0,
        reactionTime: this.reactionTime ?? undefined,
      },
    ];
  }

  debugLines(): string[] {
    return [
      `STATE ${this.phase}`,
      `SPEED ${this.runner.speed.toFixed(2)}`,
      `TAPS/S ${this.runner.tapRate}`,
      `POS   ${this.runner.position.toFixed(1)}`,
    ];
  }

  // ---------------------------------------------------------------- drawing

  render(r: Renderer): void {
    const ppm = DASH100.PIXELS_PER_METER;
    // Camera: keep the runner CAMERA_LEAD px from the left so you see the track ahead.
    const camX = this.runner.position - DASH100.CAMERA_LEAD / ppm;
    const toScreen = (metres: number) => (metres - camX) * ppm;

    // Background: stand-in crowd, grass, track and lanes.
    r.clear(PALETTE.NAVY);
    r.rect(0, TRACK_TOP - 12, r.width, 12, PALETTE.GREEN);
    r.rect(0, TRACK_TOP, r.width, LANE_HEIGHT * LANES, PALETTE.ORANGE);
    r.rect(0, TRACK_TOP + LANE_HEIGHT * LANES, r.width, r.height, PALETTE.GREEN);
    for (let i = 0; i <= LANES; i++) r.rect(0, TRACK_TOP + i * LANE_HEIGHT, r.width, 1, PALETTE.WHITE);

    // Distance markers every 10 m, start line and chequered finish line.
    for (let m = 0; m < DASH100.DISTANCE; m += MARKER_EVERY) {
      const x = toScreen(m);
      if (x < -20 || x > r.width + 20) continue;
      r.rect(x, TRACK_TOP, m === 0 ? 2 : 1, LANE_HEIGHT * LANES, PALETTE.WHITE);
      if (m > 0) r.text(MARKER_LABELS[m / MARKER_EVERY], x, TRACK_TOP - 10, PALETTE.WHITE, 'center');
    }
    const finishX = toScreen(DASH100.DISTANCE);
    if (finishX > -10 && finishX < r.width + 10) {
      for (let y = 0; y < LANE_HEIGHT * LANES; y += 2) {
        r.rect(finishX, TRACK_TOP + y, 2, 1, (y / 2) % 2 === 0 ? PALETTE.WHITE : PALETTE.BLACK);
        r.rect(finishX + 2, TRACK_TOP + y, 2, 1, (y / 2) % 2 === 0 ? PALETTE.BLACK : PALETTE.WHITE);
      }
      r.text('FINISH', finishX, TRACK_TOP - 10, PALETTE.YELLOW, 'center');
    }

    this.drawRunner(r, toScreen(this.runner.position));
    this.drawScoreboard(r);
    this.drawMessages(r);
  }

  /** A box athlete: body plus two legs that swap on every valid tap. */
  private drawRunner(r: Renderer, footX: number): void {
    const groundY = TRACK_TOP + LANE_HEIGHT * (PLAYER_LANE + 1) - 2;
    const moving = this.runner.speed > 0;
    const stride = this.runner.taps % 2 === 0;
    const bob = moving && stride ? 1 : 0;
    const bodyX = footX - 4;
    r.rect(bodyX, groundY - 18 - bob, 8, 12, PALETTE.RED); // body
    r.rect(bodyX + 2, groundY - 23 - bob, 4, 4, PALETTE.WHITE); // head
    const reach = moving ? 3 : 0;
    r.rect(bodyX + 1 + (stride ? reach : -reach), groundY - 6, 2, 6, PALETTE.WHITE); // leg A
    r.rect(bodyX + 5 + (stride ? -reach : reach), groundY - 6, 2, 6, PALETTE.WHITE); // leg B
  }

  /** Top panel: event name, timer and speed meter. */
  private drawScoreboard(r: Renderer): void {
    r.rect(0, 0, r.width, 24, PALETTE.BLACK);
    r.text(this.name, 4, 3, PALETTE.WHITE);
    const shown = this.finishTime ?? (this.phase === 'running' ? this.raceTime : 0);
    r.text(this.timeText(shown), r.width - 4, 3, PALETTE.YELLOW, 'right');

    r.text('SPEED', 4, 14, PALETTE.GREY);
    const meterX = 48;
    const meterW = 100;
    r.rect(meterX - 1, 13, meterW + 2, 9, PALETTE.GREY);
    r.rect(meterX, 14, meterW, 7, PALETTE.NIGHT);
    const fill = Math.round(meterW * this.runner.speedFraction);
    r.rect(meterX, 14, fill, 7, this.runner.speedFraction > 0.9 ? PALETTE.GREEN : PALETTE.YELLOW);

    if (this.falseStarts > 0 && this.phase !== 'disqualified') {
      r.text('FALSE START 1', r.width - 4, 14, PALETTE.RED, 'right');
    }
  }

  private drawMessages(r: Renderer): void {
    const cx = r.width / 2;
    switch (this.phase) {
      case 'marks':
        r.text('ON YOUR MARKS', cx, 44, PALETTE.WHITE, 'center', 2);
        r.text('ALTERNATE A + D TO RUN', cx, 68, PALETTE.GREY, 'center');
        break;
      case 'set':
        r.text('SET', cx, 44, PALETTE.YELLOW, 'center', 2);
        break;
      case 'running':
        if (this.raceTime < DASH100.GO_TEXT_TIME) r.text('GO!', cx, 44, PALETTE.GREEN, 'center', 2);
        break;
      case 'falseStart':
        r.text('FALSE START', cx, 44, PALETTE.RED, 'center', 2);
        r.text('ONE MORE AND YOU ARE OUT', cx, 68, PALETTE.WHITE, 'center');
        break;
      case 'disqualified':
        r.text('DISQUALIFIED', cx, 44, PALETTE.RED, 'center', 2);
        r.text('TWO FALSE STARTS', cx, 68, PALETTE.WHITE, 'center');
        break;
      case 'finished':
        r.text(`TIME ${this.timeText(this.finishTime ?? 0)}`, cx, 40, PALETTE.YELLOW, 'center', 2);
        r.text(`REACTION ${(this.reactionTime ?? 0).toFixed(2)} S`, cx, 62, PALETTE.WHITE, 'center');
        break;
    }
  }

  // Re-format the timer only when the hundredths change, to avoid garbage every frame.
  private lastHundredths = -1;
  private lastTimeText = '';
  private timeText(seconds: number): string {
    const h = Math.floor(seconds * 100 + 1e-6);
    if (h !== this.lastHundredths) {
      this.lastHundredths = h;
      this.lastTimeText = `${(h / 100).toFixed(2)}`;
    }
    return this.lastTimeText;
  }
}

/** Times are kept to 0.01 s. */
export function roundHundredths(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

// Track layout in screen pixels. These are drawing positions, not gameplay values.
const TRACK_TOP = 116;
const LANE_HEIGHT = 14;
const LANES = 4;
const PLAYER_LANE = 1; // 0 = top lane
const MARKER_EVERY = 10; // m between distance markers
const MARKER_LABELS = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
