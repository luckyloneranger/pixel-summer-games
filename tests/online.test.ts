import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { RoomConnection, type SocketLike } from '../src/net/connection';
import { Dash100Event } from '../src/events/dash100';
import type { EventResult, NetLink, PlayerInfo } from '../src/events/event';
import { Hurdles110Event } from '../src/events/hurdles110';
import { HURDLE_POSITIONS } from '../src/events/hurdles110';
import { RaceEvent, type Lane } from '../src/events/race-event';
import {
  isRoomCode,
  makeRoomCode,
  parseClientMessage,
  parseServerMessage,
  type GameMessage,
} from '../src/net/protocol';
import { HURDLES, RACE_START } from '../src/game/tuning';
import { NOTHING, STEP, pressed } from './helpers';
import type { Action } from '../src/core/keymap';

const PLAYERS: PlayerInfo[] = [
  { initials: 'ANN', team: 'red', index: 0 },
  { initials: 'BOB', team: 'blue', index: 1 },
];

/**
 * Two games joined by an in-memory link. Messages arrive `lagSteps` logic
 * steps after they're sent, like a network delay.
 */
function linkedPair(lagSteps: number): { host: NetLink; guest: NetLink; tick(): void } {
  const boxes: GameMessage[][] = [[], []];
  const inFlight: { to: number; at: number; m: GameMessage }[] = [];
  let now = 0;
  const make = (me: number): NetLink => ({
    localIndex: me,
    isHost: me === 0,
    send: (m) => inFlight.push({ to: 1 - me, at: now + lagSteps, m: JSON.parse(JSON.stringify(m)) }),
    take: (...kinds) => {
      const out: never[] = [];
      boxes[me] = boxes[me].filter((m) => ((kinds as string[]).includes(m.k) ? (out.push(m as never), false) : true));
      return out;
    },
  });
  return {
    host: make(0),
    guest: make(1),
    tick() {
      now++;
      for (let i = 0; i < inFlight.length; ) {
        if (inFlight[i].at <= now) boxes[inFlight[i].to].push(inFlight.splice(i, 1)[0].m);
        else i++;
      }
    },
  };
}

type Race = RaceEvent<Lane>;

function startPair(make: () => Race, lag: number, seed = 7) {
  const link = linkedPair(lag);
  const host = make();
  const guest = make();
  host.init({ players: PLAYERS, difficulty: 'normal', rng: new Rng(seed), net: link.host });
  guest.init({ players: PLAYERS, difficulty: 'normal', rng: new Rng(seed), net: link.guest });
  return { host, guest, link };
}

/** Step both games; each player taps (at `rate` taps/s) once their own race is running. */
function runBoth(host: Race, guest: Race, link: { tick(): void }, extra?: (i: number) => [Action[], Action[]]) {
  const every = [6, 7]; // host ~10 taps/s, guest ~8.6
  const left = [true, true];
  for (let i = 0; i < 60 * 90 && !(host.isFinished() && guest.isFinished()); i++) {
    const games = [host, guest];
    games.forEach((g, p) => {
      const acts: Action[] = extra ? extra(i)[p] : [];
      if (g.phase === 'running' && i % every[p] === 0) {
        acts.push(left[p] ? 'P1_LEFT' : 'P1_RIGHT');
        left[p] = !left[p];
      }
      g.update(STEP, pressed(...acts));
    });
    link.tick();
  }
}

const summary = (results: EventResult[]) => results.map((r) => `${r.name}:${r.mark}:${r.disqualified}`);

describe('online races stay in sync', () => {
  for (const lag of [0, 6]) {
    it(`100 m with ${lag * 17} ms of lag: both games agree on every result`, () => {
      const { host, guest, link } = startPair(() => new Dash100Event(), lag);
      runBoth(host, guest, link);
      expect(host.isFinished()).toBe(true);
      expect(guest.isFinished()).toBe(true);
      expect(summary(guest.getResults())).toEqual(summary(host.getResults()));
      // Each player's own time is measured on their own device.
      const ann = host.getResults().find((r) => r.name === 'ANN')!;
      const bob = host.getResults().find((r) => r.name === 'BOB')!;
      expect(ann.mark!).toBeLessThan(bob.mark!); // ANN tapped faster
    });
  }

  it("the guest only moves the guest's runner", () => {
    const { host, guest, link } = startPair(() => new Dash100Event(), 2);
    for (let i = 0; i < 600 && host.phase !== 'running'; i++) {
      host.update(STEP, NOTHING);
      guest.update(STEP, NOTHING);
      link.tick();
    }
    for (let i = 0; i < 30; i++) {
      guest.update(STEP, pressed(i % 2 ? 'P1_LEFT' : 'P1_RIGHT'));
      host.update(STEP, NOTHING);
      link.tick();
    }
    const bobOnHost = host.lanes.find((l) => l.playerIndex === 1)!;
    const annOnHost = host.lanes.find((l) => l.playerIndex === 0)!;
    expect(bobOnHost.runner.position).toBeGreaterThan(0);
    expect(annOnHost.runner.position).toBe(0);
  });

  it('a guest false start is ruled by the host and seen on both screens', () => {
    const { host, guest, link } = startPair(() => new Dash100Event(), 3);
    // Guest jumps the gun straight away.
    guest.update(STEP, pressed('P1_LEFT'));
    for (let i = 0; i < 10; i++) {
      host.update(STEP, NOTHING);
      guest.update(STEP, NOTHING);
      link.tick();
    }
    expect(host.phase).toBe('falseStart');
    expect(guest.phase).toBe('falseStart');
    const bob = (g: Race) => g.lanes.find((l) => l.playerIndex === 1)!;
    expect(bob(host).falseStarts).toBe(1);
    expect(bob(guest).falseStarts).toBe(1);
    // After the restart, both reach GO and finish with the same results.
    runBoth(host, guest, link);
    expect(summary(guest.getResults())).toEqual(summary(host.getResults()));
  });

  it('two guest false starts disqualify the guest on both screens', () => {
    const { host, guest, link } = startPair(() => new Dash100Event(), 2);
    const step = () => {
      host.update(STEP, NOTHING);
      guest.update(STEP, NOTHING);
      link.tick();
    };
    guest.update(STEP, pressed('P1_RIGHT'));
    for (let t = 0; t < RACE_START.FALSE_START_TEXT_TIME + 0.5; t += STEP) step();
    guest.update(STEP, pressed('P1_LEFT'));
    for (let i = 0; i < 10; i++) step();
    const bob = (g: Race) => g.lanes.find((l) => l.playerIndex === 1)!;
    expect(bob(host).disqualified).toBe(true);
    expect(bob(guest).disqualified).toBe(true);
    runBoth(host, guest, link);
    expect(summary(guest.getResults())).toEqual(summary(host.getResults()));
  });

  it('hurdles: knocked hurdles show on the other screen and results agree', () => {
    const { host, guest, link } = startPair(() => new Hurdles110Event(), 4);
    runBoth(host, guest, link); // nobody jumps: every hurdle is hit
    expect(summary(guest.getResults())).toEqual(summary(host.getResults()));
    const annOnGuest = (guest as unknown as Hurdles110Event).lanes.find((l) => l.playerIndex === 0)!;
    expect(annOnGuest.knocked.filter(Boolean).length).toBe(HURDLE_POSITIONS.length);
    expect(HURDLES.COUNT).toBe(HURDLE_POSITIONS.length);
  });
});

describe('room codes and messages', () => {
  it('makes valid 4-letter codes without I or O', () => {
    for (let i = 0; i < 200; i++) {
      const code = makeRoomCode();
      expect(isRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[IO]/);
    }
    expect(isRoomCode('ABCO')).toBe(false);
    expect(isRoomCode('ABC')).toBe(false);
  });

  it('accepts well-formed messages and rejects junk', () => {
    expect(parseServerMessage('{"t":"welcome","slot":1,"others":1}')).not.toBeNull();
    expect(parseServerMessage('{"t":"relay","data":{"k":"early"}}')).not.toBeNull();
    expect(parseServerMessage('{"t":"relay","data":{"k":"hack"}}')).toBeNull();
    expect(parseServerMessage('not json')).toBeNull();
    expect(parseServerMessage('x'.repeat(5000))).toBeNull();
    expect(parseClientMessage('{"t":"relay","data":{"k":"ready","event":0}}')).not.toBeNull();
    expect(parseClientMessage('{"t":"welcome"}')).toBeNull();
  });
});

/** A fake WebSocket we can push server messages into. */
function fakeSocket(): SocketLike & { sent: string[]; serverSays(m: object): void; drop(): void } {
  const s = {
    readyState: 1,
    sent: [] as string[],
    onopen: null,
    onmessage: null as SocketLike['onmessage'],
    onclose: null as SocketLike['onclose'],
    onerror: null,
    send(d: string) {
      this.sent.push(d);
    },
    close() {},
    serverSays(m: object) {
      this.onmessage?.({ data: JSON.stringify(m) });
    },
    drop() {
      this.onclose?.({});
    },
  };
  return s;
}

describe('RoomConnection', () => {
  it('tracks the room: welcome, the other player arriving and leaving', () => {
    const sock = fakeSocket();
    const c = new RoomConnection('ABCD', 'ws://x', () => sock);
    expect(c.state).toBe('connecting');
    sock.serverSays({ t: 'welcome', slot: 0, others: 0 });
    expect(c.state).toBe('open');
    expect(c.slot).toBe(0);
    expect(c.peerHere).toBe(false);
    sock.serverSays({ t: 'joined' });
    expect(c.peerHere).toBe(true);
    sock.serverSays({ t: 'left' });
    expect(c.peerLeft).toBe(true);
  });

  it('queues the other player’s messages until the game takes them, by kind', () => {
    const sock = fakeSocket();
    const c = new RoomConnection('ABCD', 'ws://x', () => sock);
    sock.serverSays({ t: 'welcome', slot: 1, others: 1 });
    sock.serverSays({ t: 'relay', data: { k: 'ready', event: 0 } });
    sock.serverSays({ t: 'relay', data: { k: 'early' } });
    expect(c.take('early')).toHaveLength(1);
    expect(c.take('early')).toHaveLength(0);
    expect(c.take('ready')).toEqual([{ k: 'ready', event: 0 }]);
  });

  it('reports a full room, and a server it could not reach', () => {
    const full = fakeSocket();
    const a = new RoomConnection('ABCD', 'ws://x', () => full);
    full.serverSays({ t: 'full' });
    expect(a.state).toBe('full');
    const dead = fakeSocket();
    const b = new RoomConnection('ABCD', 'ws://x', () => dead);
    dead.drop();
    expect(b.state).toBe('failed');
  });

  it('wraps outgoing messages for the relay', () => {
    const sock = fakeSocket();
    const c = new RoomConnection('ABCD', 'ws://x', () => sock);
    c.send({ k: 'early' }); // not open yet: dropped
    sock.serverSays({ t: 'welcome', slot: 0, others: 0 });
    c.send({ k: 'early' });
    expect(sock.sent).toEqual(['{"t":"relay","data":{"k":"early"}}']);
  });
});
