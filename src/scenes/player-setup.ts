import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { Difficulty, EventId } from '../events/event';
import { playerLook } from '../events/cpu';
import { CHAMPIONSHIP_EVENTS } from '../game/championship';
import { EVENT_NAMES } from '../game/scoring';
import { Session } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { AthleteSprites, TEAM_KITS, type TeamKit } from '../gfx/sprites/athlete';
import { InitialsEntry, cycle, drawHeader, leftRight, moveSelection } from '../ui/widgets';
import { EventIntroScene } from './event-intro';

const TEAMS = Object.keys(TEAM_KITS) as TeamKit[];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const VERSUS_EVENTS: (EventId | 'all')[] = ['all', ...CHAMPIONSHIP_EVENTS];

type Row = 'PLAYERS' | 'P1 NAME' | 'P1 TEAM' | 'P2 NAME' | 'P2 TEAM' | 'EVENTS' | 'DIFFICULTY' | 'START';

/**
 * Setup before a championship (1 or 2 players) or Versus (always 2 players,
 * plus a choice of all four events or just one).
 */
export class PlayerSetupScene implements Scene {
  readonly name = 'SETUP';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private row = 0;
  private editing: InitialsEntry | null = null;
  private time = 0;
  private players: number;
  private readonly names: InitialsEntry[];
  private readonly teams: TeamKit[];
  private difficulty: Difficulty;
  private events: EventId | 'all';
  private sprites: AthleteSprites[] = [];

  constructor(
    private readonly game: Game,
    private readonly mode: 'championship' | 'versus' = 'championship',
  ) {
    const s = game.store.data.settings;
    this.players = mode === 'versus' ? 2 : s.players;
    this.names = [new InitialsEntry(s.initials), new InitialsEntry(s.p2Initials)];
    this.teams = [s.team, s.p2Team === s.team ? cycle(TEAMS, s.team, 1) : s.p2Team];
    this.difficulty = s.difficulty;
    this.events = s.versusEvent;
    this.refreshSprites();
  }

  /** The rows on screen right now (P2 rows only with two players). */
  private get rows(): Row[] {
    const rows: Row[] = [];
    if (this.mode === 'championship') rows.push('PLAYERS');
    rows.push('P1 NAME', 'P1 TEAM');
    if (this.players === 2) rows.push('P2 NAME', 'P2 TEAM');
    if (this.mode === 'versus') rows.push('EVENTS');
    rows.push('DIFFICULTY', 'START');
    return rows;
  }

  private refreshSprites(): void {
    this.sprites = this.teams.map((t) => new AthleteSprites(playerLook(t)));
  }

  /** Change a player's team, never to the other player's colour. */
  private changeTeam(p: number, step: number): void {
    let team = cycle(TEAMS, this.teams[p], step);
    if (this.players === 2 && team === this.teams[1 - p]) team = cycle(TEAMS, team, step);
    this.teams[p] = team;
    this.refreshSprites();
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (this.editing) {
      const entry = this.editing;
      entry.update(input);
      if (entry.done || (input.justPressed('BACK') && entry.position === 0)) {
        entry.done = false;
        entry.position = 0;
        this.editing = null;
      }
      return;
    }
    if (input.justPressed('BACK')) {
      this.game.scenes.pop();
      return;
    }
    const rows = this.rows;
    this.row = moveSelection(input, Math.min(this.row, rows.length - 1), rows.length);
    const row = rows[this.row];
    const step = leftRight(input);
    if (step !== 0) {
      if (row === 'PLAYERS') {
        this.players = this.players === 1 ? 2 : 1;
        if (this.teams[0] === this.teams[1]) this.changeTeam(1, 1);
      } else if (row === 'P1 TEAM') this.changeTeam(0, step);
      else if (row === 'P2 TEAM') this.changeTeam(1, step);
      else if (row === 'EVENTS') this.events = cycle(VERSUS_EVENTS, this.events, step);
      else if (row === 'DIFFICULTY') this.difficulty = cycle(DIFFICULTIES, this.difficulty, step);
    }
    if (!input.justPressed('CONFIRM')) return;
    if (row === 'P1 NAME') this.editing = this.names[0];
    else if (row === 'P2 NAME') this.editing = this.names[1];
    else if (row === 'START') this.start();
    else this.row = Math.min(this.row + 1, rows.length - 1);
  }

  private start(): void {
    const g = this.game;
    const s = g.store.data.settings;
    s.initials = this.names[0].value;
    s.team = this.teams[0];
    s.p2Initials = this.names[1].value;
    s.p2Team = this.teams[1];
    s.difficulty = this.difficulty;
    if (this.mode === 'championship') s.players = this.players;
    else s.versusEvent = this.events;
    g.store.save();

    const players = [{ initials: s.initials, team: s.team }];
    if (this.players === 2) players.push({ initials: s.p2Initials, team: s.p2Team });
    const events = this.mode === 'versus' && this.events !== 'all' ? [this.events] : CHAMPIONSHIP_EVENTS;
    const session = new Session(this.mode, players, s.difficulty, s.casual, events);
    g.session = session;
    g.scenes.replace(new EventIntroScene(g, session, session.series!.currentEvent));
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NAVY);
    drawHeader(r, this.mode === 'versus' ? 'VERSUS SETUP' : 'PLAYER SETUP');
    const rows = this.rows;
    const labelX = 32;
    const valueX = 150;
    const lineH = rows.length > 6 ? 15 : 17;
    rows.forEach((row, i) => {
      const y = 34 + i * lineH;
      const selected = i === this.row;
      if (selected) r.text('>', labelX - 14, y, PALETTE.YELLOW);
      r.text(row, labelX, y, selected ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
      this.drawValue(r, row, valueX, y);
    });

    const row = rows[Math.min(this.row, rows.length - 1)];
    const help = this.editing
      ? 'UP/DOWN LETTER  L/R MOVE  ENTER OK'
      : row.endsWith('NAME')
        ? 'ENTER: EDIT NAME'
        : row === 'START'
          ? 'ENTER: START'
          : 'LEFT/RIGHT: CHANGE';
    r.text(help, r.width / 2, 156, PALETTE.YELLOW, 'center');
    r.text('ESC: BACK', r.width / 2, 168, PALETTE.GREY_LIGHT, 'center');
  }

  private drawValue(r: Renderer, row: Row, x: number, y: number): void {
    switch (row) {
      case 'PLAYERS':
        r.text(`< ${this.players} >`, x, y, PALETTE.WHITE);
        break;
      case 'P1 NAME':
      case 'P2 NAME': {
        const p = row === 'P1 NAME' ? 0 : 1;
        const entry = this.names[p];
        if (this.editing === entry) entry.render(r, x + 28, y - 5, this.time, true);
        else r.text(entry.value, x, y, PALETTE.WHITE);
        break;
      }
      case 'P1 TEAM':
      case 'P2 TEAM': {
        const p = row === 'P1 TEAM' ? 0 : 1;
        r.text(`< ${this.teams[p]} >`, x, y, PALETTE.WHITE);
        r.image(this.sprites[p].get('stand'), 292, y - 14);
        break;
      }
      case 'EVENTS':
        r.text(`< ${this.events === 'all' ? 'ALL FOUR' : EVENT_NAMES[this.events]} >`, x - 24, y, PALETTE.WHITE);
        break;
      case 'DIFFICULTY':
        r.text(`< ${this.difficulty} >`, x, y, PALETTE.WHITE);
        break;
      case 'START':
        break;
    }
  }
}
