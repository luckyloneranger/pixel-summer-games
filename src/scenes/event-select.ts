import type { Game } from '../core/game';
import { eventIcon } from '../gfx/sprites/icons';
import { drawBackdrop, drawPanel } from '../ui/backdrop';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { Difficulty } from '../events/event';
import { ALL_EVENTS } from '../game/championship';
import { EVENT_NAMES, formatMark } from '../game/scoring';
import { Session } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { cycle, drawHeader, leftRight, moveSelection, rowAt } from '../ui/widgets';
import { EventIntroScene } from './event-intro';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

/** Practice: pick any event (and the CPU difficulty). */
export class EventSelectScene implements Scene {
  readonly name = 'EVENT SELECT';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private row = 0;

  constructor(private readonly game: Game) {}

  update(_dt: number, input: InputSnapshot): void {
    const g = this.game;
    if (input.justPressed('BACK')) {
      g.scenes.pop();
      return;
    }
    const rows = ALL_EVENTS.length + 1;
    this.row = moveSelection(input, this.row, rows);
    const settings = g.store.data.settings;
    const isDifficultyRow = this.row === ALL_EVENTS.length;
    const step = leftRight(input);
    if (isDifficultyRow && step !== 0) {
      settings.difficulty = cycle(DIFFICULTIES, settings.difficulty, step);
      g.store.save();
    }
    if (input.justPressed('CONFIRM') && !isDifficultyRow) {
      const id = ALL_EVENTS[this.row];
      const session = new Session('practice', [{ initials: settings.initials, team: settings.team }], settings.difficulty, false, [id]);
      g.session = session;
      g.scenes.push(new EventIntroScene(g, session, id));
    }
  }

  /** Tap an event to play it; tap the CPU row to pick it. */
  selectAt(_x: number, y: number): boolean {
    const i = rowAt(y, LIST_TOP, ROW_H, ALL_EVENTS.length);
    if (i >= 0) {
      this.row = i;
      return true;
    }
    const dy = LIST_TOP + ALL_EVENTS.length * ROW_H + 3;
    if (y >= dy - 3 && y < dy + 10) this.row = ALL_EVENTS.length;
    return false;
  }

  render(r: Renderer): void {
    drawBackdrop(r);
    drawHeader(r, 'PRACTICE');
    drawPanel(r, 14, 27, 292, LIST_TOP + ALL_EVENTS.length * ROW_H + 16 - 27);
    r.text('EVENT', 40, 31, PALETTE.GREY);
    r.text('YOUR BEST', 200, 31, PALETTE.GREY);
    const bests = this.game.store.data.personalBests;
    ALL_EVENTS.forEach((id, i) => {
      const y = LIST_TOP + i * ROW_H;
      const selected = i === this.row;
      if (selected) r.text('>', 18, y, PALETTE.YELLOW);
      r.image(eventIcon(id), 28, y - 2);
      r.text(EVENT_NAMES[id], 44, y, selected ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
      r.text(formatMark(id, bests[id] ?? null), 200, y, PALETTE.YELLOW);
    });
    const dy = LIST_TOP + ALL_EVENTS.length * ROW_H + 3;
    const sel = this.row === ALL_EVENTS.length;
    if (sel) r.text('>', 26, dy, PALETTE.YELLOW);
    r.text(`CPU DIFFICULTY < ${this.game.store.data.settings.difficulty} >`, 40, dy, sel ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
    r.text(this.game.prompts.hint(this.game.prompts.okTo('PLAY'), this.game.prompts.backTo()), r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}

const LIST_TOP = 43; // px, first event row
const ROW_H = 11; // px between rows (nine events and the CPU row fit)
