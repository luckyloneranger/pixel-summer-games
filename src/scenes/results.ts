import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { EventId, EventResult } from '../events/event';
import { updatePersonalBest } from '../game/records';
import { EVENT_KIND, EVENT_NAMES, scoreResults } from '../game/scoring';
import type { Session } from '../game/session';
import { RECORDS } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { drawHeader } from '../ui/widgets';
import { EventIntroScene } from './event-intro';
import { GameOverScene } from './game-over';
import { PodiumScene } from './podium';

const PLACES = ['1ST', '2ND', '3RD', '4TH'];
export const MEDAL_COLOURS = [PALETTE.YELLOW, PALETTE.GREY_LIGHT, PALETTE.ORANGE];
const MEDAL_NAMES = ['GOLD MEDAL!', 'SILVER MEDAL!', 'BRONZE MEDAL!'];
const HEADER_Y = 36;
const ROW_H = 12;

/**
 * Event results: marks, points, your medal, and (in a championship) whether
 * you qualified. Scoring, the championship totals and personal bests are
 * all updated once, when this screen is created.
 */
export class ResultsScene implements Scene {
  readonly name = 'RESULTS';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private readonly results: EventResult[];
  private readonly qualified: boolean;
  private readonly newRecord: boolean;
  private time = 0;

  constructor(
    private readonly game: Game,
    private readonly session: Session,
    private readonly eventId: EventId,
    raw: EventResult[],
  ) {
    const champ = session.championship;
    if (champ) {
      const outcome = champ.record(raw);
      this.results = outcome.results;
      this.qualified = outcome.qualified;
    } else {
      this.results = scoreResults(eventId, raw);
      this.qualified = true;
    }
    const mine = this.results.find((r) => r.playerIndex === 0);
    const mark = mine && !mine.disqualified ? mine.mark : null;
    this.newRecord = updatePersonalBest(game.store.data.personalBests, eventId, mark);
    if (this.newRecord) game.store.save();
    // A jingle for a new record, otherwise a fanfare for a medal.
    const place = this.results.findIndex((r) => r.playerIndex === 0);
    if (this.newRecord) game.sfx('newRecord');
    else if (mark !== null && place >= 0 && place < 3) game.sfx('medal');
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    const g = this.game;
    const champ = this.session.championship;
    if (!champ) {
      // Practice: try again, or back to the event list.
      if (input.justPressed('CONFIRM')) g.scenes.replace(new EventIntroScene(g, this.session, this.eventId));
      else if (input.justPressed('BACK')) g.scenes.pop();
      return;
    }
    if (!input.justPressed('CONFIRM')) return;
    if (champ.state === 'complete') g.scenes.replace(new PodiumScene(g, this.session));
    else if (champ.state === 'gameOver') g.scenes.replace(new GameOverScene(g, this.session));
    else g.scenes.replace(new EventIntroScene(g, this.session, champ.currentEvent));
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NIGHT);
    drawHeader(r, EVENT_NAMES[this.eventId]);
    if (EVENT_KIND[this.eventId] === 'field') this.drawFieldTable(r);
    else this.drawRaceTable(r);
    this.drawFooter(r);
  }

  /** Columns: place, lane, name, time, points. */
  private drawRaceTable(r: Renderer): void {
    const cols = [24, 72, 112, 176, 248];
    this.header(r, cols, ['POS', 'LANE', 'NAME', 'TIME', 'PTS']);
    this.results.forEach((res, i) => {
      const { y, colour } = this.row(r, res, i, cols[0]);
      r.text(String(res.lane ?? '-'), cols[1] + 8, y, colour, 'center');
      r.text(res.name, cols[2], y, colour);
      r.text(res.disqualified ? 'DQ' : fmt(res.mark), cols[3], y, colour);
      r.text(String(res.points), cols[4], y, colour);
    });
  }

  /** Columns: place, name, attempts 1-3 (X = foul), best, points. */
  private drawFieldTable(r: Renderer): void {
    const cols = [12, 48, 92, 140, 188, 236, 284];
    this.header(r, cols, ['POS', 'NAME', '1', '2', '3', 'BEST', 'PTS']);
    this.results.forEach((res, i) => {
      const { y, colour } = this.row(r, res, i, cols[0]);
      r.text(res.name, cols[1], y, colour);
      const attempts = res.attempts ?? [];
      for (let a = 0; a < 3; a++) {
        const m = attempts[a];
        const text = a >= attempts.length ? '-' : m === null ? 'X' : m.toFixed(2);
        r.text(text, cols[2 + a], y, m === null ? PALETTE.RED : colour);
      }
      r.text(fmt(res.mark), cols[5], y, colour);
      r.text(String(res.points), cols[6], y, colour);
    });
  }

  private header(r: Renderer, cols: number[], labels: string[]): void {
    labels.forEach((label, i) => r.text(label, cols[i], HEADER_Y, PALETTE.GREY));
    r.rect(8, HEADER_Y + 10, r.width - 16, 1, PALETTE.GREY_DARK);
  }

  /** Row highlight and place; returns the row's y and text colour. */
  private row(r: Renderer, res: EventResult, i: number, placeX: number): { y: number; colour: string } {
    const y = HEADER_Y + 15 + i * ROW_H;
    const isPlayer = res.playerIndex >= 0;
    if (isPlayer) r.rect(8, y - 2, r.width - 16, 11, PALETTE.NAVY);
    const colour = isPlayer ? PALETTE.YELLOW : PALETTE.WHITE;
    const hasMark = !res.disqualified && res.mark !== null;
    r.text(hasMark ? PLACES[i] : '-', placeX, y, hasMark && i < 3 ? MEDAL_COLOURS[i] : colour);
    return { y, colour };
  }

  private drawFooter(r: Renderer): void {
    const cx = r.width / 2;
    const place = this.results.findIndex((res) => res.playerIndex === 0);
    const mine = this.results[place];
    const medalled = mine && !mine.disqualified && mine.mark !== null && place < 3;
    if (medalled) r.text(MEDAL_NAMES[place], cx, 102, MEDAL_COLOURS[place], 'center');
    const blink = Math.floor(this.time / RECORDS.NEW_RECORD_FLASH) % 2 === 0;
    if (this.newRecord && blink) r.text('NEW RECORD!', cx, 114, PALETTE.CYAN, 'center');

    const champ = this.session.championship;
    if (!champ) {
      r.text('ENTER: TRY AGAIN  ESC: BACK', cx, 164, PALETTE.GREY_LIGHT, 'center');
      return;
    }
    if (this.qualified) r.text('QUALIFIED!', cx, 128, PALETTE.GREEN, 'center', 1);
    else if (champ.casual) r.text('NOT QUALIFIED - 0 POINTS', cx, 128, PALETTE.RED, 'center');
    else r.text('NOT QUALIFIED', cx, 128, PALETTE.RED, 'center');
    r.text(`TOTAL ${champ.playerTotal}`, cx, 142, PALETTE.WHITE, 'center');
    const next = champ.state === 'playing' ? 'ENTER: NEXT EVENT' : 'ENTER: CONTINUE';
    r.text(next, cx, 164, PALETTE.GREY_LIGHT, 'center');
  }
}

function fmt(mark: number | null): string {
  return mark === null ? '-' : mark.toFixed(2);
}
