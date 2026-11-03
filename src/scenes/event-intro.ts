import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { EventId } from '../events/event';
import { CHAMPIONSHIP_EVENTS } from '../game/championship';
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

    const champ = s.championship;
    const header = champ ? `EVENT ${champ.index + 1} OF ${CHAMPIONSHIP_EVENTS.length}` : 'PRACTICE';
    r.text(header, cx, 28, PALETTE.GREY_LIGHT, 'center');
    r.text(EVENT_NAMES[this.eventId], cx, 46, PALETTE.YELLOW, 'center', 2);

    if (champ) {
      r.text(`QUALIFY  ${formatMark(this.eventId, qualifyingMark(this.eventId, s.difficulty))}`, cx, 78, PALETTE.WHITE, 'center');
      r.text(`TOTAL    ${champ.playerTotal}`, cx, 90, PALETTE.WHITE, 'center');
    }
    const best = this.game.store.data.personalBests[this.eventId];
    r.text(`YOUR BEST ${best === undefined ? '-' : formatMark(this.eventId, best)}`, cx, champ ? 102 : 84, PALETTE.GREY_LIGHT, 'center');

    r.text(EVENT_HINTS[this.eventId], cx, 124, PALETTE.CYAN, 'center');
    if (Math.floor(this.time * 2) % 2 === 0) r.text('PRESS ENTER', cx, 144, PALETTE.WHITE, 'center');
  }
}
