import { Rng } from '../core/rng';
import type { Renderer } from '../core/renderer';
import { PALETTE } from './palette';
import type { EventId } from '../events/event';

// Stadium layout in screen pixels (drawing positions, not gameplay values).
export const LAYOUT = {
  STAND_TOP: 40, // leaves a strip of sky visible below the scoreboard
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

/** Time of day for an event's stadium. */
export type StadiumTheme = 'day' | 'sunset' | 'night';

/** Sky colours from the top down (blended with dithered rows between them). */
export const SKY_COLOURS: Record<StadiumTheme, string[]> = {
  day: [PALETTE.SKY, PALETTE.CYAN, PALETTE.SKY_PALE],
  sunset: [PALETTE.PURPLE, PALETTE.PINK, PALETTE.ORANGE, PALETTE.PEACH],
  night: [PALETTE.MIDNIGHT, PALETTE.NIGHT, PALETTE.NAVY],
};

const PYLON_EVERY = 160; // px between floodlight towers on the roof
const POOL_W = 120; // px, a floodlight's pool of light on the field
const POOL_H = 40;
const FLAG_EVERY = 64; // px between flags along the front wall
const FLAG_COLOURS = [PALETTE.RED, PALETTE.BLUE, PALETTE.GREEN, PALETTE.YELLOW, PALETTE.PURPLE];
/** Each event's time of day. */
export const STADIUM_THEMES: Record<EventId, StadiumTheme> = {
  dash100: 'day',
  longJump: 'day',
  hurdles110: 'sunset',
  javelin: 'sunset',
  highJump: 'night',
  tripleJump: 'day',
  poleVault: 'night',
  hammer: 'sunset',
  swim50: 'day',
};

/** Weather (looks only: it never changes a mark). */
export type Weather = 'clear' | 'rain' | 'wind';
export const STADIUM_WEATHER: Record<EventId, Weather> = {
  dash100: 'clear',
  longJump: 'clear',
  hurdles110: 'clear',
  javelin: 'wind',
  highJump: 'clear',
  tripleJump: 'rain',
  poleVault: 'clear',
  hammer: 'clear',
  swim50: 'clear',
};
const RAIN_SKY = [PALETTE.GREY_DARK, PALETTE.GREY, PALETTE.GREY_LIGHT];
const RAIN_DROPS = 90; // streaks on screen at once
const RAIN_SPEED = 220; // px/s the rain falls
const WIND_FLAP = 10; // flag flaps per second in the wind (4 when calm)
const WIND_CLOUDS = 14; // px/s clouds drift in the wind (3 when calm)
const EXCITED_FRAME_TIME = 0.15; // s per jump when the crowd is on its feet

/** Held-up signs and big flags in the crowd tile: x px, crowd row, colours. */
const BANNERS = [
  { x: 14, row: 1, w: 16, colour: PALETTE.WHITE, stripe: PALETTE.RED },
  { x: 58, row: 4, w: 12, colour: PALETTE.YELLOW, stripe: PALETTE.BLUE },
];
const FLAG_WAVERS = [
  { x: 40, row: 2, colour: PALETTE.BLUE, stripe: PALETTE.WHITE },
  { x: 84, row: 5, colour: PALETTE.RED, stripe: PALETTE.YELLOW },
];

const SKY_PARALLAX = 0.05; // the sky scrolls this much slower than the track
const FLASHES = 5; // camera flashes in the crowd per frame when they're on

/** Draws the sky, the crowd stand and the track. Crowd and grass images are built once. */
export class Stadium {
  private crowdFrames: HTMLCanvasElement[] | null = null;
  private grassTile: HTMLCanvasElement | null = null;
  private poolImage: HTMLCanvasElement | null = null;
  /** Time of day (each event sets its own). */
  theme: StadiumTheme = 'night';
  /** Seconds, for waving flags, drifting clouds and twinkling stars. */
  time = 0;
  /** Camera flashes popping in the crowd (a big mark; off with reduce flashing). */
  flashes = false;
  /** Rain or wind for this event (looks only). */
  weather: Weather = 'clear';
  /** The whole crowd on its feet, jumping (a close finish or a big jump in the air). */
  excited = false;

  /** Crowd, front wall with boards, grass and the 4-lane track. */
  drawBackground(r: Renderer, cameraPx: number, crowdParallax: number, waveFrame: number): void {
    this.drawStands(r, cameraPx, crowdParallax, waveFrame, 0);
    r.rect(0, LAYOUT.TRACK_TOP, r.width, TRACK_BOTTOM - LAYOUT.TRACK_TOP, PALETTE.ORANGE);
    r.rect(0, TRACK_BOTTOM + 1, r.width, 1, PALETTE.GREEN_DARK);
    for (let i = 0; i <= LAYOUT.LANES; i++) {
      r.rect(0, LAYOUT.TRACK_TOP + i * LAYOUT.LANE_HEIGHT, r.width, 1, PALETTE.WHITE);
    }
  }

  /**
   * Sky, roof, crowd stand, front wall and grass everywhere below it. Events
   * add their own track. `shiftDown` (px) moves it all down when the camera
   * rises (javelin), showing more sky.
   */
  drawStands(r: Renderer, cameraPx: number, crowdParallax: number, waveFrame: number, shiftDown = 0): void {
    const dy = Math.round(shiftDown);
    const standTop = LAYOUT.STAND_TOP + dy;
    this.drawSky(r, standTop, cameraPx);
    // Crowd stand, scrolling slower than the track.
    const frames = this.crowd();
    // On their feet: everyone up, bouncing between standing and arms up.
    const jumping = Math.floor(this.time / EXCITED_FRAME_TIME) % 2;
    const img = this.excited ? frames[jumping ? 2 : 1] : frames[waveFrame % 2];
    r.rect(0, standTop, r.width, LAYOUT.WALL_TOP - LAYOUT.STAND_TOP, PALETTE.NIGHT); // behind empty seats
    const shift = -Math.floor(cameraPx * crowdParallax) % CROWD_TILE_W;
    for (let x = shift - CROWD_TILE_W; x < r.width; x += CROWD_TILE_W) {
      r.image(img, x, standTop);
      this.drawCrowdProps(r, x, standTop);
    }
    if (this.flashes) this.drawFlashes(r, standTop);
    this.drawRoof(r, standTop, cameraPx * crowdParallax);

    // Front wall with sponsor-free boards that move with the track.
    const wallTop = LAYOUT.WALL_TOP + dy;
    r.rect(0, wallTop, r.width, LAYOUT.WALL_HEIGHT, PALETTE.GREY_DARK);
    r.rect(0, wallTop, r.width, 1, PALETTE.GREY);
    const boardEvery = 200; // px between boards
    for (let x = -(Math.floor(cameraPx) % boardEvery) - boardEvery; x < r.width; x += boardEvery) {
      r.rect(x + 20, wallTop + 1, 112, LAYOUT.WALL_HEIGHT - 1, PALETTE.NAVY);
      r.text('SUMMER GAMES', x + 76, wallTop + 1, PALETTE.YELLOW, 'center');
    }
    this.drawFlags(r, wallTop, cameraPx);

    // Grass with mown stripes, moving with the track.
    const grassTop = wallTop + LAYOUT.WALL_HEIGHT;
    const tile = this.grass();
    const gx = -(Math.floor(cameraPx) % tile.width) - tile.width;
    for (let y = grassTop; y < r.height; y += tile.height) {
      for (let x = gx; x < r.width; x += tile.width) r.image(tile, x, y);
    }
    // Night: pools of floodlight on the field, under each light tower.
    if (this.theme === 'night') {
      const pool = this.lightPool();
      const every = PYLON_EVERY * 2;
      const px = -(Math.floor(cameraPx) % every) - every;
      for (let x = px; x < r.width + every; x += every) r.image(pool, x, grassTop + 6);
    }
  }

  /** A soft oval of light, dithered (denser in the middle) so it needs no see-through colour. */
  private lightPool(): HTMLCanvasElement {
    if (!this.poolImage) {
      const w = POOL_W;
      const h = POOL_H;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D is not supported in this browser.');
      ctx.fillStyle = PALETTE.GREEN_LIGHT;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const d = ((x - w / 2) / (w / 2)) ** 2 + ((y - h / 2) / (h / 2)) ** 2; // 0 middle, 1 edge
          const dense = d < 0.35 ? (x + y) % 2 === 0 : d < 1 ? (x % 2 === 0 && y % 2 === 0) : false;
          if (dense) ctx.fillRect(x, y, 1, 1);
        }
      }
      this.poolImage = c;
    }
    return this.poolImage;
  }

  /** The sky down to the top of the stand: a dithered gradient, then sun, clouds or stars. */
  private drawSky(r: Renderer, bottom: number, cameraPx: number): void {
    const raining = this.weather === 'rain';
    const colours = raining ? RAIN_SKY : SKY_COLOURS[this.theme];
    drawGradient(r, 0, Math.max(bottom, 1), colours);
    const sx = -cameraPx * SKY_PARALLAX;
    if (this.theme === 'night') {
      for (let i = 0; i < 26; i++) {
        const x = (((i * 53 + 11 + sx) % r.width) + r.width) % r.width;
        const y = 2 + ((i * 7) % Math.max(1, bottom - 6));
        const on = Math.sin(this.time * 2 + i) > -0.4;
        r.rect(x, y, 1, 1, on ? PALETTE.WHITE : PALETTE.GREY_DARK);
      }
      return;
    }
    if (raining) {
      // Low grey cloud from end to end, no sun.
      for (let x = -((Math.floor(this.time * 2 - sx) % 24) + 24) % 24 - 24; x < r.width; x += 24) {
        r.rect(x, 0, 20, 3, PALETTE.GREY_DARK);
        r.rect(x + 6, 3, 14, 2, PALETTE.GREY_DARK);
      }
      return;
    }
    if (this.theme === 'day') {
      drawDisc(r, 252 + sx * 0.5, bottom - 15, 5, PALETTE.YELLOW_LIGHT);
    } else {
      drawDisc(r, 220 + sx * 0.5, bottom - 2, 9, PALETTE.ORANGE_LIGHT); // low sun, half behind the stand
      drawDisc(r, 220 + sx * 0.5, bottom - 2, 6, PALETTE.YELLOW_LIGHT);
    }
    // Clouds drift slowly across, and loop round.
    const cloud = this.theme === 'day' ? PALETTE.CLOUD : PALETTE.PEACH;
    for (let i = 0; i < 3; i++) {
      const span = r.width + 60;
      const drift = this.weather === 'wind' ? WIND_CLOUDS : 3;
      const x = ((((i * 131 + this.time * drift + sx) % span) + span) % span) - 40;
      const y = 3 + i * 5;
      if (y + 4 > bottom) continue;
      r.rect(x, y + 2, 26, 3, cloud);
      r.rect(x + 5, y, 12, 3, cloud);
      r.rect(x + 14, y + 1, 8, 2, cloud);
    }
    // Wind: quick streaks blowing across the sky.
    if (this.weather === 'wind') {
      for (let i = 0; i < 4; i++) {
        const span = r.width + 40;
        const x = ((((i * 97 + this.time * 90) % span) + span) % span) - 20;
        const y = 6 + ((i * 11) % Math.max(1, bottom - 8));
        r.rect(x, y, 10, 1, PALETTE.WHITE);
      }
    }
  }

  /** The stand's roof edge, with floodlight towers on it (lit at night). */
  private drawRoof(r: Renderer, standTop: number, scrolled: number): void {
    r.rect(0, standTop - 3, r.width, 3, PALETTE.GREY_DARK);
    r.rect(0, standTop - 3, r.width, 1, PALETTE.GREY);
    const lit = this.theme !== 'day';
    for (let x = -(Math.floor(scrolled) % PYLON_EVERY) + 40; x < r.width + 20; x += PYLON_EVERY) {
      if (standTop - 16 < 0) continue;
      r.rect(x, standTop - 14, 2, 11, PALETTE.GREY_DARK);
      r.rect(x - 5, standTop - 18, 12, 5, PALETTE.GREY);
      for (let i = 0; i < 3; i++) r.rect(x - 4 + i * 4, standTop - 17, 3, 3, lit ? PALETTE.YELLOW_LIGHT : PALETTE.GREY_LIGHT);
    }
  }

  /** Little flags on poles along the front wall, flapping. */
  private drawFlags(r: Renderer, wallTop: number, cameraPx: number): void {
    const flap = Math.floor(this.time * (this.weather === 'wind' ? WIND_FLAP : 4)) % 2;
    for (let x = -(Math.floor(cameraPx) % FLAG_EVERY) + 8, i = 0; x < r.width; x += FLAG_EVERY, i++) {
      const n = Math.floor((x + Math.floor(cameraPx)) / FLAG_EVERY);
      const colour = FLAG_COLOURS[((n % FLAG_COLOURS.length) + FLAG_COLOURS.length) % FLAG_COLOURS.length];
      r.rect(x, wallTop - 9, 1, 9, PALETTE.GREY_LIGHT); // pole
      r.rect(x + 1, wallTop - 9 + flap, 5, 2, colour);
      r.rect(x + 1, wallTop - 7, 4 + flap, 2, colour);
    }
  }

  /** Signs held up and big flags waved in one crowd tile at x. */
  private drawCrowdProps(r: Renderer, x: number, standTop: number): void {
    const bob = Math.floor(this.time * 3) % 2;
    for (const b of BANNERS) {
      const y = standTop + b.row * ROW_H - 3 - bob;
      r.rect(x + b.x + 2, y + 4, 1, 3, PALETTE.GREY_LIGHT); // sticks
      r.rect(x + b.x + b.w - 3, y + 4, 1, 3, PALETTE.GREY_LIGHT);
      r.rect(x + b.x, y, b.w, 5, b.colour);
      r.rect(x + b.x + 2, y + 2, b.w - 4, 1, b.stripe);
    }
    const wave = Math.floor(this.time * (this.weather === 'wind' ? WIND_FLAP : 3)) % 2;
    for (const f of FLAG_WAVERS) {
      const y = standTop + f.row * ROW_H - 6;
      r.rect(x + f.x, y, 1, 8, PALETTE.GREY_LIGHT); // the pole
      const fx = wave ? x + f.x + 1 : x + f.x - 7; // swung right, then left
      r.rect(fx, y, 7, 5, f.colour);
      r.rect(fx, y + 2, 7, 1, f.stripe);
    }
  }

  /** Rain in front of everything (call after the athletes); nothing in other weather. */
  drawWeather(r: Renderer): void {
    if (this.weather !== 'rain') return;
    for (let i = 0; i < RAIN_DROPS; i++) {
      const x = (hash(i * 31) + Math.floor(this.time * RAIN_SPEED * 0.25)) % (r.width + 20) - 10;
      const y = (hash(i * 17 + 3) + Math.floor(this.time * RAIN_SPEED)) % (r.height + 10) - 5;
      r.rect(x, y, 1, 3, PALETTE.CLOUD);
      r.rect(x - 1, y + 3, 1, 1, PALETTE.GREY_LIGHT);
    }
  }

  /** Camera flashes: a few bright specks in the crowd, different every frame. */
  private drawFlashes(r: Renderer, standTop: number): void {
    const frame = Math.floor(this.time * 30);
    const h = LAYOUT.WALL_TOP - LAYOUT.STAND_TOP;
    for (let i = 0; i < FLASHES; i++) {
      const x = hash(frame * 7 + i) % r.width;
      const y = standTop + (hash(frame * 13 + i * 5) % (h - 4)) + 2;
      r.rect(x, y, 1, 1, PALETTE.WHITE);
      r.rect(x - 1, y + 1, 3, 1, PALETTE.WHITE);
      r.rect(x, y + 2, 1, 1, PALETTE.WHITE);
    }
  }

  /** Grass tile: a plain stripe and a lighter dithered stripe (like a mown pitch). */
  private grass(): HTMLCanvasElement {
    if (!this.grassTile) {
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 8;
      const c = canvas.getContext('2d');
      if (!c) throw new Error('Canvas 2D is not supported in this browser.');
      c.fillStyle = PALETTE.GREEN;
      c.fillRect(0, 0, 32, 8);
      c.fillStyle = PALETTE.GREEN_LIGHT;
      for (let y = 0; y < 8; y++) for (let x = 16; x < 32; x++) if ((x + y) % 2 === 0 && y % 2 === 0) c.fillRect(x, y, 1, 1);
      this.grassTile = canvas;
    }
    return this.grassTile;
  }

  /**
   * Stand up the part of the crowd between x0 and x1 (px), over a crowd already
   * drawn with no camera scroll (the title screen's Mexican wave).
   */
  drawWaveStrip(r: Renderer, x0: number, x1: number): void {
    const up = this.crowd()[1];
    const h = LAYOUT.WALL_TOP - LAYOUT.STAND_TOP;
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(r.width, x1); ) {
      const tileX = x % CROWD_TILE_W;
      const w = Math.min(CROWD_TILE_W - tileX, Math.ceil(x1) - x);
      r.imagePart(up, tileX, 0, w, h, x, LAYOUT.STAND_TOP);
      x += w;
    }
  }

  private crowd(): HTMLCanvasElement[] {
    if (!this.crowdFrames) {
      const fans = layoutCrowd();
      // Seated, the wave (every other fan up), and everyone up.
      this.crowdFrames = [drawCrowdTile(fans, 'some'), drawCrowdTile(fans, 'some', true), drawCrowdTile(fans, 'all', true)];
    }
    return this.crowdFrames;
  }
}

function drawCrowdTile(fans: Fan[], who: 'some' | 'all', standing = false): HTMLCanvasElement {
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
    const up = standing && (who === 'all' || f.waves) ? 2 : 0;
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

/**
 * Fill rows top..bottom with colours fading from the first to the last.
 * Between two colours there are two dithered rows (a checkerboard of both),
 * the old-console way to blend without extra colours.
 */
export function drawGradient(r: Renderer, top: number, bottom: number, colours: readonly string[]): void {
  const rows = gradientRows(bottom - top, colours);
  rows.forEach((row, i) => {
    const y = top + i;
    r.rect(0, y, r.width, 1, row.base);
    if (row.dither) for (let x = (i % 2); x < r.width; x += 2) r.rect(x, y, 1, 1, row.dither);
  });
}

/** Which colour each gradient row is, and the colour dithered over it (pure, for tests). */
export function gradientRows(height: number, colours: readonly string[]): { base: string; dither: string | null }[] {
  const out: { base: string; dither: string | null }[] = [];
  const band = height / colours.length;
  for (let i = 0; i < height; i++) {
    const k = Math.min(colours.length - 1, Math.floor(i / band));
    const intoNext = (k + 1) * band - i; // rows left before the next colour
    const next = colours[k + 1];
    out.push({ base: colours[k], dither: next && intoNext <= 2 ? next : null });
  }
  return out;
}

/** A filled circle (pixel style). */
function drawDisc(r: Renderer, cx: number, cy: number, radius: number, colour: string): void {
  for (let dy = -radius; dy <= radius; dy++) {
    const half = Math.round(Math.sqrt(radius * radius - dy * dy));
    r.rect(cx - half, cy + dy, half * 2 + 1, 1, colour);
  }
}

/** A cheap, repeatable scramble of a number (for flash positions). */
function hash(n: number): number {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}
