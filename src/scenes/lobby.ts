import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { Difficulty, EventId } from '../events/event';
import { RoomConnection, helloMessage } from '../net/connection';
import { PROTOCOL_VERSION, makeRoomCode } from '../net/protocol';
import { EVENT_NAMES } from '../game/scoring';
import { CHAMPIONSHIP_EVENTS, ONLINE_EVENTS } from '../game/championship';
import { Session, type SessionPlayer } from '../game/session';
import { PALETTE } from '../gfx/palette';
import { TEAM_KITS, type TeamKit } from '../gfx/sprites/athlete';
import { cycle, drawHeader, leftRight, moveSelection } from '../ui/widgets';
import { EventIntroScene } from './event-intro';

/** What the host can pick: every event, both races, or any one event. */
const EVENT_CHOICES: { label: string; events: EventId[] }[] = [
  { label: 'ALL FIVE', events: [...CHAMPIONSHIP_EVENTS] },
  { label: 'BOTH RACES', events: ['dash100', 'hurdles110'] },
  ...ONLINE_EVENTS.map((id) => ({ label: EVENT_NAMES[id], events: [id] })),
];
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const TEAMS = Object.keys(TEAM_KITS) as TeamKit[];
const DIFFICULTY_NAMES = new Set<string>(DIFFICULTIES);
const EVENT_IDS = new Set<string>(['dash100', 'longJump', 'highJump', 'javelin', 'hurdles110']);
const MAX_CODE_RETRIES = 3; // if a fresh code is already in use, try another

/**
 * The room before a match: the host shares the code and picks the events;
 * the guest waits. Both swap names and teams, then the host starts.
 */
export class LobbyScene implements Scene {
  readonly name = 'LOBBY';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private conn: RoomConnection;
  private code: string;
  private retries = 0;
  private peer: SessionPlayer | null = null;
  private sentHello = false;
  private error = '';
  private row = 0;
  private choice = 0;
  private difficulty: Difficulty;

  constructor(
    private readonly game: Game,
    private readonly role: 'host' | 'guest',
    code: string,
  ) {
    this.code = code;
    this.conn = new RoomConnection(code);
    this.difficulty = game.store.data.settings.difficulty;
  }

  private get me(): SessionPlayer {
    const s = this.game.store.data.settings;
    return { initials: s.initials, team: s.team };
  }

  update(_dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK')) {
      this.conn.close();
      this.game.scenes.pop();
      return;
    }
    if (this.error) return;
    const c = this.conn;
    if (c.state === 'failed' || c.state === 'closed' || c.state === 'lost') return this.fail('COULD NOT REACH THE GAME SERVER');
    if (c.state === 'full') return this.fail('THAT ROOM IS FULL');
    if (c.state !== 'open') return;

    if (this.role === 'host' && c.othersOnArrival > 0 && !this.peer && !this.sentHello) {
      // Someone is already using this code: pick another.
      c.close();
      if (++this.retries > MAX_CODE_RETRIES) return this.fail('NO FREE ROOM - TRY AGAIN');
      this.code = makeRoomCode();
      this.conn = new RoomConnection(this.code);
      return;
    }
    if (this.role === 'guest' && c.othersOnArrival === 0 && !this.peer) {
      c.close();
      return this.fail(`NO ROOM CALLED ${this.code}`);
    }

    // Say hello whenever the other player is here (again).
    if (c.peerHere && !this.sentHello) {
      c.send(helloMessage(this.me.initials, this.me.team));
      this.sentHello = true;
    }
    for (const h of c.take('hello')) {
      if (h.v !== PROTOCOL_VERSION) return this.fail('YOUR FRIEND HAS A DIFFERENT VERSION');
      this.peer = { initials: String(h.initials).slice(0, 3).toUpperCase(), team: isTeam(h.team) ? h.team : 'blue' };
    }
    if (c.peerLeft) {
      c.peerLeft = false;
      this.peer = null;
      this.sentHello = false;
      if (this.role === 'guest') return this.fail('THE HOST LEFT');
    }

    if (this.role === 'guest') {
      const setup = c.take('setup')[0];
      if (setup && this.peer) this.startAsGuest(setup.events, setup.difficulty, setup.seed, setup.teams[1]);
      return;
    }

    // Host: choose the events and CPU strength, then start.
    this.row = moveSelection(input, this.row, 3);
    const step = leftRight(input);
    if (this.row === 0 && step !== 0) this.choice = (this.choice + step + EVENT_CHOICES.length) % EVENT_CHOICES.length;
    if (this.row === 1 && step !== 0) this.difficulty = cycle(DIFFICULTIES, this.difficulty, step);
    if (this.row === 2 && input.justPressed('CONFIRM') && this.peer) this.startAsHost();
  }

  debugLines(): string[] {
    return [`ROOM ${this.code}`, `CONN ${this.conn.state} SLOT ${this.conn.slot ?? '-'}`, `PEER ${this.peer?.initials ?? '-'}`];
  }

  private fail(message: string): void {
    this.error = message;
  }

  private startAsHost(): void {
    const peer = this.peer!;
    const me = this.me;
    // Never the same kit: the guest switches if they match.
    const guestTeam = peer.team === me.team ? cycle(TEAMS, peer.team, 1) : peer.team;
    const events = EVENT_CHOICES[this.choice].events;
    const seed = Math.floor(Math.random() * 2 ** 31);
    this.conn.send({ k: 'setup', events, difficulty: this.difficulty, seed, teams: [me.team, guestTeam] });
    this.begin([me, { ...peer, team: guestTeam }], events, this.difficulty, seed, 0);
  }

  private startAsGuest(events: string[], difficulty: string, seed: number, myTeam: string): void {
    const ids = events.filter((e): e is EventId => EVENT_IDS.has(e));
    const diff: Difficulty = DIFFICULTY_NAMES.has(difficulty) ? (difficulty as Difficulty) : 'normal';
    const me = { ...this.me, team: isTeam(myTeam) ? myTeam : this.me.team };
    if (!ids.length) return this.fail('MATCH SETUP NOT UNDERSTOOD');
    this.begin([this.peer!, me], ids, diff, seed, 1);
  }

  /** Both: make the online session and go to the first event's intro card. */
  private begin(players: SessionPlayer[], events: EventId[], difficulty: Difficulty, seed: number, localIndex: number): void {
    const g = this.game;
    const session = new Session('versus', players, difficulty, false, events, { conn: this.conn, localIndex, seed });
    g.session = session;
    g.scenes.replace(new EventIntroScene(g, session, session.series!.currentEvent));
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    r.clear(PALETTE.NAVY);
    drawHeader(r, this.role === 'host' ? 'YOUR ROOM' : 'JOINING');
    if (this.error) {
      r.text(this.error, cx, 80, PALETTE.RED, 'center');
      r.text(this.game.prompts.backTo(), cx, 166, PALETTE.GREY_LIGHT, 'center');
      return;
    }
    const c = this.conn;
    if (c.state === 'connecting') {
      r.text('CONNECTING...', cx, 80, PALETTE.WHITE, 'center');
      r.text(this.game.prompts.backTo(), cx, 166, PALETTE.GREY_LIGHT, 'center');
      return;
    }
    // Room code, big, so it can be read out to a friend.
    r.text('ROOM CODE', cx, 30, PALETTE.GREY_LIGHT, 'center');
    r.text(this.code, cx, 42, PALETTE.YELLOW, 'center', 2);
    const me = this.me;
    r.text(`YOU: ${me.initials}`, 40, 66, PALETTE.WHITE);
    if (this.peer) r.text(`FRIEND: ${this.peer.initials}`, 176, 66, PALETTE.WHITE);
    else r.text('WAITING FOR A FRIEND...', cx, 78, PALETTE.GREY_LIGHT, 'center');

    if (this.role === 'guest') {
      r.text(this.peer ? 'WAITING FOR THE HOST TO START' : 'CONNECTED', cx, 104, PALETTE.CYAN, 'center');
      r.text(this.game.prompts.backTo('LEAVE'), cx, this.game.prompts.noteY(166), PALETTE.GREY_LIGHT, 'center');
      return;
    }
    const rows = [
      `EVENTS     < ${EVENT_CHOICES[this.choice].label} >`,
      `CPU LEVEL  < ${this.difficulty} >`,
      this.peer ? 'START MATCH' : 'START MATCH (WAITING)',
    ];
    rows.forEach((label, i) => {
      const y = 92 + i * 16;
      const selected = i === this.row;
      if (selected) r.text('>', 26, y, PALETTE.YELLOW);
      const dim = i === 2 && !this.peer;
      r.text(label, 40, y, dim ? PALETTE.GREY_DARK : selected ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
    });
    r.text(this.game.prompts.backTo('CLOSE ROOM'), cx, this.game.prompts.noteY(166), PALETTE.GREY_LIGHT, 'center');
  }
}

function isTeam(t: unknown): t is TeamKit {
  return typeof t === 'string' && t in TEAM_KITS;
}
