import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { Session } from '../game/session';
import { NET } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { RoomConnection } from '../net/connection';
import { isSeriesSnapshot } from '../net/protocol';
import { clearRejoin, saveRejoin, type RejoinRecord } from '../net/rejoin';
import { drawHeader } from '../ui/widgets';
import { EventIntroScene } from './event-intro';
import { MenuScene } from './menu';

/**
 * After a page reload in the middle of an online match: reconnect to the same
 * seat straight away, ask the friend's game where the match is, and carry on
 * from the intro card of the event that was being played.
 */
export class RejoinScene implements Scene {
  readonly name = 'REJOIN';
  readonly isMenu = true;
  private readonly conn: RoomConnection;
  private asked = false;
  private time = 0;
  private error = '';

  constructor(
    private readonly game: Game,
    private readonly record: RejoinRecord,
  ) {
    this.conn = new RoomConnection(record.code, undefined, undefined, record);
    this.conn.onCounters = (c) => saveRejoin({ ...this.record, ...c, savedAt: Date.now() });
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    const g = this.game;
    if (input.justPressed('BACK') || (this.error && input.justPressed('CONFIRM'))) {
      if (!this.error) this.conn.close(); // leaving on purpose tells the friend
      clearRejoin();
      g.scenes.replace(new MenuScene(g));
      return;
    }
    if (this.error) return;
    const c = this.conn;
    if (c.state === 'failed' || c.state === 'full' || c.state === 'lost' || this.time > NET.RECONNECT_WINDOW) {
      this.error = 'COULD NOT REJOIN THE MATCH';
      return;
    }
    if (c.state !== 'open' || !c.peerHere) return;
    if (!this.asked) {
      c.send({ k: 'rejoin' });
      this.asked = true;
    }
    const sync = c.take('sync').find((m) => isSeriesSnapshot(m.s));
    if (!sync) return;
    const r = this.record;
    const session = new Session('versus', r.players, r.difficulty, false, r.events, {
      conn: c,
      localIndex: r.localIndex,
      seed: r.seed,
    });
    session.series!.restore(sync.s);
    if (session.series!.state !== 'playing') {
      // The match finished while we were away.
      clearRejoin();
      c.close();
      g.scenes.replace(new MenuScene(g));
      return;
    }
    g.session = session;
    g.scenes.replace(new MenuScene(g));
    g.scenes.push(new EventIntroScene(g, session, session.series!.currentEvent));
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'ONLINE MATCH');
    const friend = this.record.players[1 - this.record.localIndex]?.initials ?? 'YOUR FRIEND';
    if (this.error) {
      r.text(this.error, cx, 76, PALETTE.RED, 'center');
      r.text(this.game.prompts.pressOk(), cx, 100, PALETTE.WHITE, 'center');
      return;
    }
    r.text(`REJOINING YOUR MATCH WITH ${friend}...`, cx, 76, PALETTE.WHITE, 'center');
    r.text(this.game.prompts.backTo('LEAVE THE MATCH'), cx, this.game.prompts.noteY(166), PALETTE.GREY_LIGHT, 'center');
  }
}
