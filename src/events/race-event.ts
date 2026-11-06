import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Rng } from '../core/rng';
import { ANIMATION, RACE_START, RUNNER } from '../game/tuning';
import { LAYOUT, STADIUM_THEMES, Stadium } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import type { Look } from '../gfx/sprite';
import { ATHLETE_H, ATHLETE_W, AthleteSprites, RUN_CYCLE, celebrationFor, type Pose } from '../gfx/sprites/athlete';
import { drawScoreboard } from '../ui/hud';
import { CpuTapper, cpuLineup, playerLook } from './cpu';
import { SILENT, type AthleticsEvent, type EventContext, type EventId, type EventResult, type SoundSink } from './event';
import { Footsteps, runningCrowd } from './footsteps';
import { keysFor, type PlayerKeys } from './player-input';
import type { NetLink } from './event';
import { KEYBOARD_PROMPTS, type Prompts } from '../ui/prompts';
import { GhostRecorder, ghostPosition } from '../game/ghost';
import { drawTrackMarkings } from './track-markings';
import type { RunnerState, StartPhase } from '../net/protocol';
import { NET } from '../game/tuning';
import { DustPuffs, DustTrail, drawGroundShadow, drawSpeedLines } from '../gfx/effects';
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
  remote: boolean; // online: the other player's runner, driven by their messages
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
  /** The tap model's speeds (running if not given; swimming is slower). */
  RUNNER?: typeof RUNNER;
}

export const PLAYER_LANE = 2; // player 1 runs in lane 2
export const PLAYER2_LANE = 3; // player 2 runs in lane 3
const MESSAGE_Y = 36; // px, big messages under the scoreboard
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
  protected winnerNow: L | null = null; // first place, worked out once per frame for drawing
  /** Seconds since GO. */
  raceTime = 0;
  private recorder: GhostRecorder | null = null;
  private ghostSprites: AthleteSprites | null = null;
  /** Seconds since the event started (drives animations). */
  clock = 0;

  protected ctx!: EventContext;
  /** Online link, or null for local play. */
  protected net: NetLink | null = null;
  private sendTimer = 0; // s since we last sent our runner's state
  private sentEarly = false; // guest: already told the host about an early press this start
  protected sound: SoundSink = SILENT;
  private readonly footsteps = new Map<Lane, Footsteps>();
  protected rng!: Rng;
  protected phaseTimer = 0; // s spent in the current phase
  private setWait = 0; // s, random gap between SET and GO for this start
  protected readonly stadium = new Stadium();
  private readonly sprites = new Map<Lane, AthleteSprites>();

  constructor(protected readonly cfg: RaceConfig) {
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
  /** Running events have shadows, speed lines and dust; swimming doesn't. */
  protected readonly onLand: boolean = true;

  /** The stadium and the track (swimming draws a pool instead). */
  protected drawSurface(r: Renderer, cameraPx: number, waveFrame: number, toScreen: (m: number) => number): void {
    this.stadium.drawBackground(r, cameraPx, ANIMATION.CROWD_PARALLAX, waveFrame);
    drawTrackMarkings(r, toScreen, this.cfg.DISTANCE, this.lanes.map((l) => l.laneNumber));
  }

  /** Drawn just after each athlete (swimming adds the waterline over them). */
  protected afterAthlete(_r: Renderer, _lane: L, _x: number, _footY: number): void {}

  protected drawLaneProps(_r: Renderer, _lane: L, _toScreen: (m: number) => number, _footY: number): void {}
  /** Pixels the athlete is lifted off the track (jumps). */
  protected liftFor(_lane: L): number {
    return 0;
  }
  /** Online: extra state to send for our runner (hurdles: jumps, knocked hurdles). */
  protected stateExtra(_lane: L): Partial<RunnerState> {
    return {};
  }
  /** Online: apply the other player's extra state to their lane. */
  protected applyStateExtra(_lane: L, _s: RunnerState): void {}
  /** Online: keep the other player's lane moving between messages. */
  protected advanceRemote(_lane: L, _dt: number): void {}
  /** The control hint shown under ON YOUR MARKS. */
  /** Words for the controls (keys or buttons). */
  protected get prompts(): Prompts {
    return this.ctx.prompts ?? KEYBOARD_PROMPTS;
  }

  /** Shown on the start line: how to run. */
  protected startHint(): string {
    return this.prompts.eventHint('dash100');
  }

  /** Two players on one keyboard: each one's keys. */
  protected startHint2P(): string {
    const p = this.prompts;
    return `P1: ${p.run(0)}    P2: ${p.run(1)}`;
  }

  // ------------------------------------------------ rules

  init(ctx: EventContext): void {
    this.ctx = ctx;
    this.stadium.theme = STADIUM_THEMES[this.id];
    this.rng = ctx.rng;
    this.sound = ctx.sound ?? SILENT;
    this.net = ctx.net ?? null;
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
        runner: new TapRunner(this.cfg.RUNNER ?? RUNNER),
        cpu: null,
        playerIndex: human ? (human.index ?? slot) : -1,
        disqualified: false,
        falseStarts: 0,
        remote: !!human && !!ctx.net && (human.index ?? slot) !== ctx.net.localIndex,
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
    this.recorder = this.soloOffline ? new GhostRecorder() : null; // a fresh recording every start
    this.sentEarly = false;
    this.lastLocalFinish = null;
    this.lastLocalDnf = false;
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
    // Online host: tell the guest, whose start sequence follows ours.
    if (this.net?.isHost && phase !== 'finished') {
      this.net.send({ k: 'phase', phase, who: this.falseStarter?.playerIndex });
    }
  }

  /** Does this device decide the start sequence? (Always, except an online guest.) */
  private get runsStart(): boolean {
    return !this.net || this.net.isHost;
  }

  /** Online: read the other player's messages (their runner, and the host's start calls). */
  private receiveNet(): void {
    const net = this.net;
    if (!net) return;
    const remote = this.lanes.find((l) => l.remote);
    for (const m of net.take('state')) if (remote) this.applyRemote(remote, m.s);
    if (net.isHost) {
      const early = net.take('early').length > 0;
      const starting = this.phase === 'marks' || this.phase === 'set';
      if (early && starting && remote && !remote.disqualified) this.falseStart(remote);
    } else {
      for (const m of net.take('phase')) this.followPhase(m.phase, m.who);
    }
  }

  /** Online guest: copy a start-sequence step the host made. */
  private followPhase(phase: StartPhase, who: number | undefined): void {
    switch (phase) {
      case 'marks':
        if (this.phase === 'falseStart' || this.phase === 'disqualified') this.restartStart();
        break;
      case 'set':
        if (this.phase === 'marks') this.enterPhase('set');
        break;
      case 'running':
        if (this.phase === 'marks' || this.phase === 'set') this.enterPhase('running');
        break;
      case 'falseStart':
      case 'disqualified': {
        const lane = this.humanList.find((l) => l.playerIndex === who);
        if (lane) this.falseStart(lane);
        break;
      }
    }
  }

  /** Online: set the other player's runner from their latest message. */
  private applyRemote(lane: L, s: RunnerState): void {
    const r = lane.runner;
    r.position = s.pos;
    r.speed = s.speed;
    r.taps = s.taps;
    if (s.fin !== null) lane.finishTime = s.fin;
    lane.reactionTime = s.react;
    lane.dnf = s.dnf;
    this.applyStateExtra(lane, s);
  }

  /** Online: send our runner's state every so often (and the moment it finishes). */
  private sendState(dt: number, force = false): void {
    const net = this.net;
    if (!net) return;
    this.sendTimer += dt;
    if (!force && this.sendTimer < NET.SNAPSHOT_EVERY) return;
    this.sendTimer = 0;
    const lane = this.humanList.find((l) => !l.remote);
    if (!lane) return;
    const r = lane.runner;
    net.send({
      k: 'state',
      s: {
        pos: r.position,
        speed: r.speed,
        taps: r.taps,
        fin: lane.finishTime,
        react: lane.reactionTime,
        dnf: lane.dnf,
        ...this.stateExtra(lane),
      },
    });
  }

  /** Lanes still in the race (not disqualified). */
  protected get racers(): L[] {
    return this.racerList;
  }

  /** Each human's keys this step (both key sets for a lone human, or the player on this device online). */
  private keysOf(input: InputSnapshot, lane: L): PlayerKeys {
    if (lane.remote) return NO_KEYS;
    return keysFor(input, lane.playerIndex, this.humans.length === 1 || this.net !== null);
  }

  update(dt: number, input: InputSnapshot): void {
    this.clock += dt;
    this.phaseTimer += dt;
    this.dust.update(dt);
    this.receiveNet();
    // Photo finish: everything freezes on the line for a moment.
    if (this.photoFinish > 0) {
      this.photoFinish = Math.max(0, this.photoFinish - dt);
      return;
    }

    switch (this.phase) {
      case 'marks':
      case 'set':
        for (const lane of this.humans) {
          if (lane.disqualified || lane.remote) continue;
          const k = this.keysOf(input, lane);
          if (!k.left && !k.right) continue;
          if (this.runsStart) {
            this.falseStart(lane);
            return;
          }
          // Online guest: the host rules on false starts.
          if (!this.sentEarly) this.net!.send({ k: 'early' });
          this.sentEarly = true;
        }
        if (!this.runsStart) return; // the guest waits for the host's calls
        if (this.phase === 'marks' && this.phaseTimer >= RACE_START.MARKS_TIME) this.enterPhase('set');
        else if (this.phase === 'set' && this.phaseTimer >= this.setWait) this.enterPhase('running');
        return;

      case 'running':
        for (const lane of this.racers) {
          if (lane.remote) {
            this.coastRemote(lane, dt);
            continue;
          }
          const k: PlayerKeys = lane.cpu ? NO_KEYS : this.keysOf(input, lane);
          this.updateRacer(lane, dt, k);
        }
        this.raceTime += dt;
        if (this.recorder && this.player.finishTime === null) this.recorder.sample(this.raceTime, this.player.runner.position);
        this.checkDidNotFinish(dt);
        if (!this.net) this.checkPhotoFinish(); // no freeze online: the two screens would drift apart
        this.sendState(dt, this.justFinishedLocally());
        if (this.racers.every((l) => l.finishTime !== null || l.dnf)) this.enterPhase('finished');
        return;

      case 'finished':
        for (const lane of this.lanes) if (!lane.remote) lane.runner.update(dt); // coast to a stop
        this.sendState(dt);
        return;

      case 'falseStart':
      case 'disqualified':
        if (this.runsStart && this.phaseTimer >= RACE_START.FALSE_START_TEXT_TIME) this.restartStart();
        return;
    }
  }

  /** Online: keep the other player's runner moving smoothly between their messages. */
  private coastRemote(lane: L, dt: number): void {
    const r = lane.runner;
    if (lane.finishTime === null) r.position += r.speed * dt;
    this.advanceRemote(lane, dt);
    if (this.trails.get(lane)?.due(r.position, r.speedFraction)) this.dust.add(r.position - 0.4, laneFootY(lane.laneNumber));
  }

  /** Did our own runner just finish (or drop out)? Then send that straight away. */
  private lastLocalFinish: number | null = null;
  private lastLocalDnf = false;
  private justFinishedLocally(): boolean {
    const lane = this.humanList.find((l) => !l.remote);
    if (!lane) return false;
    const changed = lane.finishTime !== this.lastLocalFinish || lane.dnf !== this.lastLocalDnf;
    this.lastLocalFinish = lane.finishTime;
    this.lastLocalDnf = lane.dnf;
    return changed;
  }

  private updateRacer(lane: L, dt: number, keys: PlayerKeys): void {
    const { left, right } = keys;
    // Both thumbs on the run pads at once counts as Action too (the hurdles' jump on a phone).
    const action = keys.action || keys.chord;
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
      if (lane.remote || lane.disqualified || lane.finishTime !== null || lane.dnf) continue;
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
      if (l.disqualified) continue;
      // Online the camera stays on your own runner; locally it follows whoever leads.
      if (this.net) {
        if (!l.remote) followed = l;
      } else if (!followed || l.runner.position > followed.runner.position) {
        followed = l;
      }
    }
    followed ??= this.leader();
    this.winnerNow = this.phase === 'finished' ? this.standings()[0] : null;
    const cameraPx = followed.runner.position * ppm - this.cfg.CAMERA_LEAD;
    const toScreen = (metres: number) => metres * ppm - cameraPx;

    const waveFrame = this.playerWon ? Math.floor(this.clock / ANIMATION.WAVE_FRAME_TIME) % 2 : 0;
    this.stadium.time = this.clock;
    this.stadium.flashes = this.playerWon && !(this.ctx.effects?.calm ?? true);
    this.drawSurface(r, cameraPx, waveFrame, toScreen);
    if (this.onLand) this.dust.render(r, toScreen);

    this.drawGhost(r, toScreen);
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
      const lift = this.liftFor(lane);
      const y = footY - ATHLETE_H + 1 - lift;
      if (this.onLand) {
        drawGroundShadow(r, x + ATHLETE_W / 2, footY, lift, PALETTE.ORANGE_DARK, 1, this.stadium.theme === 'sunset');
        if (lane.playerIndex >= 0 && this.phase === 'running') drawSpeedLines(r, x, y, lane.runner.speedFraction, this.clock);
      }
      r.image(this.spritesFor(lane).get(this.poseFor(lane)), x, y);
      this.afterAthlete(r, lane, x, footY);
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
    return this.winnerNow === lane ? celebrationFor(lane.playerIndex >= 0 ? lane.playerIndex : lane.laneNumber) : 'stand';
  }

  /** One human racing offline: record the run, and race last best's ghost. */
  private get soloOffline(): boolean {
    return this.humans.length === 1 && !this.net;
  }

  ghostRun(): number[] | null {
    const p = this.player;
    if (!this.recorder || p.finishTime === null || p.disqualified) return null;
    const run = [...this.recorder.samples];
    run.push(this.cfg.DISTANCE); // ends on the line, just after the finish time
    return run;
  }

  /** The ghost of your best run, drawn see-through in your lane. */
  private drawGhost(r: Renderer, toScreen: (m: number) => number): void {
    const ghost = this.ctx.ghost;
    if (!ghost || !this.soloOffline) return;
    const t = this.phase === 'running' || this.phase === 'finished' ? this.raceTime : 0;
    const pos = ghostPosition(ghost, t);
    const x = toScreen(pos) - ATHLETE_W / 2;
    if (x < -ATHLETE_W || x > r.width) return;
    const footY = LAYOUT.TRACK_TOP + this.player.laneNumber * LAYOUT.LANE_HEIGHT - 3;
    this.ghostSprites ??= new AthleteSprites(this.player.look, true);
    const pose = pos > 0 ? RUN_CYCLE[Math.floor(pos / ANIMATION.STRIDE_PER_FRAME) % RUN_CYCLE.length] : 'set';
    r.image(this.ghostSprites.get(pose), x, footY - ATHLETE_H + 1);
  }

  private spritesFor(lane: Lane): AthleteSprites {
    let s = this.sprites.get(lane);
    if (!s) {
      s = new AthleteSprites(lane.look, false, 1, this.stadium.theme);
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
        if (!allOut) r.text(this.humans.length > 1 && !this.net ? this.startHint2P() : this.startHint(), cx, y + 22, PALETTE.YELLOW, 'center');
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
const NO_KEYS: PlayerKeys = { left: false, right: false, action: false, actionHeld: false, runHeld: false, chord: false };

/** Screen y of a lane's ground line (where feet and dust go). */
function laneFootY(laneNumber: number): number {
  return LAYOUT.TRACK_TOP + laneNumber * LAYOUT.LANE_HEIGHT - 3;
}
