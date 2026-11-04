import type { Renderer } from '../core/renderer';
import { ANIMATION, SWIM50, SWIMMER } from '../game/tuning';
import { LAYOUT, TRACK_BOTTOM } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import { ATHLETE_W, SWIM_CYCLE, type Pose } from '../gfx/sprites/athlete';
import type { EventId } from './event';
import { RaceEvent, type Lane } from './race-event';

/**
 * 50 m freestyle: the sprint's rules (marks, set, GO, false starts, tap in
 * turn) in a pool. Water is slower, so a good time is about 22 seconds.
 */
export class Swim50Event extends RaceEvent {
  readonly id: EventId = 'swim50';
  readonly name = '50 M FREESTYLE';
  protected readonly onLand = false;

  constructor() {
    super({ ...SWIM50, RUNNER: SWIMMER });
  }

  protected createLane(base: Lane): Lane {
    return base;
  }

  protected startHint(): string {
    return this.prompts.eventHint('swim50');
  }

  /** Crawl strokes in the water; on the block before GO. */
  protected poseFor(lane: Lane): Pose {
    if (lane.runner.position <= 0) return super.poseFor(lane);
    const frame = Math.floor(lane.runner.position / STROKE_EVERY) % SWIM_CYCLE.length;
    return lane.finishTime !== null && this.winnerNow !== lane ? 'swim1' : SWIM_CYCLE[frame];
  }

  /** The pool: deck, water with ripples, lane ropes, the start and finish walls. */
  protected drawSurface(r: Renderer, cameraPx: number, waveFrame: number, toScreen: (m: number) => number): void {
    this.stadium.drawStands(r, cameraPx, ANIMATION.CROWD_PARALLAX, waveFrame);
    const top = LAYOUT.TRACK_TOP - 2;
    const bottom = TRACK_BOTTOM + 2;
    r.rect(0, top - 4, r.width, 4, PALETTE.GREY_LIGHT); // pool deck
    r.rect(0, top, r.width, bottom - top, PALETTE.BLUE);
    // Ripples drifting with the camera and time.
    for (let y = top + 3; y < bottom; y += 5) {
      const shift = (Math.floor(-cameraPx * 0.9 + this.clock * 8 + y * 7) % 24 + 24) % 24;
      for (let x = shift - 24; x < r.width; x += 24) r.rect(x, y, 6, 1, PALETTE.SKY);
    }
    // Lane ropes: red and white floats.
    for (let i = 1; i < LAYOUT.LANES; i++) {
      const y = LAYOUT.TRACK_TOP + i * LAYOUT.LANE_HEIGHT;
      const off = Math.floor(-cameraPx) % 8;
      for (let x = off - 8; x < r.width; x += 4) r.rect(x, y, 3, 2, Math.floor((x - off) / 4) % 2 ? PALETTE.RED : PALETTE.WHITE);
    }
    r.rect(0, bottom, r.width, 3, PALETTE.GREY_LIGHT); // near deck
    // Start wall with blocks, and the finish wall's touch pads.
    const start = toScreen(0);
    r.rect(start - 6, top - 4, 6, bottom - top + 7, PALETTE.GREY_LIGHT);
    const finish = toScreen(SWIM50.DISTANCE);
    r.rect(finish, top, 3, bottom - top, PALETTE.YELLOW);
    r.rect(finish + 3, top - 4, 8, bottom - top + 7, PALETTE.GREY_LIGHT);
    // 10 m boards along the deck.
    for (let m = 10; m < SWIM50.DISTANCE; m += 10) {
      const x = toScreen(m);
      if (x < -20 || x > r.width + 20) continue;
      r.rect(x - 9, top - 14, 18, 9, PALETTE.WHITE);
      r.text(String(m), x, top - 13, PALETTE.INK, 'center');
    }
  }

  /** The waterline across each swimmer, so they sit in the water rather than on it. */
  protected afterAthlete(r: Renderer, lane: Lane, x: number, footY: number): void {
    if (lane.runner.position <= 0) return;
    const wobble = Math.floor(this.clock * 6 + lane.laneNumber) % 2;
    r.rect(x - 2, footY - 1 - wobble, ATHLETE_W + 4, 1, PALETTE.SKY);
    r.rect(x, footY + 1, ATHLETE_W, 1, PALETTE.CLOUD); // a little splash and wake
  }
}

const STROKE_EVERY = 0.9; // m swum per stroke frame
