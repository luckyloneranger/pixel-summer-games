import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { Session } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { finishSeries } from './high-score-entry';

/** Missed a qualifying mark: the championship is over. */
export class GameOverScene implements Scene {
  readonly name = 'GAME OVER';
  readonly isMenu = true;
  readonly music = null;
  private time = 0;

  constructor(
    private readonly game: Game,
    private readonly session: Session,
  ) {}

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (input.justPressed('CONFIRM')) finishSeries(this.game, this.session);
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    r.clear(PALETTE.BLACK);
    r.text('GAME OVER', cx, 52, PALETTE.RED, 'center', 2);
    const s = this.session;
    const two = s.players.length > 1;
    r.text(two ? 'BOTH PLAYERS ARE OUT' : 'YOU MISSED THE QUALIFYING MARK', cx, 84, PALETTE.WHITE, 'center');
    const totals = s.players.map((p, i) => `${two ? p.initials + ' ' : 'TOTAL '}${s.series?.playerTotal(i) ?? 0}`).join('   ');
    r.text(totals, cx, 104, PALETTE.YELLOW, 'center');
    r.text('TIP: CASUAL MODE IN OPTIONS', cx, 128, PALETTE.GREY, 'center');
    if (Math.floor(this.time * 2) % 2 === 0) r.text('PRESS ENTER', cx, 152, PALETTE.GREY_LIGHT, 'center');
  }
}
