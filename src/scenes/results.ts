import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { EventResult } from '../events/event';
import { PALETTE } from '../gfx/palette';

const PLACES = ['1ST', '2ND', '3RD', '4TH'];
const MEDAL_COLOURS = [PALETTE.YELLOW, PALETTE.GREY_LIGHT, PALETTE.ORANGE];
const HEADER_Y = 48;

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

    const isField = this.results.some((res) => res.attempts !== undefined);
    if (isField) this.drawFieldTable(r);
    else this.drawRaceTable(r);

    r.text('ENTER: TRY AGAIN  ESC: MENU', r.width / 2, 164, PALETTE.GREY_LIGHT, 'center');
  }

  /** Columns: place, lane, name, time, reaction. */
  private drawRaceTable(r: Renderer): void {
    const cols = [24, 72, 112, 176, 240];
    this.header(r, cols, ['POS', 'LANE', 'NAME', 'TIME', 'REACT']);
    this.results.forEach((res, i) => {
      const { y, colour } = this.row(r, res, i, cols[0]);
      r.text(String(res.lane ?? '-'), cols[1] + 8, y, colour, 'center');
      r.text(res.name, cols[2], y, colour);
      r.text(res.disqualified ? 'DQ' : formatMark(res.mark), cols[3], y, colour);
      r.text(res.reactionTime === undefined ? '-' : res.reactionTime.toFixed(2), cols[4], y, colour);
    });
  }

  /** Columns: place, name, attempt 1-3 (X = foul), best. */
  private drawFieldTable(r: Renderer): void {
    const cols = [24, 64, 112, 160, 208, 256];
    this.header(r, cols, ['POS', 'NAME', '1', '2', '3', 'BEST']);
    this.results.forEach((res, i) => {
      const { y, colour } = this.row(r, res, i, cols[0]);
      r.text(res.name, cols[1], y, colour);
      const attempts = res.attempts ?? [];
      for (let a = 0; a < 3; a++) {
        const m = attempts[a];
        const text = a >= attempts.length ? '-' : m === null ? 'X' : m.toFixed(2);
        r.text(text, cols[2 + a], y, m === null ? PALETTE.RED : colour);
      }
      r.text(formatMark(res.mark), cols[5], y, colour);
    });
  }

  private header(r: Renderer, cols: number[], labels: string[]): void {
    labels.forEach((label, i) => r.text(label, cols[i], HEADER_Y, PALETTE.GREY));
    r.rect(20, HEADER_Y + 10, r.width - 40, 1, PALETTE.GREY_DARK);
  }

  /** Draws the row highlight and place; returns the row's y and text colour. */
  private row(r: Renderer, res: EventResult, i: number, placeX: number): { y: number; colour: string } {
    const y = HEADER_Y + 16 + i * 14;
    const isPlayer = res.playerIndex >= 0;
    if (isPlayer) r.rect(20, y - 3, r.width - 40, 13, PALETTE.NAVY);
    const colour = isPlayer ? PALETTE.YELLOW : PALETTE.WHITE;
    const hasMark = !res.disqualified && res.mark !== null;
    r.text(hasMark ? PLACES[i] : '-', placeX, y, hasMark && i < 3 ? MEDAL_COLOURS[i] : colour);
    return { y, colour };
  }
}

function formatMark(mark: number | null): string {
  return mark === null ? '-' : mark.toFixed(2);
}
