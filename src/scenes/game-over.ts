import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { Session } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { finishChampionship } from './high-score-entry';

/** Missed a qualifying mark: the championship is over. */
export class GameOverScene implements Scene {
  readonly name = 'GAME OVER';
  private time = 0;

  constructor(
    private readonly game: Game,
    private readonly session: Session,
  ) {}

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (input.justPressed('CONFIRM')) finishChampionship(this.game, this.session);
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    r.clear(PALETTE.BLACK);
    r.text('GAME OVER', cx, 52, PALETTE.RED, 'center', 2);
    r.text('YOU MISSED THE QUALIFYING MARK', cx, 84, PALETTE.WHITE, 'center');
    r.text(`TOTAL ${this.session.championship?.playerTotal ?? 0}`, cx, 104, PALETTE.YELLOW, 'center');
    r.text('TIP: CASUAL MODE IN OPTIONS', cx, 128, PALETTE.GREY, 'center');
    if (Math.floor(this.time * 2) % 2 === 0) r.text('PRESS ENTER', cx, 152, PALETTE.GREY_LIGHT, 'center');
  }
}
