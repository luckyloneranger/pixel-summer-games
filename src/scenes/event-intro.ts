import type { Game } from '../core/game';
import { ALL_EVENTS } from '../game/championship';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { blink } from '../ui/widgets';
import type { EventId } from '../events/event';
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
  /** Online: I've pressed Enter / the other player has. */
  private iAmReady = false;
  private peerReady = false;

  constructor(
    private readonly game: Game,
    private readonly session: Session,
    private readonly eventId: EventId,
  ) {}

  /** A short fanfare as the card comes up (a different pitch for each event). */
  enter(): void {
    this.game.sfx('intro', ALL_EVENTS.indexOf(this.eventId));
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    const g = this.game;
    if (this.session.online) {
      this.updateOnline(input);
      return;
    }
    if (input.justPressed('CONFIRM')) {
      g.scenes.replace(new EventPlayScene(g, this.session, this.eventId));
    } else if (input.justPressed('BACK')) {
      if (this.session.mode === 'practice') g.scenes.pop();
      else g.scenes.popTo('MENU');
    }
  }

  /**
   * Online: both players press Enter; the host then says "begin" and both
   * start together. Leftover messages from the last event are cleared first.
   */
  private updateOnline(input: InputSnapshot): void {
    const g = this.game;
    const online = this.session.online!;
    const conn = online.conn;
    const index = this.session.series?.index ?? 0;
    if (input.justPressed('BACK')) {
      conn.close();
      g.session = null;
      g.scenes.popTo('MENU');
      return;
    }
    if (input.justPressed('CONFIRM') && !this.iAmReady) {
      this.iAmReady = true;
      conn.send({ k: 'ready', event: index });
    }
    if (conn.take('ready').some((m) => m.event === index)) this.peerReady = true;
    const start = () => {
      conn.take('state', 'phase', 'early', 'field'); // anything left over from the previous event
      g.scenes.replace(new EventPlayScene(g, this.session, this.eventId));
    };
    if (online.localIndex === 0) {
      if (this.iAmReady && this.peerReady) {
        conn.send({ k: 'begin', event: index });
        start();
      }
    } else if (conn.take('begin').some((m) => m.event === index)) {
      start();
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

    // Two players on one keyboard: show each one's keys (online, each device has its own).
    const p = this.game.prompts;
    const sharedKeyboard = this.session.activePlayers().length > 1 && !this.session.online && !p.touch;
    r.text(p.eventHint(this.eventId), cx, 114, PALETTE.CYAN, 'center');
    if (sharedKeyboard) {
      r.text(`P1: ${p.run(0)} ${p.action(0)}     P2: ${p.run(1)} ${p.action(1)}`, cx, 126, PALETTE.CYAN, 'center');
    }
    if (this.iAmReady) {
      const other = this.session.players[1 - (this.session.online?.localIndex ?? 0)];
      r.text(`WAITING FOR ${other?.initials ?? 'FRIEND'}...`, cx, 144, PALETTE.CYAN, 'center');
    } else if (blink(this.time, 1, this.game.steady)) {
      r.text(p.pressOk(), cx, 144, PALETTE.WHITE, 'center');
    }
  }
}
