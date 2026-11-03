import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { Difficulty } from '../events/event';
import { playerLook } from '../events/cpu';
import { Session } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { AthleteSprites, TEAM_KITS, type TeamKit } from '../gfx/sprites/athlete';
import { InitialsEntry, cycle, drawHeader, leftRight, moveSelection } from '../ui/widgets';
import { EventIntroScene } from './event-intro';

const TEAMS = Object.keys(TEAM_KITS) as TeamKit[];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const ROWS = ['NAME', 'TEAM', 'DIFFICULTY', 'START'] as const;

/** Championship setup: initials, team colour and difficulty. */
export class PlayerSetupScene implements Scene {
  readonly name = 'SETUP';
  private row = 0;
  private editing = false;
  private time = 0;
  private readonly initials: InitialsEntry;
  private team: TeamKit;
  private difficulty: Difficulty;
  private sprites: AthleteSprites;

  constructor(private readonly game: Game) {
    const s = game.store.data.settings;
    this.initials = new InitialsEntry(s.initials);
    this.team = s.team;
    this.difficulty = s.difficulty;
    this.sprites = new AthleteSprites(playerLook(this.team));
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (this.editing) {
      this.initials.update(input);
      if (this.initials.done || (input.justPressed('BACK') && this.initials.position === 0)) {
        this.editing = false;
        this.initials.done = false;
        this.initials.position = 0;
      }
      return;
    }
    if (input.justPressed('BACK')) {
      this.game.scenes.pop();
      return;
    }
    this.row = moveSelection(input, this.row, ROWS.length);
    const step = leftRight(input);
    if (ROWS[this.row] === 'TEAM' && step !== 0) {
      this.team = cycle(TEAMS, this.team, step);
      this.sprites = new AthleteSprites(playerLook(this.team));
    }
    if (ROWS[this.row] === 'DIFFICULTY' && step !== 0) this.difficulty = cycle(DIFFICULTIES, this.difficulty, step);
    if (!input.justPressed('CONFIRM')) return;
    if (ROWS[this.row] === 'NAME') this.editing = true;
    else if (ROWS[this.row] === 'START') this.start();
    else this.row++;
  }

  private start(): void {
    const g = this.game;
    const s = g.store.data.settings;
    s.initials = this.initials.value;
    s.team = this.team;
    s.difficulty = this.difficulty;
    g.store.save();
    const session = new Session('championship', s.initials, s.team, s.difficulty, s.casual);
    g.session = session;
    g.scenes.replace(new EventIntroScene(g, session, session.championship!.currentEvent));
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'PLAYER SETUP');
    const labelX = 40;
    const valueX = 150;
    const rowY = [44, 76, 96, 124];
    ROWS.forEach((label, i) => {
      const selected = i === this.row;
      if (selected) r.text('>', labelX - 14, rowY[i], PALETTE.YELLOW);
      r.text(label, labelX, rowY[i], selected ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
    });
    this.initials.render(r, valueX + 30, rowY[0] - 6, this.time, this.editing);
    r.text(`< ${this.team} >`, valueX, rowY[1], PALETTE.WHITE);
    r.text(`< ${this.difficulty} >`, valueX, rowY[2], PALETTE.WHITE);
    r.image(this.sprites.get('stand'), 270, rowY[1] - 4);

    const help = this.editing
      ? 'UP/DOWN LETTER  L/R MOVE  ENTER OK'
      : ROWS[this.row] === 'NAME'
        ? 'ENTER: EDIT NAME'
        : ROWS[this.row] === 'START'
          ? 'ENTER: START THE CHAMPIONSHIP'
          : 'LEFT/RIGHT: CHANGE';
    r.text(help, r.width / 2, 152, PALETTE.YELLOW, 'center');
    r.text('ESC: BACK', r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}
