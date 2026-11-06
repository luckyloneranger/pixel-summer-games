import type { Game } from '../core/game';
import { medalIcon } from '../gfx/sprites/icons';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { blink } from '../ui/widgets';
import { cpuLineup, playerLook } from '../events/cpu';
import type { Standing } from '../game/championship';
import type { Session } from '../game/session';
import { ANIMATION } from '../game/tuning';
import { Stadium } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import { ATHLETE_H, ATHLETE_W, AthleteSprites } from '../gfx/sprites/athlete';
import { finishSeries } from './high-score-entry';
import { MEDAL_COLOURS } from './results';
import { Rng } from '../core/rng';
import { throwConfetti, updateConfetti, type Confetto } from '../game/title-show';
import { newFireworks, sparkFading, updateFireworks } from '../game/fireworks';

const PLACES = ['1ST', '2ND', '3RD', '4TH', '5TH'];
// Blocks: 2nd on the left, 1st in the middle (tallest), 3rd on the right.
const BLOCKS = [
  { place: 1, x: 100, h: 34 },
  { place: 0, x: 160, h: 48 },
  { place: 2, x: 220, h: 24 },
];
const GROUND = 150; // px, top of the grass the podium stands on
const BLOCK_W = 52;
const SHOW_SEED = 2024; // the same confetti and fireworks every time
const CONFETTI_FROM_Y = 26; // px, just under the title bar

/** Championship podium: the top three by total points, with medals. */
export class PodiumScene implements Scene {
  readonly name = 'PODIUM';
  readonly isMenu = true;
  readonly music = 'podium' as const;
  private time = 0;
  private readonly standings: Standing[];
  private readonly stadium = new Stadium();
  private readonly sprites = new Map<string, AthleteSprites>();
  private readonly rng = new Rng(SHOW_SEED);
  private confetti: Confetto[] = [];
  private readonly fireworks = newFireworks();

  constructor(
    private readonly game: Game,
    private readonly session: Session,
  ) {
    this.standings = session.series?.standings() ?? [];
    const teams = session.players.map((p) => p.team);
    session.players.forEach((p, i) => this.sprites.set(`#${i}`, new AthleteSprites(playerLook(p.team))));
    for (const cpu of cpuLineup(teams)) this.sprites.set(cpu.name, new AthleteSprites(cpu.look));
    this.confetti = throwConfetti(this.rng, 160, CONFETTI_FROM_Y);
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.confetti = updateConfetti(this.confetti, dt, GROUND);
    // Fireworks flash, so they stay off with "reduce flashing".
    if (!this.game.steady) updateFireworks(this.fireworks, this.rng, dt, this.game.renderer.width, GROUND);
    if (input.justPressed('CONFIRM')) finishSeries(this.game, this.session);
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    const wave = Math.floor(this.time / ANIMATION.WAVE_FRAME_TIME) % 2;
    this.stadium.drawStands(r, 0, 0, wave, 0);
    this.drawFireworks(r);
    r.rect(0, 0, r.width, 24, PALETTE.INK);
    r.text('CHAMPIONSHIP PODIUM', cx, 8, PALETTE.YELLOW, 'center');

    for (const b of BLOCKS) {
      const s = this.standings[b.place];
      if (!s) continue;
      const left = b.x - BLOCK_W / 2;
      const top = GROUND - b.h;
      r.rect(left, top, BLOCK_W, b.h, PALETTE.WHITE);
      r.rect(left, top, BLOCK_W, 2, MEDAL_COLOURS[b.place]);
      r.text(String(b.place + 1), b.x, top + 6, PALETTE.NAVY, 'center', 2);
      const pose = b.place === 0 ? 'celebrate' : 'stand';
      const sprite = this.sprites.get(s.playerIndex >= 0 ? `#${s.playerIndex}` : s.name)?.get(pose);
      if (sprite) r.image(sprite, b.x - ATHLETE_W / 2, top - ATHLETE_H);
      // Medal on a ribbon, name and total under the block.
      r.image(medalIcon(b.place), b.x - 4, top - ATHLETE_H + 8); // the medal round their neck
      const colour = s.playerIndex >= 0 ? PALETTE.YELLOW : PALETTE.WHITE;
      r.text(s.name, b.x, GROUND + 3, colour, 'center');
      r.text(String(s.total), b.x, GROUND + 12, colour, 'center');
    }

    // Humans who missed the podium: say where they finished.
    const off = this.standings
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => s.playerIndex >= 0 && i >= 3)
      .map(({ s, i }) => `${s.name} ${PLACES[i]}`);
    if (off.length) r.text(off.join('  '), cx, 32, PALETTE.WHITE, 'center');
    for (const c of this.confetti) r.rect(Math.round(c.x), Math.round(c.y), 2, 1, c.colour);
    if (blink(this.time, 1, this.game.steady)) r.text(this.game.prompts.pressOk(), cx, 172, PALETTE.GREY_LIGHT, 'center');
  }

  /** Rockets as a bright dot with a short trail; sparks dim, then flicker out. */
  private drawFireworks(r: Renderer): void {
    for (const k of this.fireworks.rockets) {
      r.rect(Math.round(k.x), Math.round(k.y), 1, 3, PALETTE.ORANGE);
      r.rect(Math.round(k.x), Math.round(k.y), 1, 1, PALETTE.WHITE);
    }
    for (const s of this.fireworks.sparks) {
      const fading = sparkFading(s);
      if (fading && Math.floor(s.age * 20) % 2) continue;
      const size = fading ? 1 : 2; // big and bright, then small and grey
      r.rect(Math.round(s.x), Math.round(s.y), size, size, fading ? PALETTE.GREY_LIGHT : s.colour);
    }
  }
}
