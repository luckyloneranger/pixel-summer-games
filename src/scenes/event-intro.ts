import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { EventId } from '../events/event';
import { EVENT_HINTS } from '../game/events';
import { EVENT_NAMES, formatMark, qualifyingMark } from '../game/scoring';
import type { Session } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { EventPlayScene } from './event-play';

/** Card shown before each event: name, qualifying mark, controls, your best. */
export class EventIntroScene implements Scene {
  readonly name = 'INTRO';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private time = 0;

  constructor(
    private readonly game: Game,
    private readonly session: Session,
    private readonly eventId: EventId,
  ) {}

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    const g = this.game;
    if (input.justPressed('CONFIRM')) {
      g.scenes.replace(new EventPlayScene(g, this.session, this.eventId));
    } else if (input.justPressed('BACK')) {
      if (this.session.mode === 'practice') g.scenes.pop();
      else g.scenes.popTo('MENU');
    }
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    const s = this.session;
    r.clear(PALETTE.NIGHT);
    r.rect(16, 16, r.width - 32, r.height - 32, PALETTE.NAVY);
    r.rect(16, 16, r.width - 32, 2, PALETTE.YELLOW);
    r.rect(16, r.height - 18, r.width - 32, 2, PALETTE.YELLOW);

    const series = s.series;
    const mode = s.mode === 'versus' ? 'VERSUS - ' : '';
    const header = series ? `${mode}EVENT ${series.index + 1} OF ${series.events.length}` : 'PRACTICE';
    r.text(header, cx, 28, PALETTE.GREY_LIGHT, 'center');
    r.text(EVENT_NAMES[this.eventId], cx, 44, PALETTE.YELLOW, 'center', 2);

    let y = 70;
    if (series?.qualifying) {
      r.text(`QUALIFY  ${formatMark(this.eventId, qualifyingMark(this.eventId, s.difficulty))}`, cx, y, PALETTE.WHITE, 'center');
      y += 12;
    }
    if (series) {
      // Totals so far; a knocked-out player is shown as OUT.
      const line = s.players
        .map((p, i) => `${p.initials} ${series.eliminated.has(i) ? 'OUT' : series.playerTotal(i)}`)
        .join('   ');
      r.text(`TOTAL  ${line}`, cx, y, PALETTE.WHITE, 'center');
      y += 12;
    }
    const best = this.game.store.data.personalBests[this.eventId];
    r.text(`BEST ${best === undefined ? '-' : formatMark(this.eventId, best)}`, cx, y, PALETTE.GREY_LIGHT, 'center');

    const twoPlayers = this.session.activePlayers().length > 1;
    r.text(EVENT_HINTS[this.eventId], cx, 114, PALETTE.CYAN, 'center');
    if (twoPlayers) r.text('P1: A D W     P2: LEFT RIGHT UP', cx, 126, PALETTE.CYAN, 'center');
    if (Math.floor(this.time * 2) % 2 === 0) r.text('PRESS ENTER', cx, 144, PALETTE.WHITE, 'center');
  }
}
