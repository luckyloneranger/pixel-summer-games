import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { playerLook } from '../events/cpu';
import { EVENT_NAMES } from '../game/scoring';
import type { Session } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { AthleteSprites } from '../gfx/sprites/athlete';
import { blink, drawHeader } from '../ui/widgets';
import { finishSeries } from './high-score-entry';

/** End of Versus: points per event for both players and the winner. */
export class VersusResultScene implements Scene {
  readonly name = 'VERSUS RESULT';
  readonly isMenu = true;
  readonly music = 'podium' as const;
  private time = 0;
  private readonly sprites: AthleteSprites[];

  constructor(
    private readonly game: Game,
    private readonly session: Session,
  ) {
    this.sprites = session.players.map((p) => new AthleteSprites(playerLook(p.team)));
  }

  /** Index of the winner, or -1 for a draw. */
  get winner(): number {
    const series = this.session.series!;
    const a = series.playerTotal(0);
    const b = series.playerTotal(1);
    return a === b ? -1 : a > b ? 0 : 1;
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (input.justPressed('CONFIRM')) finishSeries(this.game, this.session);
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    const s = this.session;
    const series = s.series!;
    r.clear(PALETTE.NIGHT);
    drawHeader(r, 'VERSUS');

    // Columns: event, P1 points, P2 points.
    const cols = [24, 200, 264];
    r.text('EVENT', cols[0], 32, PALETTE.GREY);
    s.players.forEach((p, i) => r.text(p.initials, cols[1 + i], 32, PALETTE.GREY));
    series.outcomes.forEach((o, row) => {
      const y = 46 + row * 11;
      r.text(EVENT_NAMES[series.events[row]], cols[0], y, PALETTE.GREY_LIGHT);
      for (let p = 0; p < 2; p++) {
        const res = o.results.find((x) => x.playerIndex === p);
        r.text(String(res?.points ?? 0), cols[1 + p], y, PALETTE.WHITE);
      }
    });
    const totalY = 46 + series.outcomes.length * 11 + 4;
    r.rect(cols[0], totalY - 3, r.width - 2 * cols[0], 1, PALETTE.GREY_DARK);
    r.text('TOTAL', cols[0], totalY, PALETTE.WHITE);
    for (let p = 0; p < 2; p++) r.text(String(series.playerTotal(p)), cols[1 + p], totalY, PALETTE.YELLOW);

    const w = this.winner;
    const msg = w === -1 ? 'IT IS A DRAW!' : `${s.players[w].initials} WINS!`;
    r.text(msg, cx, 124, PALETTE.YELLOW, 'center', 2);
    if (w >= 0) r.image(this.sprites[w].get('celebrate'), cx - 8, 140);
    const show = blink(this.time, 1, this.game.steady);
    if (show) r.text('PRESS ENTER', cx, 168, PALETTE.GREY_LIGHT, 'center');
  }
}
