import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { EventId, EventResult } from '../events/event';
import type { EventOutcome } from '../game/championship';
import { updatePersonalBest } from '../game/records';
import { EVENT_KIND, EVENT_NAMES, scoreResults } from '../game/scoring';
import type { Session } from '../game/session';
import { RECORDS } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { blink, drawHeader } from '../ui/widgets';
import { EventIntroScene } from './event-intro';
import { GameOverScene } from './game-over';
import { PodiumScene } from './podium';
import { VersusResultScene } from './versus-result';

const PLACES = ['1ST', '2ND', '3RD', '4TH', '5TH'];
export const MEDAL_COLOURS = [PALETTE.YELLOW, PALETTE.GREY_LIGHT, PALETTE.ORANGE];
const MEDAL_NAMES = ['GOLD MEDAL!', 'SILVER MEDAL!', 'BRONZE MEDAL!'];
const HEADER_Y = 36;
const ROW_H = 12;

/**
 * Event results: marks, points, medals and (in a championship) who qualified.
 * Scoring, the series totals and personal bests are all updated once, when
 * this screen is created.
 */
export class ResultsScene implements Scene {
  readonly name = 'RESULTS';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private readonly results: EventResult[];
  private readonly outcome: EventOutcome | null;
  private readonly newRecord: boolean;
  private time = 0;

  constructor(
    private readonly game: Game,
    private readonly session: Session,
    private readonly eventId: EventId,
    raw: EventResult[],
  ) {
    const series = session.series;
    this.outcome = series ? series.record(raw) : null;
    this.results = this.outcome ? this.outcome.results : scoreResults(eventId, raw);

    // Personal bests are kept per browser: any human's mark can set one.
    let improved = false;
    for (const r of this.humans) {
      const mark = r.disqualified ? null : r.mark;
      if (updatePersonalBest(game.store.data.personalBests, eventId, mark)) improved = true;
    }
    this.newRecord = improved;
    if (improved) game.store.save();

    // A jingle for a new record, otherwise a fanfare for a medal.
    const medalled = this.humans.some((r) => this.medalPlace(r) >= 0);
    if (this.newRecord) game.sfx('newRecord');
    else if (medalled) game.sfx('medal');
  }

  private get humans(): EventResult[] {
    return this.results.filter((r) => r.playerIndex >= 0);
  }

  /** 0-2 for a medal, -1 for none. */
  private medalPlace(res: EventResult): number {
    const place = this.results.indexOf(res);
    return !res.disqualified && res.mark !== null && place < 3 ? place : -1;
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    const g = this.game;
    const series = this.session.series;
    if (!series) {
      // Practice: try again, or back to the event list.
      if (input.justPressed('CONFIRM')) g.scenes.replace(new EventIntroScene(g, this.session, this.eventId));
      else if (input.justPressed('BACK')) g.scenes.pop();
      return;
    }
    if (!input.justPressed('CONFIRM')) return;
    if (series.state === 'gameOver') g.scenes.replace(new GameOverScene(g, this.session));
    else if (series.state === 'complete') {
      if (this.session.mode === 'versus') g.scenes.replace(new VersusResultScene(g, this.session));
      else g.scenes.replace(new PodiumScene(g, this.session));
    } else g.scenes.replace(new EventIntroScene(g, this.session, series.currentEvent));
  }

  /** The table as text (debug overlay; the online test compares both screens). */
  debugLines(): string[] {
    return this.results.map((res) => `${res.name} ${fmt(res.mark)} ${(res.attempts ?? []).map((m) => fmt(m)).join(' ')}`);
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NIGHT);
    drawHeader(r, EVENT_NAMES[this.eventId]);
    if (this.eventId === 'highJump') this.drawHeightTable(r);
    else if (EVENT_KIND[this.eventId] === 'field') this.drawFieldTable(r);
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
      r.text(res.disqualified ? 'DQ' : res.dnf ? 'DNF' : fmt(res.mark), cols[3], y, colour);
      r.text(String(res.points), cols[4], y, colour);
    });
  }

  /** High jump. Columns: place, name, best height cleared, misses, points. */
  private drawHeightTable(r: Renderer): void {
    const cols = [24, 72, 136, 200, 256];
    this.header(r, cols, ['POS', 'NAME', 'BEST', 'MISSES', 'PTS']);
    this.results.forEach((res, i) => {
      const { y, colour } = this.row(r, res, i, cols[0]);
      r.text(res.name, cols[1], y, colour);
      r.text(fmt(res.mark), cols[2], y, colour);
      // Misses are known for humans (their jump list); CPU marks are a single best.
      const misses = res.playerIndex >= 0 ? String((res.attempts ?? []).filter((m) => m === null).length) : '-';
      r.text(misses, cols[3] + 16, y, colour, 'center');
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
    const top = HEADER_Y + 15 + this.results.length * ROW_H + 4;
    const humans = this.humans;
    const show = blink(this.time, RECORDS.NEW_RECORD_FLASH * 2, this.game.steady);

    if (humans.length === 1) {
      const m = this.medalPlace(humans[0]);
      if (m >= 0) r.text(MEDAL_NAMES[m], cx, top, MEDAL_COLOURS[m], 'center');
    }
    if (this.newRecord && show) r.text('NEW RECORD!', cx, top + 12, PALETTE.CYAN, 'center');

    const series = this.session.series;
    if (!series || !this.outcome) {
      r.text(this.game.prompts.hint(this.game.prompts.okTo('TRY AGAIN'), this.game.prompts.backTo()), cx, 166, PALETTE.GREY_LIGHT, 'center');
      return;
    }
    // One line per human: qualified (championship) and running total.
    humans.forEach((res, i) => {
      const y = top + 26 + i * 11;
      const total = series.playerTotal(res.playerIndex);
      let status = '';
      let colour: string = PALETTE.WHITE;
      if (series.qualifying) {
        const ok = this.outcome!.qualifiedPlayers[res.playerIndex];
        status = ok ? 'QUALIFIED' : series.casual ? 'MISSED - 0 PTS' : 'OUT';
        colour = ok ? PALETTE.GREEN : PALETTE.RED;
      }
      const label = humans.length > 1 || status ? `${res.name} ` : '';
      r.text(`${label}${status}`, cx - 8, y, colour, 'right');
      r.text(`TOTAL ${total}`, cx + 8, y, PALETTE.WHITE);
    });
    const next = this.game.prompts.okTo(series.state === 'playing' ? 'NEXT EVENT' : 'CONTINUE');
    r.text(next, cx, 166, PALETTE.GREY_LIGHT, 'center');
  }
}

function fmt(mark: number | null): string {
  return mark === null ? '-' : mark.toFixed(2);
}
