import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { insertHighScore, makesHighScores } from '../game/records';
import type { Session } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { InitialsEntry, drawHeader } from '../ui/widgets';
import { HighScoresScene } from './high-scores';

/** After a championship ends: enter initials if the score made the top 10. */
export function finishChampionship(game: Game, session: Session): void {
  const score = session.championship?.playerTotal ?? 0;
  game.session = null;
  if (makesHighScores(game.store.data.highScores.championship, score)) {
    game.scenes.replace(new HighScoreEntryScene(game, session, score));
  } else {
    game.scenes.replace(new HighScoresScene(game, { toTitle: true }));
  }
}

/** Arcade-style initials entry for a new high score. */
export class HighScoreEntryScene implements Scene {
  readonly name = 'HIGH SCORE ENTRY';
  private readonly entry: InitialsEntry;
  private time = 0;

  constructor(
    private readonly game: Game,
    private readonly session: Session,
    private readonly score: number,
  ) {
    this.entry = new InitialsEntry(session.initials);
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.entry.update(input);
    if (!this.entry.done) return;
    const store = this.game.store;
    const { table, position } = insertHighScore(store.data.highScores.championship, {
      initials: this.entry.value,
      score: this.score,
      difficulty: this.session.difficulty,
    });
    store.data.highScores.championship = table;
    store.save();
    this.game.scenes.replace(new HighScoresScene(this.game, { toTitle: true, highlight: position }));
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    r.clear(PALETTE.NIGHT);
    drawHeader(r, 'NEW HIGH SCORE');
    r.text(String(this.score), cx, 44, PALETTE.YELLOW, 'center', 2);
    r.text('ENTER YOUR INITIALS', cx, 76, PALETTE.WHITE, 'center');
    this.entry.render(r, cx, 96, this.time);
    r.text('UP/DOWN LETTER  L/R MOVE  ENTER OK', cx, 150, PALETTE.GREY_LIGHT, 'center');
  }
}
