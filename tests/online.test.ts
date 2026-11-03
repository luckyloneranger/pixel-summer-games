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

/** A fake clock, timers and sockets for RoomConnection. */
function fakeEnv() {
  const sockets: ReturnType<typeof fakeSocket>[] = [];
  const urls: string[] = [];
  let clock = 0;
  let timers: { at: number; fn: () => void }[] = [];
  const env = {
    makeSocket: (url: string) => {
      urls.push(url);
      const s = fakeSocket();
      sockets.push(s);
      return s;
    },
    now: () => clock,
    later: (fn: () => void, ms: number) => void timers.push({ at: clock + ms, fn }),
  };
  return {
    env,
    sockets,
    urls,
    get sock() {
      return sockets[sockets.length - 1];
    },
    /** Move the clock on, running any timers that come due. */
    wait(ms: number) {
      clock += ms;
      const due = timers.filter((t) => t.at <= clock);
      timers = timers.filter((t) => t.at > clock);
      due.forEach((t) => t.fn());
    },
  };
}

const relayed = (s: { sent: string[] }) => s.sent.map((x) => JSON.parse(x));

describe('RoomConnection', () => {
  it('tracks the room: welcome, the other player arriving and leaving', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    expect(c.state).toBe('connecting');
    f.sock.serverSays({ t: 'welcome', slot: 0, others: 0 });
    expect(c.state).toBe('open');
    expect(c.slot).toBe(0);
    expect(c.peerHere).toBe(false);
    f.sock.serverSays({ t: 'joined' });
    expect(c.peerHere).toBe(true);
    f.sock.serverSays({ t: 'left' });
    expect(c.peerLeft).toBe(true);
    f.wait(3000);
    expect(c.peerAwayFor()).toBeCloseTo(3);
    f.sock.serverSays({ t: 'joined' });
    expect(c.peerLeft).toBe(false);
    expect(c.peerAwayFor()).toBe(0);
  });

  it('queues the other player’s messages until the game takes them, by kind', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'welcome', slot: 1, others: 1 });
    f.sock.serverSays({ t: 'relay', data: { k: 'ready', event: 0 }, seq: 1 });
    f.sock.serverSays({ t: 'relay', data: { k: 'early' }, seq: 2 });
    expect(c.take('early')).toHaveLength(1);
    expect(c.take('early')).toHaveLength(0);
    expect(c.take('ready')).toEqual([{ k: 'ready', event: 0 }]);
  });

  it('reports a full room, and a server it could not reach', () => {
    const f = fakeEnv();
    const a = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'full' });
    expect(a.state).toBe('full');
    const b = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.drop();
    expect(b.state).toBe('failed');
  });

  it('numbers important messages, but not position updates', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    c.send({ k: 'early' }); // not open yet: kept for later
    f.sock.serverSays({ t: 'welcome', slot: 0, others: 1 });
    c.send({ k: 'early' });
    c.send({ k: 'field', n: 0, x: 1, speed: 2, angle: 0, phase: 'runup' });
    expect(relayed(f.sock)).toEqual([
      { t: 'relay', data: { k: 'early' }, seq: 1, ack: 0 },
      { t: 'relay', data: { k: 'early' }, seq: 2, ack: 0 },
      { t: 'relay', data: { k: 'field', n: 0, x: 1, speed: 2, angle: 0, phase: 'runup' }, ack: 0 },
    ]);
  });

  it('confirms what it receives and drops repeats', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'welcome', slot: 1, others: 1 });
    f.sock.serverSays({ t: 'relay', data: { k: 'early' }, seq: 1 });
    f.sock.serverSays({ t: 'relay', data: { k: 'early' }, seq: 1 }); // resent after a drop
    f.sock.serverSays({ t: 'relay', data: { k: 'early' }, seq: 3 }); // gap: 2 was lost, wait for it
    expect(c.take('early')).toHaveLength(1);
    const acks = relayed(f.sock).filter((m) => m.data.k === 'ack');
    expect(acks.map((m) => m.ack)).toEqual([1, 1]);
  });

  it('keeps sending unconfirmed messages until the other player has them', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'welcome', slot: 0, others: 1 });
    c.send({ k: 'early' });
    c.send({ k: 'ready', event: 1 });
    f.sock.serverSays({ t: 'relay', data: { k: 'ack' }, ack: 1 }); // they have #1
    f.sock.sent.length = 0;
    f.sock.serverSays({ t: 'left' });
    f.sock.serverSays({ t: 'joined' }); // back after a drop: resend what they may have missed
    expect(relayed(f.sock).map((m) => m.seq)).toEqual([2]);
  });

  it('reconnects to the same seat after a short drop, then resends', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'welcome', slot: 1, others: 1 });
    f.sock.drop();
    expect(c.state).toBe('reconnecting');
    c.send({ k: 'early' }); // sent while away: kept
    f.wait(1000);
    expect(f.urls[1]).toBe('ws://x/room/ABCD?slot=1');
    expect(c.reconnectSecondsLeft()).toBeCloseTo(9);
    f.sock.serverSays({ t: 'welcome', slot: 1, others: 1 });
    expect(c.state).toBe('open');
    expect(relayed(f.sock)).toEqual([{ t: 'relay', data: { k: 'early' }, seq: 1, ack: 0 }]);
  });

  it('gives up when it cannot get back within the window', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'welcome', slot: 0, others: 1 });
    f.sock.drop();
    for (let i = 0; i < 12; i++) {
      f.wait(1000);
      if (c.state === 'reconnecting') f.sock.drop(); // the server is still unreachable
    }
    expect(c.state).toBe('lost');
  });

  it('notices the other player leaving on purpose', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'welcome', slot: 0, others: 1 });
    f.sock.serverSays({ t: 'relay', data: { k: 'bye' }, seq: 1 });
    expect(c.peerSaidBye).toBe(true);
  });
});

// ------------------------------------------------------------ field events

import { LongJumpEvent } from '../src/events/long-jump';
import { JavelinEvent } from '../src/events/javelin';
import { HighJumpEvent } from '../src/events/high-jump';
import type { RunUpFieldEvent } from '../src/events/run-up-event';

/**
 * One device's player: taps up the runway, then holds Action for a while and
 * lets go. Every third attempt they run through the line instead (a foul).
 */
function fieldPlayer(g: RunUpFieldEvent, releaseAt: number, hold: number) {
  let held = 0;
  let left = true;
  return (i: number) => {
    if (!g.localTurn) return NOTHING;
    const n = g.attemptNo;
    if (g.phase === 'ready' || g.phase === 'runup') {
      held = 0;
      if (g.athleteX < releaseAt || g.record.marks.length === 1) {
        if (i % 5 !== 0) return NOTHING;
        left = !left;
        return pressed(left ? 'P1_LEFT' : 'P1_RIGHT');
      }
      return pressed('P1_ACTION');
    }
    if (g.phase === 'hold') {
      held++;
      return held < hold + (n % 3) * 2 ? pressed('P1_ACTION') : NOTHING;
    }
    return NOTHING;
  };
}

function playField(make: () => RunUpFieldEvent, lag: number, releaseAt: number, hold: number) {
  const link = linkedPair(lag);
  const host = make();
  const guest = make();
  host.init({ players: PLAYERS, difficulty: 'normal', rng: new Rng(3), net: link.host });
  guest.init({ players: PLAYERS, difficulty: 'normal', rng: new Rng(3), net: link.guest });
  const drive = [fieldPlayer(host, releaseAt, hold), fieldPlayer(guest, releaseAt, hold)];
  for (let i = 0; i < 60 * 300 && !(host.isFinished() && guest.isFinished()); i++) {
    host.update(STEP, drive[0](i));
    guest.update(STEP, drive[1](i));
    link.tick();
  }
  return { host, guest };
}

const fieldSummary = (results: EventResult[]) => results.map((r) => `${r.name}:${r.mark}:${(r.attempts ?? []).join(',')}`);

describe('online field events stay in sync', () => {
  // [name, event, where to start holding (m from the line), steps to hold]
  const events: [string, () => RunUpFieldEvent, number, number][] = [
    ['long jump', () => new LongJumpEvent(), -6, 16],
    ['javelin', () => new JavelinEvent(), -8, 26],
    ['high jump', () => new HighJumpEvent(), -7.4, 32],
  ];
  for (const [name, make, releaseAt, hold] of events) {
    for (const lag of [0, 6, 40]) {
      it(`${name} with ${lag * 17} ms of lag: both games agree on every attempt`, () => {
        const { host, guest } = playField(make, lag, releaseAt, hold);
        expect(host.isFinished()).toBe(true);
        expect(guest.isFinished()).toBe(true);
        expect(fieldSummary(guest.getResults())).toEqual(fieldSummary(host.getResults()));
        const ann = host.getResults().find((r) => r.name === 'ANN')!;
        expect(ann.attempts!.some((m) => m !== null)).toBe(true);
        if (name !== 'high jump') expect(ann.attempts![1]).toBeNull(); // the planned foul
      });
    }
  }

  it('takes turns: player 1, player 2, player 1…', () => {
    const link = linkedPair(0);
    const host = new LongJumpEvent();
    host.init({ players: PLAYERS, difficulty: 'normal', rng: new Rng(3), net: link.host });
    expect(host.current.name).toBe('ANN');
    expect(host.localTurn).toBe(true);
    // ANN fouls; then it's BOB's turn, run by the other device.
    for (let i = 0; i < 60 * 20 && host.attemptNo === 0; i++) {
      host.update(STEP, i % 5 === 0 ? pressed(i % 10 ? 'P1_LEFT' : 'P1_RIGHT') : NOTHING);
    }
    expect(host.current.name).toBe('BOB');
    expect(host.localTurn).toBe(false);
    // Our keys do nothing during their turn.
    host.update(STEP, pressed('P1_LEFT'));
    host.update(STEP, pressed('P1_RIGHT'));
    expect(host.runner.speed).toBe(0);
  });
});

import { onlineStatus } from '../src/net/status';
import { NET } from '../src/game/tuning';

describe('online status banner', () => {
  it('waits for a dropped friend, then ends the match', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'welcome', slot: 0, others: 1 });
    expect(onlineStatus(c, 'BOB')).toEqual({ banner: null, over: null });
    f.sock.serverSays({ t: 'left' });
    f.wait(2500);
    expect(onlineStatus(c, 'BOB').banner).toBe('WAITING FOR BOB TO RECONNECT 8');
    f.sock.serverSays({ t: 'joined' });
    expect(onlineStatus(c, 'BOB').banner).toBeNull();
    f.sock.serverSays({ t: 'left' });
    f.wait(NET.RECONNECT_WINDOW * 1000 + 1);
    expect(onlineStatus(c, 'BOB').over).toBe('YOUR FRIEND LEFT');
  });

  it('shows our own reconnect countdown, and ends at once if the friend says bye', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'welcome', slot: 0, others: 1 });
    f.sock.drop();
    expect(onlineStatus(c, 'BOB').banner).toBe('RECONNECTING... 10');
    f.wait(1000);
    f.sock.serverSays({ t: 'welcome', slot: 0, others: 1 });
    f.sock.serverSays({ t: 'relay', data: { k: 'bye' }, seq: 1 });
    expect(onlineStatus(c, 'BOB').over).toBe('YOUR FRIEND LEFT');
  });
});

describe('RoomConnection with a new friend', () => {
  it('starts numbering afresh when someone new joins (not after a reconnect)', () => {
    const f = fakeEnv();
    const c = new RoomConnection('ABCD', 'ws://x', f.env);
    f.sock.serverSays({ t: 'welcome', slot: 0, others: 0 });
    f.sock.serverSays({ t: 'joined', fresh: true });
    c.send({ k: 'ready', event: 0 });
    f.sock.serverSays({ t: 'relay', data: { k: 'early' }, seq: 1 });
    f.sock.serverSays({ t: 'relay', data: { k: 'early' }, seq: 2 });
    f.sock.serverSays({ t: 'left' });
    f.sock.serverSays({ t: 'joined', fresh: true });
    f.sock.sent.length = 0;
    f.sock.serverSays({ t: 'relay', data: { k: 'early' }, seq: 1 }); // the new friend's first message
    expect(c.take('early')).toHaveLength(3);
    expect(relayed(f.sock).some((m) => m.data.k === 'ready')).toBe(false); // not resent to them
  });
});
