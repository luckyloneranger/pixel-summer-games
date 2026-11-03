import { Rng } from '../core/rng';
import type { Renderer } from '../core/renderer';
import { PALETTE } from './palette';

// Stadium layout in screen pixels (drawing positions, not gameplay values).
export const LAYOUT = {
  STAND_TOP: 24,
  WALL_TOP: 88,
  WALL_HEIGHT: 9,
  TRACK_TOP: 110,
  LANE_HEIGHT: 14,
  LANES: 4,
};
export const TRACK_BOTTOM = LAYOUT.TRACK_TOP + LAYOUT.LANE_HEIGHT * LAYOUT.LANES;

const CROWD_TILE_W = 96; // px, the crowd pattern repeats every tile
const CROWD_SEED = 2026; // fixed, so the crowd looks the same every visit
const SEAT_W = 6; // px per spectator
const ROW_H = 8; // px per crowd row
const SHIRTS = [
  PALETTE.RED, PALETTE.BLUE, PALETTE.GREEN, PALETTE.YELLOW, PALETTE.WHITE,
  PALETTE.PURPLE, PALETTE.ORANGE, PALETTE.SKY, PALETTE.CYAN,
];
const SKINS = [PALETTE.SKIN_LIGHT, PALETTE.SKIN, PALETTE.SKIN_DARK];

/** One spectator in the repeating crowd tile. */
interface Fan {
  x: number;
  y: number;
  shirt: string;
  skin: string;
  waves: boolean; // stands up on the wave's second frame
}

/** Lay out the crowd tile (pure, so it can be tested without a browser). */
export function layoutCrowd(): Fan[] {
  const rng = new Rng(CROWD_SEED);
  const fans: Fan[] = [];
  const rows = Math.floor((LAYOUT.WALL_TOP - LAYOUT.STAND_TOP) / ROW_H);
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : SEAT_W / 2;
    for (let x = offset; x < CROWD_TILE_W; x += SEAT_W) {
      if (rng.next() < 0.08) continue; // the odd empty seat
      fans.push({
        x,
        y: row * ROW_H,
        shirt: SHIRTS[Math.floor(rng.next() * SHIRTS.length)],
        skin: SKINS[Math.floor(rng.next() * SKINS.length)],
        waves: (Math.floor(x / SEAT_W) + row) % 2 === 0,
      });
    }
  }
  return fans;
}

/** Draws the crowd stand and the track. Crowd images are built once. */
export class Stadium {
  private crowdFrames: HTMLCanvasElement[] | null = null;

  /** Crowd, front wall with boards, grass and the 4-lane track. */
  drawBackground(r: Renderer, cameraPx: number, crowdParallax: number, waveFrame: number): void {
    r.clear(PALETTE.NIGHT);
    // Crowd stand, scrolling slower than the track.
    const frames = this.crowd();
    const img = frames[waveFrame % frames.length];
    const shift = -Math.floor(cameraPx * crowdParallax) % CROWD_TILE_W;
    for (let x = shift - CROWD_TILE_W; x < r.width; x += CROWD_TILE_W) r.image(img, x, LAYOUT.STAND_TOP);

    // Front wall with sponsor-free boards that move with the track.
    r.rect(0, LAYOUT.WALL_TOP, r.width, LAYOUT.WALL_HEIGHT, PALETTE.GREY_DARK);
    r.rect(0, LAYOUT.WALL_TOP, r.width, 1, PALETTE.GREY);
    const boardEvery = 200; // px between boards
    for (let x = -(Math.floor(cameraPx) % boardEvery) - boardEvery; x < r.width; x += boardEvery) {
      r.rect(x + 20, LAYOUT.WALL_TOP + 1, 112, LAYOUT.WALL_HEIGHT - 1, PALETTE.NAVY);
      r.text('SUMMER GAMES', x + 76, LAYOUT.WALL_TOP + 1, PALETTE.YELLOW, 'center');
    }

    r.rect(0, LAYOUT.WALL_TOP + LAYOUT.WALL_HEIGHT, r.width, LAYOUT.TRACK_TOP, PALETTE.GREEN);
    r.rect(0, LAYOUT.TRACK_TOP, r.width, TRACK_BOTTOM - LAYOUT.TRACK_TOP, PALETTE.ORANGE);
    r.rect(0, TRACK_BOTTOM, r.width, r.height - TRACK_BOTTOM, PALETTE.GREEN);
    r.rect(0, TRACK_BOTTOM + 1, r.width, 1, PALETTE.GREEN_DARK);
    for (let i = 0; i <= LAYOUT.LANES; i++) {
      r.rect(0, LAYOUT.TRACK_TOP + i * LAYOUT.LANE_HEIGHT, r.width, 1, PALETTE.WHITE);
    }
  }

  private crowd(): HTMLCanvasElement[] {
    if (!this.crowdFrames) {
      const fans = layoutCrowd();
      this.crowdFrames = [drawCrowdTile(fans, false), drawCrowdTile(fans, true)];
    }
    return this.crowdFrames;
  }
}

function drawCrowdTile(fans: Fan[], wave: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CROWD_TILE_W;
  canvas.height = LAYOUT.WALL_TOP - LAYOUT.STAND_TOP;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Canvas 2D is not supported in this browser.');
  // Bench stripes behind each row.
  for (let y = 0; y < canvas.height; y += ROW_H) {
    c.fillStyle = PALETTE.NAVY;
    c.fillRect(0, y + ROW_H - 2, canvas.width, 2);
  }
  for (const f of fans) {
    const up = wave && f.waves ? 2 : 0;
    const x = f.x;
    const y = f.y + 1 - up;
    c.fillStyle = f.skin;
    c.fillRect(x + 1, y, 3, 3); // head
    c.fillStyle = f.shirt;
    c.fillRect(x, y + 3, 5, 3 + up); // body
    if (up) {
      c.fillStyle = f.skin;
      c.fillRect(x, y - 2, 1, 3); // arms up
      c.fillRect(x + 4, y - 2, 1, 3);
    }
  }
  return canvas;
}
