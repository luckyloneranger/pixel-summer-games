import type { Renderer } from '../core/renderer';
import { EFFECTS, HURDLES } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import type { Pose } from '../gfx/sprites/athlete';
import { drawHurdle } from '../gfx/sprites/props';
import { RaceEvent, type Lane } from './race-event';

/** Where each hurdle stands, in m from the start. */
export const HURDLE_POSITIONS: readonly number[] = Array.from(
  { length: HURDLES.COUNT },
  (_, i) => HURDLES.FIRST_HURDLE + i * HURDLES.SPACING,
);

export type HurdleOutcome = 'clear' | 'hit' | 'crash';

/**
 * Judge one hurdle from how far through the jump the athlete is as they pass
 * it (0 = take-off, 1 = landing), or null if they're on the ground.
 */
export function judgeHurdle(jumpProgress: number | null): HurdleOutcome {
  if (jumpProgress === null) return 'crash';
  if (jumpProgress < HURDLES.CLEAR_FROM || jumpProgress > HURDLES.CLEAR_TO) return 'hit';
  return 'clear';
}

export interface HurdleLane extends Lane {
  /** Seconds into the current jump, or null when on the ground. */
  jumpTime: number | null;
  nextHurdle: number; // index of the next hurdle to pass
  knocked: boolean[]; // which hurdles in this lane are down
  hits: number;
  stumbleTime: number; // s of stumbling left
  sinceHit: number; // s since the last hit (for the HIT! label)
  cpuWillHit: boolean[]; // CPUs: which hurdles they'll clip this race
}

/**
 * 110 m hurdles: the 100 m race rules plus 10 hurdles per lane. Tap Action
 * to jump; you can't tap for speed while in the air. Clipping a hurdle
 * knocks it down and costs 40% of your speed; running into one costs 70%.
 */
export class Hurdles110Event extends RaceEvent<HurdleLane> {
  readonly id = 'hurdles110';
  readonly name = '110 M HURDLES';
  protected startHint = 'A+D RUN   W OR SPACE JUMP';

  constructor() {
    super(HURDLES);
  }

  protected createLane(base: Lane): HurdleLane {
    return {
      ...base,
      jumpTime: null,
      nextHurdle: 0,
      knocked: [],
      hits: 0,
      stumbleTime: 0,
      sinceHit: Infinity,
      cpuWillHit: [],
    };
  }

  protected resetLane(lane: HurdleLane): void {
    lane.jumpTime = null;
    lane.nextHurdle = 0;
    lane.knocked = HURDLE_POSITIONS.map(() => false);
    lane.hits = 0;
    lane.stumbleTime = 0;
    lane.sinceHit = Infinity;
    const chance = HURDLES.CPU_HIT_CHANCE[this.ctx.difficulty];
    lane.cpuWillHit = HURDLE_POSITIONS.map(() => lane.playerIndex === -1 && this.rng.next() < chance);
  }

  /** Taps add no speed in the air, or while stumbling after a crash. */
  protected canTap(lane: HurdleLane): boolean {
    return lane.jumpTime === null && lane.stumbleTime <= 0;
  }

  protected beforeMove(lane: HurdleLane, dt: number, actionPressed: boolean): void {
    lane.stumbleTime = Math.max(0, lane.stumbleTime - dt);
    lane.sinceHit += dt;
    if (lane.jumpTime !== null) return;
    if (lane.cpu) {
      // CPUs take off so the hurdle passes under the middle of their jump.
      const next = HURDLE_POSITIONS[lane.nextHurdle];
      const distance = next - lane.runner.position;
      if (next !== undefined && distance <= (lane.runner.speed * HURDLES.JUMP_TIME) / 2) lane.jumpTime = 0;
    } else if (actionPressed) {
      lane.jumpTime = 0;
      this.sound.play('jump');
    }
  }

  protected afterMove(lane: HurdleLane, dt: number, _before: number): void {
    if (lane.jumpTime !== null) lane.jumpTime += dt;
    const progress = lane.jumpTime === null ? null : lane.jumpTime / HURDLES.JUMP_TIME;
    while (lane.nextHurdle < HURDLE_POSITIONS.length && lane.runner.position >= HURDLE_POSITIONS[lane.nextHurdle]) {
      const outcome = lane.cpu
        ? lane.cpuWillHit[lane.nextHurdle] ? 'hit' : 'clear'
        : judgeHurdle(progress);
      this.applyOutcome(lane, outcome);
      lane.nextHurdle++;
    }
    if (lane.jumpTime !== null && lane.jumpTime >= HURDLES.JUMP_TIME) lane.jumpTime = null;
  }

  private applyOutcome(lane: HurdleLane, outcome: HurdleOutcome): void {
    if (outcome === 'clear') return;
    lane.knocked[lane.nextHurdle] = true;
    lane.hits++;
    lane.sinceHit = 0;
    if (lane.playerIndex >= 0) {
      this.sound.play('clank');
      this.ctx.effects?.shake(EFFECTS.SHAKE_HURDLE);
    }
    const loss = outcome === 'crash' ? HURDLES.CRASH_SPEED_LOSS : HURDLES.HIT_SPEED_LOSS;
    lane.runner.speed *= 1 - loss;
    if (outcome === 'crash') lane.stumbleTime = HURDLES.STUMBLE_TIME;
  }

  debugLines(): string[] {
    const p = this.player;
    const jump = p.jumpTime === null ? '-' : (p.jumpTime / HURDLES.JUMP_TIME).toFixed(2);
    return [...super.debugLines(), `JUMP ${jump}  HITS ${p.hits}`];
  }

  // ---------------------------------------------------------------- drawing

  protected liftFor(lane: HurdleLane): number {
    if (lane.jumpTime === null) return 0;
    const u = lane.jumpTime / HURDLES.JUMP_TIME;
    return Math.round(4 * HURDLES.JUMP_HEIGHT * u * (1 - u) * HURDLES.PIXELS_PER_METER);
  }

  protected poseFor(lane: HurdleLane): Pose {
    if (this.phase === 'running' || this.phase === 'finished') {
      if (lane.jumpTime !== null) return 'jump';
      if (lane.stumbleTime > 0) return 'stumble';
    }
    return super.poseFor(lane);
  }

  protected drawLaneProps(r: Renderer, lane: HurdleLane, toScreen: (m: number) => number, footY: number): void {
    for (let i = 0; i < HURDLE_POSITIONS.length; i++) {
      const x = toScreen(HURDLE_POSITIONS[i]);
      if (x < -12 || x > r.width + 12) continue;
      drawHurdle(r, x, footY, lane.knocked[i]);
    }
    if (lane.sinceHit < HURDLES.HIT_TEXT_TIME && lane.playerIndex >= 0) {
      r.text('HIT!', toScreen(lane.runner.position), footY - 36, PALETTE.RED, 'center');
    }
  }
}
