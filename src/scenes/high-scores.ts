import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { CHAMPIONSHIP_EVENTS } from '../game/championship';
import { EVENT_NAMES, formatMark } from '../game/scoring';
import { RECORDS } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { drawHeader, leftRight } from '../ui/widgets';

export type ScoreTable = 'championship' | 'versus';
const TABLES: ScoreTable[] = ['championship', 'versus'];

/** Top 10 scores (championship or versus, left/right to switch) and personal bests. */
export class HighScoresScene implements Scene {
  readonly name = 'HIGH SCORES';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private time = 0;
  private table: ScoreTable;

  constructor(
    private readonly game: Game,
    /** toTitle: leaving goes back to the title. highlight: new rows to flash. */
    private readonly opts: { toTitle: boolean; table?: ScoreTable; highlight?: number[] },
  ) {
    this.table = opts.table ?? 'championship';
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    const step = leftRight(input);
    if (step !== 0) this.table = TABLES[(TABLES.indexOf(this.table) + 1) % TABLES.length];
    if (!input.justPressed('CONFIRM') && !input.justPressed('BACK')) return;
    if (this.opts.toTitle) this.game.scenes.popTo('TITLE');
    else this.game.scenes.pop();
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NIGHT);
    drawHeader(r, 'HIGH SCORES');
    const data = this.game.store.data;
    const rows = data.highScores[this.table];
    const flash = !data.settings.reduceFlashing && Math.floor(this.time / RECORDS.NEW_RECORD_FLASH) % 2 === 1;
    const highlight = this.table === this.opts.table ? (this.opts.highlight ?? []) : [];

    // Left: the chosen top-10 table.
    r.text(`< ${this.table === 'versus' ? 'VERSUS' : 'CHAMPIONSHIP'} >`, 8, 30, PALETTE.GREY);
    for (let i = 0; i < RECORDS.HIGH_SCORES_KEPT; i++) {
      const y = 42 + i * 11;
      const h = rows[i];
      const isNew = highlight.includes(i);
      if (isNew && flash) continue;
      const colour = isNew ? PALETTE.YELLOW : PALETTE.WHITE;
      r.text(`${String(i + 1).padStart(2, ' ')}`, 16, y, PALETTE.GREY_LIGHT);
      r.text(h ? h.initials : '---', 40, y, colour);
      r.text(h ? String(h.score).padStart(5, ' ') : '    -', 72, y, colour);
      if (h) r.text(h.difficulty[0].toUpperCase(), 120, y, PALETTE.GREY);
      if (h && this.table === 'championship' && h.events === undefined) r.text('*', 132, y, PALETTE.GREY);
    }
    if (this.table === 'championship' && rows.some((h) => h.events === undefined)) {
      r.text('* 4-EVENT RUN', 16, 156, PALETTE.GREY);
    }

    // Right: personal bests per event.
    r.text('YOUR BESTS', 168, 30, PALETTE.GREY);
    CHAMPIONSHIP_EVENTS.forEach((id, i) => {
      const y = 42 + i * 21;
      r.text(EVENT_NAMES[id], 168, y, PALETTE.GREY_LIGHT);
      r.text(formatMark(id, data.personalBests[id] ?? null), 176, y + 10, PALETTE.YELLOW);
    });

    if (!this.game.store.persistent) r.text('(SAVING IS OFF)', 304, 156, PALETTE.RED, 'right');
    r.text('LEFT/RIGHT: TABLE  ENTER: OK', r.width / 2, 168, PALETTE.GREY_LIGHT, 'center');
  }
}
