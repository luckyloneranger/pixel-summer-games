import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { insertHighScore, makesHighScores } from '../game/records';
import type { Session } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { InitialsEntry, drawHeader } from '../ui/widgets';
import { HighScoresScene, type ScoreTable } from './high-scores';

/** One player waiting to enter a high score. */
interface PendingEntry {
  initials: string;
  score: number;
  playerNumber: number; // 1 or 2, for the "PLAYER 2" label
}

/**
 * After a championship or Versus ends: each human whose total makes the
 * top 10 enters their initials (one after the other), then the table shows.
 */
export function finishSeries(game: Game, session: Session): void {
  // Nine-event totals get their own table: they're far higher than five-event ones.
  const table: ScoreTable = session.mode === 'versus' ? 'versus' : (session.series?.events.length ?? 5) > 5 ? 'allNine' : 'championship';
  const scores = game.store.data.highScores[table];
  const local = session.online?.localIndex;
  session.online?.conn.close(); // the match is over
  const queue: PendingEntry[] = session.players
    .map((p, i) => ({ initials: p.initials, score: session.series?.playerTotal(i) ?? 0, playerNumber: i + 1 }))
    .filter((e) => local === undefined || e.playerNumber - 1 === local) // online: only your own score
    .filter((e) => makesHighScores(scores, e.score))
    .sort((a, b) => b.score - a.score);
  game.session = null;
  if (queue.length) game.scenes.replace(new HighScoreEntryScene(game, session, table, queue, []));
  else game.scenes.replace(new HighScoresScene(game, { toTitle: true, table }));
}

/** Arcade-style initials entry for a new high score. */
export class HighScoreEntryScene implements Scene {
  readonly name = 'HIGH SCORE ENTRY';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private readonly entry: InitialsEntry;
  private time = 0;

  constructor(
    private readonly game: Game,
    private readonly session: Session,
    private readonly table: ScoreTable,
    private readonly queue: PendingEntry[],
    /** Table rows added so far this time, to highlight. */
    private readonly added: number[],
  ) {
    this.entry = new InitialsEntry(queue[0].initials);
  }

  private get current(): PendingEntry {
    return this.queue[0];
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.entry.update(input);
    if (!this.entry.done) return;
    const store = this.game.store;
    const { table, position } = insertHighScore(store.data.highScores[this.table], {
      initials: this.entry.value,
      score: this.current.score,
      difficulty: this.session.difficulty,
      events: this.session.series?.events.length,
    });
    store.data.highScores[this.table] = table;
    store.save();
    // An earlier entry at or below this position moves down one row.
    const added = [...this.added.map((p) => (p >= position ? p + 1 : p)), position];
    const rest = this.queue.slice(1);
    const g = this.game;
    if (rest.length) g.scenes.replace(new HighScoreEntryScene(g, this.session, this.table, rest, added));
    else g.scenes.replace(new HighScoresScene(g, { toTitle: true, table: this.table, highlight: added }));
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    r.clear(PALETTE.NIGHT);
    drawHeader(r, 'NEW HIGH SCORE');
    if (this.session.players.length > 1) r.text(`PLAYER ${this.current.playerNumber}`, cx, 32, PALETTE.CYAN, 'center');
    r.text(String(this.current.score), cx, 46, PALETTE.YELLOW, 'center', 2);
    r.text('ENTER YOUR INITIALS', cx, 76, PALETTE.WHITE, 'center');
    this.entry.render(r, cx, 96, this.time, true, this.game.steady);
    r.text(this.game.prompts.letters(), cx, 150, PALETTE.GREY_LIGHT, 'center');
  }
}
