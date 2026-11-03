import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { cpuLineup, playerLook } from '../events/cpu';
import type { Standing } from '../game/championship';
import type { Session } from '../game/session';
import { ANIMATION } from '../game/tuning';
import { Stadium } from '../gfx/backgrounds';
import { PALETTE } from '../gfx/palette';
import { ATHLETE_H, ATHLETE_W, AthleteSprites } from '../gfx/sprites/athlete';
import { finishChampionship } from './high-score-entry';
import { MEDAL_COLOURS } from './results';

const PLACES = ['1ST', '2ND', '3RD', '4TH'];
// Blocks: 2nd on the left, 1st in the middle (tallest), 3rd on the right.
const BLOCKS = [
  { place: 1, x: 100, h: 34 },
  { place: 0, x: 160, h: 48 },
  { place: 2, x: 220, h: 24 },
];
const GROUND = 150; // px, top of the grass the podium stands on
const BLOCK_W = 52;

/** Championship podium: the top three by total points, with medals. */
export class PodiumScene implements Scene {
  readonly name = 'PODIUM';
  private time = 0;
  private readonly standings: Standing[];
  private readonly stadium = new Stadium();
  private readonly sprites = new Map<string, AthleteSprites>();

  constructor(
    private readonly game: Game,
    private readonly session: Session,
  ) {
    this.standings = session.championship?.standings() ?? [];
    this.sprites.set(session.initials, new AthleteSprites(playerLook(session.team)));
    for (const cpu of cpuLineup(session.team)) this.sprites.set(cpu.name, new AthleteSprites(cpu.look));
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (input.justPressed('CONFIRM')) finishChampionship(this.game, this.session);
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    const wave = Math.floor(this.time / ANIMATION.WAVE_FRAME_TIME) % 2;
    this.stadium.drawStands(r, 0, 0, wave, 0);
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
      const sprite = this.sprites.get(s.name)?.get(pose);
      if (sprite) r.image(sprite, b.x - ATHLETE_W / 2, top - ATHLETE_H);
      // Medal on a ribbon, name and total under the block.
      r.rect(b.x - 2, top - ATHLETE_H + 9, 4, 4, MEDAL_COLOURS[b.place]);
      const colour = s.playerIndex === 0 ? PALETTE.YELLOW : PALETTE.WHITE;
      r.text(s.name, b.x, GROUND + 3, colour, 'center');
      r.text(String(s.total), b.x, GROUND + 12, colour, 'center');
    }

    // If the player missed the podium, say where they finished.
    const mine = this.standings.findIndex((s) => s.playerIndex === 0);
    if (mine >= 3) r.text(`YOU FINISHED ${PLACES[mine]}`, cx, 32, PALETTE.WHITE, 'center');
    if (Math.floor(this.time * 2) % 2 === 0) r.text('PRESS ENTER', cx, 172, PALETTE.GREY_LIGHT, 'center');
  }
}
