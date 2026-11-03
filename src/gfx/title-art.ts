// Draws the title screen from the numbers in src/game/title-show.ts.

import type { Renderer } from '../core/renderer';
import {
  beamAngle,
  logoOffset,
  parade,
  shineLetter,
  tickerX,
  waveCentre,
  type Confetto,
  type ParadeItem,
} from '../game/title-show';
import { TITLE } from '../game/tuning';
import { LAYOUT, Stadium } from './backgrounds';
import { textWidth } from './font';
import { PALETTE } from './palette';
import { ATHLETE_H, ATHLETE_W, AthleteSprites, makeLook, type SkinTone, type TeamKit } from './sprites/athlete';

/** Everything the title screen shows this frame. */
export interface TitleFrame {
  t: number; // s since the title opened
  steady: boolean; // reduce flashing: no shine, sweeping lights or flash
  confetti: readonly Confetto[];
  ticker: string;
  flash: boolean; // the white flash after pressing Enter
}

// Layout in screen pixels (drawing only).
const TRACK_TOP = 110;
const TRACK_BOTTOM = 166;
const TICKER_TOP = 168;
const LOGO_TOP = 12;
const PANEL = { X: 50, W: 220, H: 58 };
const PRESS_Y = 95;
const LAMPS = [
  { x: 14, side: 1 as const },
  { x: 306, side: -1 as const },
];
const BEAM_LENGTH = 150; // px
const SKINS: Record<TeamKit, SkinTone> = { red: 'light', blue: 'dark', green: 'medium', yellow: 'medium', purple: 'dark' };

/** Fixed star positions in the strip of sky above the stands. */
const STARS = Array.from({ length: 22 }, (_, i) => ({ x: (i * 53 + 17) % 320, y: 2 + ((i * 7) % 19), phase: i * 0.37 }));

export class TitleArt {
  private readonly stadium = new Stadium();
  private readonly sprites = new Map<TeamKit, AthleteSprites>();

  render(r: Renderer, f: TitleFrame): void {
    this.stadium.drawStands(r, 0, 0, 0);
    const wave = waveCentre(f.t, r.width);
    if (wave !== null) this.stadium.drawWaveStrip(r, wave - TITLE.WAVE_WIDTH / 2, wave + TITLE.WAVE_WIDTH / 2);
    this.drawSky(r, f);
    this.drawTrack(r);
    for (const item of parade(f.t)) this.drawItem(r, item);
    this.drawLogo(r, f);
    this.drawPressStart(r, f);
    for (const c of f.confetti) {
      const flat = Math.floor(c.y / 3) % 2 === 0; // flutter: flat, then edge-on
      r.rect(c.x, c.y, flat ? 2 : 1, flat ? 1 : 2, c.colour);
    }
    this.drawTicker(r, f);
    if (f.flash && !f.steady) r.clear(PALETTE.WHITE);
  }

  /** Twinkling stars and two floodlight towers with sweeping beams. */
  private drawSky(r: Renderer, f: TitleFrame): void {
    r.rect(0, 0, r.width, LAYOUT.STAND_TOP, PALETTE.NIGHT);
    for (const s of STARS) {
      const on = f.steady || Math.sin(((f.t + s.phase) / TITLE.STAR_TWINKLE) * Math.PI * 2) > -0.3;
      r.rect(s.x, s.y, 1, 1, on ? PALETTE.WHITE : PALETTE.GREY_DARK);
    }
    for (const lamp of LAMPS) {
      // Beam: a dotted line (the palette has no see-through colours), drawn first so the lamp sits on top.
      const a = f.steady ? lamp.side * 0.75 : beamAngle(f.t, lamp.side);
      for (let d = 8; d < BEAM_LENGTH; d += 2) {
        const x = lamp.x + Math.sin(a) * d;
        const y = 4 + Math.cos(a) * d;
        if (y < LAYOUT.STAND_TOP || y > TRACK_TOP) continue; // only lights up the stands and field
        r.rect(x, y, 1, 1, d % 2 ? PALETTE.CYAN : PALETTE.WHITE);
      }
      r.rect(lamp.x - 1, 6, 2, LAYOUT.STAND_TOP - 6, PALETTE.GREY_DARK); // pole
      r.rect(lamp.x - 6, 1, 12, 6, PALETTE.GREY);
      for (let i = 0; i < 4; i++) r.rect(lamp.x - 5 + i * 3, 2, 2, 4, PALETTE.YELLOW);
    }
  }

  private drawTrack(r: Renderer): void {
    r.rect(0, TRACK_TOP, r.width, TRACK_BOTTOM - TRACK_TOP, PALETTE.ORANGE);
    for (let i = 0; i <= 4; i++) r.rect(0, TRACK_TOP + i * 14, r.width, 1, PALETTE.WHITE);
    r.rect(286, TRACK_TOP, 3, TRACK_BOTTOM - TRACK_TOP, PALETTE.WHITE); // finish line
  }

  private drawItem(r: Renderer, it: ParadeItem): void {
    switch (it.k) {
      case 'athlete':
        r.image(this.athlete(it.kit).get(it.pose), it.x - ATHLETE_W / 2, Math.round(it.feet) - ATHLETE_H + 1);
        return;
      case 'javelin': {
        const dx = Math.cos(it.angle) * 7;
        const dy = -Math.sin(it.angle) * 7;
        // A dark edge underneath so it stands out against the crowd.
        r.line(it.x - dx, it.y - dy + 1, it.x + dx, it.y + dy + 1, PALETTE.INK);
        r.line(it.x - dx, it.y - dy, it.x + dx, it.y + dy, PALETTE.WHITE);
        r.rect(it.x + dx, it.y + dy, 1, 1, PALETTE.RED); // tip
        return;
      }
      case 'pit':
        r.rect(it.x, it.feet - 1, it.w, 3, PALETTE.GOLD);
        r.rect(it.x, it.feet - 1, it.w, 1, PALETTE.YELLOW);
        return;
      case 'mat':
        r.rect(it.x, it.feet - 6, it.w, 7, PALETTE.BLUE);
        r.rect(it.x, it.feet - 6, it.w, 1, PALETTE.SKY);
        return;
      case 'bar': {
        const top = it.feet - it.height;
        r.rect(it.x - 6, top - 4, 2, it.height + 5, PALETTE.GREY_LIGHT);
        r.rect(it.x + 5, top - 4, 2, it.height + 5, PALETTE.GREY_LIGHT);
        for (let i = 0; i < 12; i += 2) r.rect(it.x - 5 + i, top, 2, 2, (i / 2) % 2 ? PALETTE.RED : PALETTE.WHITE);
        return;
      }
      case 'puff':
        r.rect(it.x, it.y, 1, 1, PALETTE.YELLOW);
        return;
    }
  }

  /** The scoreboard-style logo panel, dropping in with a bounce, with a shine now and then. */
  private drawLogo(r: Renderer, f: TitleFrame): void {
    const top = LOGO_TOP - logoOffset(f.t);
    const cx = r.width / 2;
    r.rect(PANEL.X + 3, top + 3, PANEL.W, PANEL.H, PALETTE.BLACK); // shadow
    r.rect(PANEL.X, top, PANEL.W, PANEL.H, PALETTE.YELLOW);
    r.rect(PANEL.X + 2, top + 2, PANEL.W - 4, PANEL.H - 4, PALETTE.INK);
    // Bulbs round the edge, like a stadium scoreboard; they chase unless flashing is reduced.
    const chase = f.steady ? 0 : Math.floor(f.t * 6) % 3;
    for (let x = PANEL.X + 6, i = 0; x < PANEL.X + PANEL.W - 4; x += 8, i++) {
      const lit = i % 3 === chase;
      r.rect(x, top + 4, 2, 1, lit ? PALETTE.WHITE : PALETTE.GOLD);
      r.rect(x, top + PANEL.H - 5, 2, 1, lit ? PALETTE.WHITE : PALETTE.GOLD);
    }
    const shine = f.steady ? -1 : shineLetter(f.t, 12);
    this.logoLine(r, 'PIXEL', cx, top + 9, 3, PALETTE.YELLOW, PALETTE.ORANGE_DARK, shine < 0 ? -1 : Math.floor((shine * 5) / 12));
    this.logoLine(r, 'SUMMER GAMES', cx, top + 37, 2, PALETTE.WHITE, PALETTE.BLUE, shine);
  }

  /** One logo line, letter by letter so the shine can light one up. */
  private logoLine(r: Renderer, text: string, cx: number, y: number, scale: number, colour: string, shadow: string, lit: number): void {
    const left = cx - textWidth(text, scale) / 2;
    const step = textWidth('W', scale);
    for (let i = 0; i < text.length; i++) {
      const x = left + i * step;
      r.text(text[i], x + Math.ceil(scale / 2), y + Math.ceil(scale / 2), shadow, 'left', scale);
      r.text(text[i], x, y, i === lit ? PALETTE.CYAN : colour, 'left', scale);
    }
  }

  /** "PRESS START" on a dark pill, cycling colours, with arrows nudging in. */
  private drawPressStart(r: Renderer, f: TitleFrame): void {
    const cx = r.width / 2;
    r.rect(cx - 72, PRESS_Y - 3, 144, 14, PALETTE.INK);
    r.rect(cx - 72, PRESS_Y - 3, 144, 1, PALETTE.GOLD);
    const cycle = [PALETTE.WHITE, PALETTE.YELLOW, PALETTE.ORANGE, PALETTE.YELLOW];
    const phase = Math.floor((f.t / TITLE.BLINK_PERIOD) * cycle.length) % cycle.length;
    const colour = f.steady ? PALETTE.WHITE : cycle[phase];
    r.text('PRESS START', cx, PRESS_Y, colour, 'center');
    const nudge = f.steady ? 0 : Math.round(Math.abs(Math.sin(f.t * Math.PI * 2)) * 3);
    r.text('>', cx - 60 + nudge, PRESS_Y, PALETTE.YELLOW);
    r.text('<', cx + 52 - nudge, PRESS_Y, PALETTE.YELLOW);
  }

  private drawTicker(r: Renderer, f: TitleFrame): void {
    r.rect(0, TICKER_TOP, r.width, r.height - TICKER_TOP, PALETTE.INK);
    r.rect(0, TICKER_TOP, r.width, 1, PALETTE.GOLD);
    r.text(f.ticker, tickerX(f.t, textWidth(f.ticker), r.width), TICKER_TOP + 3, PALETTE.GREY_LIGHT);
  }

  private athlete(kit: TeamKit): AthleteSprites {
    let s = this.sprites.get(kit);
    if (!s) {
      s = new AthleteSprites(makeLook(kit, SKINS[kit], kit === 'yellow' ? PALETTE.BROWN : PALETTE.INK));
      this.sprites.set(kit, s);
    }
    return s;
  }
}
