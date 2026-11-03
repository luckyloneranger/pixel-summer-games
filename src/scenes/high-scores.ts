import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { CHAMPIONSHIP_EVENTS } from '../game/championship';
import { EVENT_NAMES, formatMark } from '../game/scoring';
import { RECORDS } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { drawHeader } from '../ui/widgets';

/** Top 10 championship scores and your personal bests. */
export class HighScoresScene implements Scene {
  readonly name = 'HIGH SCORES';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private time = 0;

  constructor(
    private readonly game: Game,
    /** toTitle: leaving goes back to the title (end of a run). highlight: row to flash. */
    private readonly opts: { toTitle: boolean; highlight?: number },
  ) {}

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (!input.justPressed('CONFIRM') && !input.justPressed('BACK')) return;
    if (this.opts.toTitle) this.game.scenes.popTo('TITLE');
    else this.game.scenes.pop();
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NIGHT);
    drawHeader(r, 'HIGH SCORES');
    const data = this.game.store.data;
    const table = data.highScores.championship;
    const blink = Math.floor(this.time / RECORDS.NEW_RECORD_FLASH) % 2 === 0;

    // Left: championship top 10.
    r.text('CHAMPIONSHIP', 16, 30, PALETTE.GREY);
    for (let i = 0; i < RECORDS.HIGH_SCORES_KEPT; i++) {
      const y = 42 + i * 11;
      const h = table[i];
      const isNew = i === this.opts.highlight;
      if (isNew && !blink) continue;
      const colour = isNew ? PALETTE.YELLOW : PALETTE.WHITE;
      r.text(`${String(i + 1).padStart(2, ' ')}`, 16, y, PALETTE.GREY_LIGHT);
      r.text(h ? h.initials : '---', 40, y, colour);
      r.text(h ? String(h.score).padStart(5, ' ') : '    -', 72, y, colour);
      if (h) r.text(h.difficulty[0].toUpperCase(), 120, y, PALETTE.GREY);
    }

    // Right: personal bests per event.
    r.text('YOUR BESTS', 168, 30, PALETTE.GREY);
    CHAMPIONSHIP_EVENTS.forEach((id, i) => {
      const y = 42 + i * 24;
      r.text(EVENT_NAMES[id], 168, y, PALETTE.GREY_LIGHT);
      r.text(formatMark(id, data.personalBests[id] ?? null), 176, y + 10, PALETTE.YELLOW);
    });

    if (!this.game.store.persistent) r.text('(SAVING IS OFF IN THIS BROWSER)', r.width / 2, 156, PALETTE.RED, 'center');
    r.text('ENTER: OK', r.width / 2, 168, PALETTE.GREY_LIGHT, 'center');
  }
}
