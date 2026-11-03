import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Rng } from '../core/rng';
import { ANIMATION, RACE_START, RUNNER } from '../game/tuning';
import { LAYOUT, Stadium, TRACK_BOTTOM } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import type { Look } from '../gfx/sprite';
import { ATHLETE_H, ATHLETE_W, AthleteSprites, RUN_CYCLE, type Pose } from '../gfx/sprites/athlete';
import { drawScoreboard } from '../ui/hud';
import { CpuTapper, cpuLineup, playerLook } from './cpu';
import { SILENT, type AthleticsEvent, type EventContext, type EventId, type EventResult, type SoundSink } from './event';
import { Footsteps, runningCrowd } from './footsteps';
import { keysFor, type PlayerKeys } from './player-input';
import { DustPuffs, DustTrail } from '../gfx/effects';
import { EFFECTS } from '../game/tuning';
import { AUDIO } from '../game/tuning';
import { TapRunner, applyRunPresses } from './tap-runner';

/** Where the race is up to. */
export type RacePhase = 'marks' | 'set' | 'running' | 'finished' | 'falseStart' | 'disqualified';

/** One lane: a human or CPU athlete and how their race went. */
export interface Lane {
  laneNumber: number; // 1 = top lane
  name: string;
  look: Look;
  runner: TapRunner;
  cpu: CpuTapper | null; // null = human player
  playerIndex: number; // -1 for CPUs
  disqualified: boolean;
  falseStarts: number; // this athlete's false starts so far
  finishTime: number | null; // s after GO
  dnf: boolean; // stopped before the line: did not finish
  stoppedFor: number; // s standing still after everyone else finished
  reactionTime: number | null; // s after GO
}

/** The numbers each race needs (see tuning.ts). */
export interface RaceConfig {
  DISTANCE: number; // m
  PIXELS_PER_METER: number;
  CAMERA_LEAD: number; // px
}

export const PLAYER_LANE = 2; // player 1 runs in lane 2
export const PLAYER2_LANE = 3; // player 2 runs in lane 3
const MESSAGE_Y = 36; // px, big messages under the scoreboard
const MARKER_EVERY = 10; // m between distance markers
const LANE_LABELS = ['', '1', '2', '3', '4'];
export const PLACE_LABELS = ['1ST', '2ND', '3RD', '4TH'];

/**
 * Shared rules for sprint races: 4 lanes (player in lane 2, three CPUs),
 * ON YOUR MARKS / SET / random wait / GO, false starts, finish times and
 * results. Subclasses can add per-lane state and hooks (the hurdles do).
 */
export abstract class RaceEvent<L extends Lane = Lane> implements AthleticsEvent {
  abstract readonly id: EventId;
  abstract readonly name: string;
  readonly kind = 'race';
  readonly attempts = 1;

  phase: RacePhase = 'marks';
  lanes: L[] = [];
  /** The athlete whose false start is on screen. */
  falseStarter: L | null = null;
  /** Seconds left of the photo-finish freeze (0 = none). */
  photoFinish = 0;
  private photoShown = false;
  private humanList: L[] = [];
  private racerList: L[] = [];
  private readonly dust = new DustPuffs();
  private readonly trails = new Map<Lane, DustTrail>();
  private winnerNow: L | null = null; // first place, worked out once per frame for drawing
  /** Seconds since GO. */
  raceTime = 0;
  /** Seconds since the event started (drives animations). */
  clock = 0;

  protected ctx!: EventContext;
  protected sound: SoundSink = SILENT;
  private readonly footsteps = new Map<Lane, Footsteps>();
  protected rng!: Rng;
  protected phaseTimer = 0; // s spent in the current phase
  private setWait = 0; // s, random gap between SET and GO for this start
  protected readonly stadium = new Stadium();
  private readonly sprites = new Map<Lane, AthleteSprites>();
  private readonly markerLabels: string[];

  constructor(protected readonly cfg: RaceConfig) {
    this.markerLabels = [];
    for (let m = 0; m < cfg.DISTANCE; m += MARKER_EVERY) this.markerLabels.push(String(m));
  }

  // ------------------------------------------------ hooks for subclasses

  /** Add event-specific state to a new lane. */
  protected abstract createLane(base: Lane): L;
  /** Reset event-specific lane state for a fresh start. */
  protected resetLane(_lane: L): void {}
  /** Before moving this step (e.g. start a jump). */
  protected beforeMove(_lane: L, _dt: number, _actionPressed: boolean): void {}
  /** Can this lane's runner gain speed from taps right now? */
  protected canTap(_lane: L): boolean {
    return true;
  }
  /** After moving this step, from `before` m to the runner's new position. */
  protected afterMove(_lane: L, _dt: number, _before: number): void {}
  /** Draw extra things in a lane before its athlete (e.g. hurdles). */
  protected drawLaneProps(_r: Renderer, _lane: L, _toScreen: (m: number) => number, _footY: number): void {}
  /** Pixels the athlete is lifted off the track (jumps). */
  protected liftFor(_lane: L): number {
    return 0;
  }
  /** The control hint shown under ON YOUR MARKS. */
  protected startHint = 'ALTERNATE A + D TO RUN';
  protected startHint2P = 'P1: A + D    P2: LEFT + RIGHT';

  // ------------------------------------------------ rules

  init(ctx: EventContext): void {
    this.ctx = ctx;
    this.rng = ctx.rng;
    this.sound = ctx.sound ?? SILENT;
    this.clock = 0;
    this.falseStarter = null;
    // Player 1 in lane 2, player 2 (if any) in lane 3, CPUs in the rest.
    const humanLanes = [PLAYER_LANE, PLAYER2_LANE];
    const cpus = cpuLineup(ctx.players.map((p) => p.team), 4 - ctx.players.length);
    this.lanes = [1, 2, 3, 4].map((laneNumber) => {
      const slot = humanLanes.indexOf(laneNumber);
      const human = slot >= 0 ? ctx.players[slot] : undefined;
      const cpu = human ? null : cpus.shift()!;
      return this.createLane({
        laneNumber,
        name: human ? human.initials : cpu!.name,
        look: human ? playerLook(human.team) : cpu!.look,
        runner: new TapRunner(RUNNER),
        cpu: null,
        playerIndex: human ? (human.index ?? slot) : -1,
        disqualified: false,
        falseStarts: 0,
        finishTime: null,
        dnf: false,
        stoppedFor: 0,
        reactionTime: null,
      });
    });
    this.humanList = this.lanes.filter((l) => l.playerIndex >= 0);
    this.racerList = [...this.lanes];
    this.trails.clear();
    for (const lane of this.lanes) this.trails.set(lane, new DustTrail());
    this.footsteps.clear();
    for (const lane of this.humans) this.footsteps.set(lane, new Footsteps());
    this.sprites.clear();
    this.restartStart();
  }

  /** The human lanes (none in a demo race, one or two otherwise). */
  get humans(): L[] {
    return this.humanList;
  }

  /** True for the attract-mode demo: CPUs only. */
  get demo(): boolean {
    return this.humanList.length === 0;
  }

  /** The first human's lane (player 1); in a demo, the lane-2 CPU stands in. */
  get player(): L {
    return this.humanList[0] ?? this.lanes[PLAYER_LANE - 1];
  }

  /** Player 1's false starts (handy for tests and the 1-player HUD). */
  get falseStarts(): number {
    return this.player.falseStarts;
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
      lane.dnf = false;
      lane.stoppedFor = 0;
      lane.reactionTime = null;
      this.trails.get(lane)?.reset();
      // Fresh CPU tap rate and reaction for every start.
      lane.cpu = lane.playerIndex === -1 ? CpuTapper.create(this.ctx.difficulty, this.rng) : null;
      this.resetLane(lane);
    }
    this.raceTime = 0;
    this.photoFinish = 0;
    this.photoShown = false;
    this.dust.clear();
    for (const f of this.footsteps.values()) f.reset();
    this.enterPhase('marks');
  }

  private enterPhase(phase: RacePhase): void {
    this.phase = phase;
    this.phaseTimer = 0;
    if (phase === 'set') this.setWait = this.rng.range(RACE_START.SET_WAIT_MIN, RACE_START.SET_WAIT_MAX);
    if (phase === 'running') this.sound.play('pistol');
    if (phase === 'falseStart' || phase === 'disqualified') this.sound.play('buzzer');
  }

  /** Lanes still in the race (not disqualified). */
  protected get racers(): L[] {
    return this.racerList;
  }

  /** Each human's keys this step (both key sets for a lone human). */
  private keysOf(input: InputSnapshot, lane: L): PlayerKeys {
    return keysFor(input, lane.playerIndex, this.humans.length === 1);
  }

  update(dt: number, input: InputSnapshot): void {
    this.clock += dt;
    this.phaseTimer += dt;
    this.dust.update(dt);
    // Photo finish: everything freezes on the line for a moment.
    if (this.photoFinish > 0) {
      this.photoFinish = Math.max(0, this.photoFinish - dt);
      return;
    }

    switch (this.phase) {
      case 'marks':
      case 'set':
        for (const lane of this.humans) {
          if (lane.disqualified) continue;
          const k = this.keysOf(input, lane);
          if (k.left || k.right) {
            this.falseStart(lane);
            return;
          }
        }
        if (this.phase === 'marks' && this.phaseTimer >= RACE_START.MARKS_TIME) this.enterPhase('set');
        else if (this.phase === 'set' && this.phaseTimer >= this.setWait) this.enterPhase('running');
        return;

      case 'running':
        for (const lane of this.racers) {
          const k: PlayerKeys = lane.cpu ? NO_KEYS : this.keysOf(input, lane);
          this.updateRacer(lane, dt, k);
        }
        this.raceTime += dt;
        this.checkDidNotFinish(dt);
        this.checkPhotoFinish();
        if (this.racers.every((l) => l.finishTime !== null || l.dnf)) this.enterPhase('finished');
        return;

      case 'finished':
        for (const lane of this.lanes) lane.runner.update(dt); // coast to a stop
        return;

      case 'falseStart':
      case 'disqualified':
        if (this.phaseTimer >= RACE_START.FALSE_START_TEXT_TIME) this.restartStart();
        return;
    }
  }

  private updateRacer(lane: L, dt: number, keys: PlayerKeys): void {
    const { left, right, action } = keys;
    const r = lane.runner;
    const racing = lane.finishTime === null;
    if (racing) this.beforeMove(lane, dt, lane.cpu ? false : action);
    if (racing) {
      const sinceGo = this.raceTime + dt;
      const allowed = this.canTap(lane);
      // A player's presses always keep their left/right rhythm; they only add speed when allowed.
      let tapped = lane.cpu
        ? lane.cpu.update(r, sinceGo, allowed)
        : applyRunPresses(r, left, right, allowed);
      // Assist run: holding a run key builds speed (only when taps could).
      if (!lane.cpu && this.ctx.assist && keys.runHeld && allowed && r.assist(dt)) tapped = true;
      // The press happened some time during this step, so count the whole step.
      if (tapped && lane.reactionTime === null) lane.reactionTime = sinceGo;
    }
    const before = r.position;
    r.update(dt);
    if (racing) this.afterMove(lane, dt, before);
    if (racing) this.footsteps.get(lane)?.update(r, this.sound);
    if (this.trails.get(lane)?.due(r.position, r.speedFraction)) this.dust.add(r.position - 0.4, laneFootY(lane.laneNumber));
    if (lane.finishTime === null && r.position >= this.cfg.DISTANCE) {
      // Work out the exact moment within this step that the line was crossed.
      const fraction = (this.cfg.DISTANCE - before) / (r.position - before);
      lane.finishTime = this.raceTime + fraction * dt;
      if (lane.playerIndex >= 0) this.sound.play('cheer', this.won(lane) ? 1 : 0.4);
    }
  }

  /**
   * A human who stops running after everyone else has finished would hold the
   * race up forever, so after a few seconds standing still they did not finish.
   */
  private checkDidNotFinish(dt: number): void {
    for (const lane of this.humanList) {
      if (lane.disqualified || lane.finishTime !== null || lane.dnf) continue;
      const othersDone = this.racerList.every((l) => l === lane || l.finishTime !== null || l.dnf);
      lane.stoppedFor = othersDone && lane.runner.speed === 0 ? lane.stoppedFor + dt : 0;
      if (lane.stoppedFor >= EFFECTS.DNF_STOP_TIME) lane.dnf = true;
    }
  }

  /** When the top two cross within a whisker of each other, freeze for a photo finish. */
  private checkPhotoFinish(): void {
    if (this.photoShown) return;
    let first: number | null = null;
    let second: number | null = null;
    for (const l of this.racerList) {
      const t = l.finishTime;
      if (t === null) continue;
      if (first === null || t < first) {
        second = first;
        first = t;
      } else if (second === null || t < second) {
        second = t;
      }
    }
    if (first === null || second === null) return;
    this.photoShown = true; // only the first two finishers can make it a photo finish
    if (second - first <= EFFECTS.PHOTO_FINISH_GAP) this.photoFinish = EFFECTS.PHOTO_FINISH_TIME;
  }

  private falseStart(lane: L): void {
    lane.falseStarts++;
    this.falseStarter = lane;
    if (lane.falseStarts >= RACE_START.FALSE_STARTS_TO_DQ) {
      lane.disqualified = true;
      this.racerList = this.lanes.filter((l) => !l.disqualified);
      this.enterPhase('disqualified');
    } else {
      this.enterPhase('falseStart');
    }
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  /** Finishing order: fastest first, disqualified runners last. */
  standings(): L[] {
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
      dnf: lane.dnf || undefined,
    }));
  }

  /** True once this lane has crossed the line ahead of everyone so far. */
  private won(lane: L): boolean {
    if (lane.finishTime === null) return false;
    return this.racers.every((l) => l === lane || l.finishTime === null || l.finishTime > lane.finishTime!);
  }

  /** True once a human has crossed the line in first place. */
  get playerWon(): boolean {
    return this.humans.some((l) => this.won(l));
  }

  crowdLevel(): number {
    switch (this.phase) {
      case 'marks':
      case 'set':
        return AUDIO.CROWD_HUSH; // the crowd goes quiet for the start
      case 'running':
        return runningCrowd(this.fastestHumanSpeed());
      default:
        return AUDIO.CROWD_IDLE;
    }
  }

  private fastestHumanSpeed(): number {
    let best = 0;
    for (const l of this.humanList) best = Math.max(best, l.runner.speedFraction);
    return best;
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
    const ppm = this.cfg.PIXELS_PER_METER;
    // Follow the leading human; if both are out (or it's a demo), follow the race leader.
    let followed: L | null = null;
    for (const l of this.humanList) {
      if (!l.disqualified && (!followed || l.runner.position > followed.runner.position)) followed = l;
    }
    followed ??= this.leader();
    this.winnerNow = this.phase === 'finished' ? this.standings()[0] : null;
    const cameraPx = followed.runner.position * ppm - this.cfg.CAMERA_LEAD;
    const toScreen = (metres: number) => metres * ppm - cameraPx;

    const waveFrame = this.playerWon ? Math.floor(this.clock / ANIMATION.WAVE_FRAME_TIME) % 2 : 0;
    this.stadium.drawBackground(r, cameraPx, ANIMATION.CROWD_PARALLAX, waveFrame);
    this.drawTrackMarkings(r, toScreen);
    this.dust.render(r, toScreen);

    // Top lane first, so lower lanes overlap the ones behind them.
    for (const lane of this.lanes) {
      const footY = LAYOUT.TRACK_TOP + lane.laneNumber * LAYOUT.LANE_HEIGHT - 3;
      this.drawLaneProps(r, lane, toScreen, footY);
      const x = toScreen(lane.runner.position) - ATHLETE_W / 2;
      if (x < -ATHLETE_W && lane.playerIndex >= 0 && !lane.disqualified) {
        // A human left behind the camera: show where they are.
        r.rect(0, footY - 18, lane.name.length * 8 + 12, 10, PALETTE.INK);
        r.text(`<${lane.name}`, 2, footY - 17, PALETTE.YELLOW);
        continue;
      }
      if (x < -ATHLETE_W || x > r.width) continue;
      const y = footY - ATHLETE_H + 1 - this.liftFor(lane);
      r.image(this.spritesFor(lane).get(this.poseFor(lane)), x, y);
    }

    const shown = this.player.finishTime ?? (this.phase === 'running' ? this.raceTime : 0);
    const humans = this.humans;
    if (humans.length <= 1) {
      const note = this.player.falseStarts === 1 ? 'FALSE START 1' : '';
      drawScoreboard(r, this.name, this.timeText(shown), this.runner.speedFraction, note);
    } else {
      drawScoreboard(r, this.name, this.timeText(shown), humans.map((l) => ({ label: l.name, fraction: l.runner.speedFraction })));
    }
    this.drawMessages(r);
  }

  private leader(): L {
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
    for (let m = 0; m < this.cfg.DISTANCE; m += MARKER_EVERY) {
      const x = toScreen(m);
      if (x < -20 || x > r.width + 20) continue;
      r.rect(x, LAYOUT.TRACK_TOP, m === 0 ? 2 : 1, trackH, PALETTE.WHITE);
      if (m > 0) {
        const label = this.markerLabels[m / MARKER_EVERY];
        const w = label.length * 8 + 2;
        r.rect(x - w / 2, LAYOUT.TRACK_TOP - 11, w, 9, PALETTE.WHITE);
        r.text(label, x, LAYOUT.TRACK_TOP - 10, PALETTE.INK, 'center');
      }
    }
    // Chequered finish line.
    const fx = toScreen(this.cfg.DISTANCE);
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
  protected poseFor(lane: L): Pose {
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
    return this.winnerNow === lane ? 'celebrate' : 'stand';
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
    if (this.photoFinish > 0) {
      r.rect(0, y - 4, r.width, 36, PALETTE.INK);
      r.text('PHOTO FINISH', cx, y + 4, PALETTE.YELLOW, 'center', 2);
      return;
    }
    const hasMessage = this.phase !== 'running' || this.raceTime < RACE_START.GO_TEXT_TIME;
    const allOut = this.humans.every((l) => l.disqualified);
    if (hasMessage && !(this.phase === 'finished' && allOut)) {
      r.rect(0, y - 4, r.width, 36, PALETTE.INK);
    }
    switch (this.phase) {
      case 'marks':
        r.text('ON YOUR MARKS', cx, y, PALETTE.WHITE, 'center', 2);
        if (!allOut) r.text(this.humans.length > 1 ? this.startHint2P : this.startHint, cx, y + 22, PALETTE.YELLOW, 'center');
        break;
      case 'set':
        r.text('SET', cx, y, PALETTE.YELLOW, 'center', 2);
        break;
      case 'running':
        if (this.raceTime < RACE_START.GO_TEXT_TIME) r.text('GO!', cx, y, PALETTE.GREEN, 'center', 2);
        break;
      case 'falseStart': {
        const who = this.humans.length > 1 && this.falseStarter ? `${this.falseStarter.name}: ` : '';
        r.text('FALSE START', cx, y, PALETTE.RED, 'center', 2);
        r.text(`${who}ONE MORE AND YOU ARE OUT`, cx, y + 22, PALETTE.WHITE, 'center');
        break;
      }
      case 'disqualified': {
        const who = this.humans.length > 1 && this.falseStarter ? `${this.falseStarter.name}: ` : '';
        r.text('DISQUALIFIED', cx, y, PALETTE.RED, 'center', 2);
        r.text(`${who}TWO FALSE STARTS`, cx, y + 22, PALETTE.WHITE, 'center');
        break;
      }
      case 'finished': {
        const standings = this.standings();
        const humans = this.humans.filter((l) => !l.disqualified);
        if (humans.length === 1 && humans[0].dnf) {
          r.text('DID NOT FINISH', cx, y, PALETTE.RED, 'center', 2);
        } else if (humans.length === 1) {
          const p = humans[0];
          const place = standings.indexOf(p);
          r.text(PLACE_LABELS[place], cx, y, place === 0 ? PALETTE.YELLOW : PALETTE.WHITE, 'center', 2);
          r.text(`TIME ${this.timeText(p.finishTime ?? 0)}`, cx, y + 22, PALETTE.WHITE, 'center');
        } else if (humans.length === 2) {
          // Two players: each one's place, side by side.
          humans.forEach((p, i) => {
            const place = standings.indexOf(p);
            const px = cx + (i === 0 ? -64 : 64);
            r.text(p.name, px, y, PALETTE.WHITE, 'center');
            r.text(PLACE_LABELS[place], px, y + 12, place === 0 ? PALETTE.YELLOW : PALETTE.WHITE, 'center', 2);
          });
        }
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

/** CPUs read no keys. */
const NO_KEYS: PlayerKeys = { left: false, right: false, action: false, actionHeld: false, runHeld: false };

/** Screen y of a lane's ground line (where feet and dust go). */
function laneFootY(laneNumber: number): number {
  return LAYOUT.TRACK_TOP + laneNumber * LAYOUT.LANE_HEIGHT - 3;
}
