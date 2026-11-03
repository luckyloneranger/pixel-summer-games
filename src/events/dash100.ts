import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Rng } from '../core/rng';
import { ANIMATION, DASH100, RUNNER } from '../game/tuning';
import { LAYOUT, Stadium, TRACK_BOTTOM } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import type { Look } from '../gfx/sprite';
import { ATHLETE_H, ATHLETE_W, AthleteSprites, RUN_CYCLE, makeLook, type Pose } from '../gfx/sprites/athlete';
import { drawScoreboard } from '../ui/hud';
import { CPU_ATHLETES, CpuTapper } from './cpu';
import type { AthleticsEvent, EventContext, EventResult } from './event';
import { TapRunner, applyRunPresses } from './tap-runner';

/** Where the race is up to. */
export type DashPhase = 'marks' | 'set' | 'running' | 'finished' | 'falseStart' | 'disqualified';

/** One lane: a human or CPU athlete and how their race went. */
export interface Lane {
  laneNumber: number; // 1 = top lane
  name: string;
  look: Look;
  runner: TapRunner;
  cpu: CpuTapper | null; // null = human player
  playerIndex: number; // -1 for CPUs
  disqualified: boolean;
  finishTime: number | null; // s after GO
  reactionTime: number | null; // s after GO
}

export const PLAYER_LANE = 2; // the human runs in lane 2
const MESSAGE_Y = 36; // px, big messages under the scoreboard

/**
 * 100 m dash: one player and three CPU runners.
 * update() holds all the rules; render() only draws the current state.
 */
export class Dash100Event implements AthleticsEvent {
  readonly id = 'dash100';
  readonly name = '100 M DASH';
  readonly kind = 'race';
  readonly attempts = 1;

  phase: DashPhase = 'marks';
  lanes: Lane[] = [];
  falseStarts = 0;
  /** Seconds since GO. */
  raceTime = 0;
  /** Seconds since the event started (drives animations). */
  clock = 0;

  private ctx!: EventContext;
  private rng!: Rng;
  private phaseTimer = 0; // s spent in the current phase
  private setWait = 0; // s, random gap between SET and GO for this start
  private readonly stadium = new Stadium();
  private readonly sprites = new Map<Lane, AthleteSprites>();

  init(ctx: EventContext): void {
    this.ctx = ctx;
    this.rng = ctx.rng;
    this.falseStarts = 0;
    this.clock = 0;
    const cpus = [...CPU_ATHLETES];
    this.lanes = [1, 2, 3, 4].map((laneNumber) => {
      const human = laneNumber === PLAYER_LANE;
      const cpu = human ? null : cpus.shift()!;
      return {
        laneNumber,
        name: human ? ctx.players[0].initials : cpu!.name,
        look: human ? makeLook('red', 'light', PALETTE.BROWN) : cpu!.look,
        runner: new TapRunner(RUNNER),
        cpu: null,
        playerIndex: human ? 0 : -1,
        disqualified: false,
        finishTime: null,
        reactionTime: null,
      };
    });
    this.sprites.clear();
    this.restartStart();
  }

  /** The human player's lane. */
  get player(): Lane {
    return this.lanes.find((l) => l.playerIndex === 0)!;
  }

  /** The human player's runner (handy for HUD and tests). */
  get runner(): TapRunner {
    return this.player.runner;
  }

  /** Everyone back to the blocks (at the start and after a false start). */
  private restartStart(): void {
    for (const lane of this.lanes) {
      lane.runner.reset();
      lane.finishTime = null;
      lane.reactionTime = null;
      // Fresh CPU tap rate and reaction for every start.
      lane.cpu = lane.playerIndex === -1 ? CpuTapper.create(this.ctx.difficulty, this.rng) : null;
    }
    this.raceTime = 0;
    this.enterPhase('marks');
  }

  private enterPhase(phase: DashPhase): void {
    this.phase = phase;
    this.phaseTimer = 0;
    if (phase === 'set') this.setWait = this.rng.range(DASH100.SET_WAIT_MIN, DASH100.SET_WAIT_MAX);
  }

  /** Lanes still in the race. */
  private get racers(): Lane[] {
    return this.lanes.filter((l) => !l.disqualified);
  }

  update(dt: number, input: InputSnapshot): void {
    // In 1-player games both key sets work.
    const left = input.justPressed('P1_LEFT') || input.justPressed('P2_LEFT');
    const right = input.justPressed('P1_RIGHT') || input.justPressed('P2_RIGHT');
    this.clock += dt;
    this.phaseTimer += dt;
    const human = this.player;

    switch (this.phase) {
      case 'marks':
      case 'set':
        if ((left || right) && !human.disqualified) {
          this.falseStart(human);
          return;
        }
        if (this.phase === 'marks' && this.phaseTimer >= DASH100.MARKS_TIME) this.enterPhase('set');
        else if (this.phase === 'set' && this.phaseTimer >= this.setWait) this.enterPhase('running');
        return;

      case 'running':
        for (const lane of this.racers) this.updateRacer(lane, dt, left, right);
        this.raceTime += dt;
        if (this.racers.every((l) => l.finishTime !== null)) this.enterPhase('finished');
        return;

      case 'finished':
        for (const lane of this.lanes) lane.runner.update(dt); // coast to a stop
        return;

      case 'falseStart':
      case 'disqualified':
        if (this.phaseTimer >= DASH100.FALSE_START_TEXT_TIME) this.restartStart();
        return;
    }
  }

  private updateRacer(lane: Lane, dt: number, left: boolean, right: boolean): void {
    const r = lane.runner;
    if (lane.finishTime === null) {
      const tapped = lane.cpu
        ? lane.cpu.update(r, this.raceTime + dt)
        : applyRunPresses(r, left, right);
      // The press happened some time during this step, so count the whole step.
      if (tapped && lane.reactionTime === null) lane.reactionTime = this.raceTime + dt;
    }
    const before = r.position;
    r.update(dt);
    if (lane.finishTime === null && r.position >= DASH100.DISTANCE) {
      // Work out the exact moment within this step that the line was crossed.
      const fraction = (DASH100.DISTANCE - before) / (r.position - before);
      lane.finishTime = this.raceTime + fraction * dt;
    }
  }

  private falseStart(lane: Lane): void {
    this.falseStarts++;
    if (this.falseStarts >= DASH100.FALSE_STARTS_TO_DQ) {
      lane.disqualified = true;
      this.enterPhase('disqualified');
    } else {
      this.enterPhase('falseStart');
    }
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  /** Finishing order: fastest first, disqualified runners last. */
  standings(): Lane[] {
    return [...this.lanes].sort((a, b) => sortKey(a) - sortKey(b));
  }

  getResults(): EventResult[] {
    return this.standings().map((lane) => ({
      playerIndex: lane.playerIndex,
      name: lane.name,
      lane: lane.laneNumber,
      mark: lane.disqualified || lane.finishTime === null ? null : roundHundredths(lane.finishTime),
      foul: false,
      disqualified: lane.disqualified,
      points: 0,
      reactionTime: lane.reactionTime ?? undefined,
    }));
  }

  /** True once the human has crossed the line in first place. */
  get playerWon(): boolean {
    const p = this.player;
    if (p.finishTime === null) return false;
    return this.racers.every((l) => l === p || l.finishTime === null || l.finishTime > p.finishTime!);
  }

  debugLines(): string[] {
    const cpuRates = this.lanes
      .filter((l) => l.cpu)
      .map((l) => l.cpu!.tapRate.toFixed(1))
      .join(' ');
    return [
      `STATE ${this.phase}`,
      `SPEED ${this.runner.speed.toFixed(2)}`,
      `TAPS/S ${this.runner.tapRate}`,
      `POS   ${this.runner.position.toFixed(1)}`,
      `CPU TAPS/S ${cpuRates}`,
    ];
  }

  // ---------------------------------------------------------------- drawing

  render(r: Renderer): void {
    const ppm = DASH100.PIXELS_PER_METER;
    // Follow the player; if they're out, follow the leader instead.
    const followed = this.player.disqualified ? this.leader() : this.player;
    const cameraPx = followed.runner.position * ppm - DASH100.CAMERA_LEAD;
    const toScreen = (metres: number) => metres * ppm - cameraPx;

    const waving = this.playerWon;
    const waveFrame = waving ? Math.floor(this.clock / ANIMATION.WAVE_FRAME_TIME) % 2 : 0;
    this.stadium.drawBackground(r, cameraPx, ANIMATION.CROWD_PARALLAX, waveFrame);
    this.drawTrackMarkings(r, toScreen);

    // Top lane first, so lower lanes overlap the ones behind them.
    for (const lane of this.lanes) {
      const footY = LAYOUT.TRACK_TOP + lane.laneNumber * LAYOUT.LANE_HEIGHT - 3;
      const x = toScreen(lane.runner.position) - ATHLETE_W / 2;
      if (x < -ATHLETE_W || x > r.width) continue;
      r.image(this.spritesFor(lane).get(this.poseFor(lane)), x, footY - ATHLETE_H + 1);
    }

    const shown = this.player.finishTime ?? (this.phase === 'running' ? this.raceTime : 0);
    const note = this.falseStarts === 1 ? 'FALSE START 1' : '';
    drawScoreboard(r, this.name, this.timeText(shown), this.runner.speedFraction, note);
    this.drawMessages(r);
  }

  private leader(): Lane {
    return this.racers.reduce((a, b) => (b.runner.position > a.runner.position ? b : a));
  }

  private drawTrackMarkings(r: Renderer, toScreen: (m: number) => number): void {
    const trackH = TRACK_BOTTOM - LAYOUT.TRACK_TOP;
    // Lane numbers painted behind the start line.
    const numbersX = toScreen(-2);
    if (numbersX > -8) {
      for (const lane of this.lanes) {
        const y = LAYOUT.TRACK_TOP + (lane.laneNumber - 1) * LAYOUT.LANE_HEIGHT + 4;
        r.text(LANE_LABELS[lane.laneNumber], numbersX, y, PALETTE.WHITE, 'center');
      }
    }
    // Start line, and a marker every 10 m with a board on the grass.
    for (let m = 0; m < DASH100.DISTANCE; m += MARKER_EVERY) {
      const x = toScreen(m);
      if (x < -20 || x > r.width + 20) continue;
      r.rect(x, LAYOUT.TRACK_TOP, m === 0 ? 2 : 1, trackH, PALETTE.WHITE);
      if (m > 0) {
        r.rect(x - 9, LAYOUT.TRACK_TOP - 11, 18, 9, PALETTE.WHITE);
        r.text(MARKER_LABELS[m / MARKER_EVERY], x, LAYOUT.TRACK_TOP - 10, PALETTE.INK, 'center');
      }
    }
    // Chequered finish line.
    const fx = toScreen(DASH100.DISTANCE);
    if (fx > -10 && fx < r.width + 10) {
      for (let y = 0; y < trackH; y += 2) {
        const even = (y / 2) % 2 === 0;
        r.rect(fx, LAYOUT.TRACK_TOP + y, 2, 2, even ? PALETTE.WHITE : PALETTE.INK);
        r.rect(fx + 2, LAYOUT.TRACK_TOP + y, 2, 2, even ? PALETTE.INK : PALETTE.WHITE);
      }
      r.rect(fx - 23, LAYOUT.TRACK_TOP - 11, 50, 9, PALETTE.YELLOW);
      r.text('FINISH', fx + 2, LAYOUT.TRACK_TOP - 10, PALETTE.INK, 'center');
    }
  }

  /** Pick the animation frame from the athlete's state (drawing only). */
  private poseFor(lane: Lane): Pose {
    const runner = lane.runner;
    if (lane.disqualified) return 'stand';
    switch (this.phase) {
      case 'marks':
        return 'crouch';
      case 'set':
        return 'set';
      case 'falseStart':
      case 'disqualified':
        return 'stand';
      default:
        break;
    }
    if (runner.speed > 0) {
      const frame = Math.floor(runner.position / ANIMATION.STRIDE_PER_FRAME) % RUN_CYCLE.length;
      return RUN_CYCLE[frame];
    }
    if (lane.finishTime === null) return runner.position > 0 ? 'stand' : 'set';
    const won = this.standings()[0] === lane;
    return won ? 'celebrate' : 'stand';
  }

  private spritesFor(lane: Lane): AthleteSprites {
    let s = this.sprites.get(lane);
    if (!s) {
      s = new AthleteSprites(lane.look);
      this.sprites.set(lane, s);
    }
    return s;
  }

  private drawMessages(r: Renderer): void {
    const cx = r.width / 2;
    const y = MESSAGE_Y;
    // Dark band so messages stay readable over the busy crowd.
    const hasMessage = this.phase !== 'running' || this.raceTime < DASH100.GO_TEXT_TIME;
    if (hasMessage && !(this.phase === 'finished' && this.player.disqualified)) {
      r.rect(0, y - 4, r.width, 36, PALETTE.INK);
    }
    switch (this.phase) {
      case 'marks':
        r.text('ON YOUR MARKS', cx, y, PALETTE.WHITE, 'center', 2);
        if (!this.player.disqualified) {
          r.text('ALTERNATE A + D TO RUN', cx, y + 22, PALETTE.YELLOW, 'center');
        }
        break;
      case 'set':
        r.text('SET', cx, y, PALETTE.YELLOW, 'center', 2);
        break;
      case 'running':
        if (this.raceTime < DASH100.GO_TEXT_TIME) r.text('GO!', cx, y, PALETTE.GREEN, 'center', 2);
        break;
      case 'falseStart':
        r.text('FALSE START', cx, y, PALETTE.RED, 'center', 2);
        r.text('ONE MORE AND YOU ARE OUT', cx, y + 22, PALETTE.WHITE, 'center');
        break;
      case 'disqualified':
        r.text('DISQUALIFIED', cx, y, PALETTE.RED, 'center', 2);
        r.text('TWO FALSE STARTS', cx, y + 22, PALETTE.WHITE, 'center');
        break;
      case 'finished': {
        const p = this.player;
        if (p.disqualified) break;
        const place = this.standings().indexOf(p);
        r.text(PLACE_LABELS[place], cx, y, place === 0 ? PALETTE.YELLOW : PALETTE.WHITE, 'center', 2);
        r.text(`TIME ${this.timeText(p.finishTime ?? 0)}`, cx, y + 22, PALETTE.WHITE, 'center');
        break;
      }
    }
  }

  // Re-format the timer only when the hundredths change, to avoid garbage every frame.
  private lastHundredths = -1;
  private lastTimeText = '';
  private timeText(seconds: number): string {
    const h = Math.round(seconds * 100);
    if (h !== this.lastHundredths) {
      this.lastHundredths = h;
      this.lastTimeText = (h / 100).toFixed(2);
    }
    return this.lastTimeText;
  }
}

function sortKey(lane: Lane): number {
  if (lane.disqualified) return Infinity;
  return lane.finishTime ?? Number.MAX_VALUE;
}

/** Times are kept to 0.01 s. */
export function roundHundredths(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

const MARKER_EVERY = 10; // m between distance markers
const MARKER_LABELS = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90'];
const LANE_LABELS = ['', '1', '2', '3', '4'];
export const PLACE_LABELS = ['1ST', '2ND', '3RD', '4TH'];
