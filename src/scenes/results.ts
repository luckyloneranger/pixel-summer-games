import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { EventResult } from '../events/event';
import { PALETTE } from '../gfx/palette';

const PLACES = ['1ST', '2ND', '3RD', '4TH'];
const MEDAL_COLOURS = [PALETTE.YELLOW, PALETTE.GREY_LIGHT, PALETTE.ORANGE];

/** Event results table. Enter runs the event again, Esc goes back to the menu. */
export class ResultsScene implements Scene {
  readonly name = 'RESULTS';

  constructor(
    private readonly game: Game,
    private readonly title: string,
    private readonly results: EventResult[],
    private readonly retry: () => Scene,
  ) {}

  update(_dt: number, input: InputSnapshot): void {
    if (input.justPressed('CONFIRM')) this.game.scenes.replace(this.retry());
    else if (input.justPressed('BACK')) this.game.scenes.pop();
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NIGHT);
    r.rect(0, 0, r.width, 24, PALETTE.INK);
    r.text(this.title, r.width / 2, 4, PALETTE.WHITE, 'center', 2);
    r.text('RESULTS', r.width / 2, 30, PALETTE.GREY_LIGHT, 'center');

    // Columns: place, lane, name, time, reaction.
    const cols = [24, 72, 112, 176, 240];
    const headerY = 48;
    r.text('POS', cols[0], headerY, PALETTE.GREY);
    r.text('LANE', cols[1] - 8, headerY, PALETTE.GREY);
    r.text('NAME', cols[2], headerY, PALETTE.GREY);
    r.text('TIME', cols[3], headerY, PALETTE.GREY);
    r.text('REACT', cols[4], headerY, PALETTE.GREY);
    r.rect(20, headerY + 10, r.width - 40, 1, PALETTE.GREY_DARK);

    this.results.forEach((res, i) => {
      const y = headerY + 16 + i * 14;
      const isPlayer = res.playerIndex >= 0;
      if (isPlayer) r.rect(20, y - 3, r.width - 40, 13, PALETTE.NAVY);
      const colour = isPlayer ? PALETTE.YELLOW : PALETTE.WHITE;
      const place = res.disqualified || res.mark === null ? '-' : PLACES[i];
      r.text(place, cols[0], y, i < 3 && place !== '-' ? MEDAL_COLOURS[i] : colour);
      r.text(String(res.lane ?? '-'), cols[1] + 8, y, colour, 'center');
      r.text(res.name, cols[2], y, colour);
      r.text(res.disqualified ? 'DQ' : res.mark === null ? '-' : res.mark.toFixed(2), cols[3], y, colour);
      r.text(res.reactionTime === undefined ? '-' : res.reactionTime.toFixed(2), cols[4], y, colour);
    });

    r.text('ENTER: RUN AGAIN  ESC: MENU', r.width / 2, 164, PALETTE.GREY_LIGHT, 'center');
  }
}
