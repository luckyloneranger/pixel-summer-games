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
    if (lane.runner.position < DIVE_DISTANCE && lane.finishTime === null) return 'dive'; // off the block
    const frame = Math.floor(lane.runner.position / STROKE_EVERY) % SWIM_CYCLE.length;
    return lane.finishTime !== null && this.winnerNow !== lane ? 'swim1' : SWIM_CYCLE[frame];
  }

  /** The ghost swims too: on the block, the dive, then strokes. */
  protected ghostPose(pos: number): Pose {
    if (pos <= 0) return 'set';
    if (pos < DIVE_DISTANCE) return 'dive';
    return SWIM_CYCLE[Math.floor(pos / STROKE_EVERY) % SWIM_CYCLE.length];
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
    // White water: kicked-up splashes behind, more the faster they swim.
    for (const s of splashes(lane.runner.speedFraction, this.clock, lane.laneNumber)) {
      r.rect(x + s.dx, footY + s.dy, s.size, 1, PALETTE.CLOUD);
    }
    // The splash of the dive itself.
    if (lane.runner.position < DIVE_DISTANCE + 1.5) {
      const t = lane.runner.position / (DIVE_DISTANCE + 1.5);
      for (const dx of [-3, 0, 3, 6]) r.rect(x + 10 + dx, footY - 3 - Math.round((1 - t) * 4) + (dx & 1), 2, 2, PALETTE.WHITE);
    }
  }
}

const STROKE_EVERY = 0.9; // m swum per stroke frame
const DIVE_DISTANCE = 2.5; // m: the dive pose shows until the swimmer is this far out

/** Splash dots behind a swimmer (px from the sprite's left and the waterline), flickering. */
export function splashes(speedFraction: number, t: number, seed: number): { dx: number; dy: number; size: number }[] {
  const count = Math.round(speedFraction * 5);
  const flick = Math.floor(t * 12 + seed * 3);
  return Array.from({ length: count }, (_, i) => ({
    dx: -2 - i * 3 - ((flick + i) % 2),
    dy: -1 - ((flick + i * 2) % 3),
    size: 1 + ((flick + i) % 2),
  }));
}
