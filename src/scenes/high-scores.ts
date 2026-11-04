import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { ALL_EVENTS } from '../game/championship';
import type { EventId } from '../events/event';
import type { HighScore } from '../game/records';
import { fetchBoard, onBoard } from '../net/leaderboard';
import type { BoardEntry } from '../net/leaderboard-rules';
import { EVENT_NAMES, formatMark } from '../game/scoring';
import { RECORDS } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { drawHeader, leftRight, moveSelection } from '../ui/widgets';

/** Short event names, so a name and a mark fit on one line of the right column. */
const SHORT_NAMES: Record<EventId, string> = {
  dash100: '100 M',
  longJump: 'LONG J',
  highJump: 'HIGH J',
  javelin: 'JAVELIN',
  hurdles110: 'HURDLES',
  tripleJump: 'TRIPLE',
  poleVault: 'POLE V',
  hammer: 'HAMMER',
  swim50: 'SWIM 50',
};

/** The two tables kept in this browser. */
export type ScoreTable = 'championship' | 'versus';
/** What the screen can show: those, or the weekly online board. */
type View = ScoreTable | 'week';
const TABLES: View[] = ['championship', 'versus', 'week'];
const TABLE_NAMES: Record<View, string> = { championship: 'CHAMPIONSHIP', versus: 'VERSUS', week: 'ONLINE WEEK' };
/** Events on the weekly board, in menu order. */
const BOARD_LIST = ALL_EVENTS.filter((id) => onBoard(id));

type BoardState = 'loading' | 'failed' | { week: string; rows: BoardEntry[] };

/** Top 10 scores (championship or versus, left/right to switch) and personal bests. */
export class HighScoresScene implements Scene {
  readonly name = 'HIGH SCORES';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private time = 0;
  private table: View;
  private boardEvent = 0; // index into BOARD_LIST
  private readonly boards = new Map<EventId, BoardState>();

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
    if (step !== 0) this.table = TABLES[(TABLES.indexOf(this.table) + step + TABLES.length) % TABLES.length];
    if (this.table === 'week') {
      this.boardEvent = moveSelection(input, this.boardEvent, BOARD_LIST.length);
      this.loadBoard();
    }
    if (!input.justPressed('CONFIRM') && !input.justPressed('BACK')) return;
    if (this.opts.toTitle) this.game.scenes.popTo('TITLE');
    else this.game.scenes.pop();
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NIGHT);
    drawHeader(r, 'HIGH SCORES');
    const data = this.game.store.data;
    const rows = this.table === 'week' ? [] : data.highScores[this.table];
    const flash = !data.settings.reduceFlashing && Math.floor(this.time / RECORDS.NEW_RECORD_FLASH) % 2 === 1;
    const highlight = this.table === this.opts.table ? (this.opts.highlight ?? []) : [];

    // Left: the chosen top-10 table.
    r.text(`< ${TABLE_NAMES[this.table]} >`, 8, 30, PALETTE.GREY);
    if (this.table === 'week') this.drawBoard(r);
    else this.drawTable(r, rows, highlight, flash);
    // Right: personal bests per event.
    r.text('YOUR BESTS', 168, 30, PALETTE.GREY);
    ALL_EVENTS.forEach((id, i) => {
      const y = 42 + i * 12;
      r.text(SHORT_NAMES[id], 168, y, PALETTE.GREY_LIGHT);
      r.text(formatMark(id, data.personalBests[id] ?? null), 316, y, PALETTE.YELLOW, 'right');
    });

    if (!this.game.store.persistent) r.text('(SAVING IS OFF)', 304, 156, PALETTE.RED, 'right');
    r.text(`${this.game.prompts.leftRight()}: TABLE  ${this.game.prompts.okTo('DONE')}`, r.width / 2, 168, PALETTE.GREY_LIGHT, 'center');
  }

  private drawTable(r: Renderer, rows: readonly HighScore[], highlight: number[], flash: boolean): void {
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

  }

  /** Fetch this week's board for the chosen event (once; only if the player opted in). */
  private loadBoard(): void {
    const id = BOARD_LIST[this.boardEvent];
    if (!this.game.store.data.settings.leaderboard || this.boards.has(id)) return;
    this.boards.set(id, 'loading');
    void fetchBoard(id).then((b) => this.boards.set(id, b ?? 'failed'));
  }

  /** The weekly online top 10 for one event (up/down to change event). */
  private drawBoard(r: Renderer): void {
    const id = BOARD_LIST[this.boardEvent];
    r.text(`↑↓ ${EVENT_NAMES[id]}`, 8, 42, PALETTE.CYAN); // arrows, not words: long names must fit
    const say = (text: string) => r.text(text, 16, 62, PALETTE.GREY_LIGHT);
    if (!this.game.store.data.settings.leaderboard) {
      say('TURN ON LEADERBOARD');
      r.text('IN OPTIONS TO SEE IT', 16, 72, PALETTE.GREY_LIGHT);
      return;
    }
    const b = this.boards.get(id);
    if (b === undefined || b === 'loading') return say('LOADING...');
    if (b === 'failed') return say('COULD NOT CONNECT');
    if (!b.rows.length) return say('NO MARKS YET THIS WEEK');
    b.rows.forEach((row, i) => {
      const y = 54 + i * 10;
      r.text(String(i + 1).padStart(2, ' '), 16, y, PALETTE.GREY_LIGHT);
      r.text(row.initials, 40, y, PALETTE.WHITE);
      r.text(formatMark(id, row.mark), 72, y, PALETTE.YELLOW);
    });
    r.text(b.week, 16, 156, PALETTE.GREY);
  }
}
