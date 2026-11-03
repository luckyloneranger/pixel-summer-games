import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import type { InputSnapshot } from '../src/core/input';
import type { Action } from '../src/core/keymap';
import { cpuLineup } from '../src/events/cpu';
import { Dash100Event, PLAYER_LANE } from '../src/events/dash100';
import type { EventResult } from '../src/events/event';
import { LongJumpEvent } from '../src/events/long-jump';
import { Championship } from '../src/game/championship';
import { Session } from '../src/game/session';
import { LONG_JUMP, RACE_START } from '../src/game/tuning';
import { TEAM_KITS } from '../src/gfx/sprites/athlete';
import { NOTHING, STEP, pressed } from './helpers';

const TWO = [
  { initials: 'ANN', team: 'red' as const, index: 0 },
  { initials: 'BOB', team: 'blue' as const, index: 1 },
];

function race(): Dash100Event {
  const e = new Dash100Event();
  e.init({ players: TWO, difficulty: 'normal', rng: new Rng(1) });
  return e;
}

function waitForGo(e: Dash100Event): void {
  for (let i = 0; e.phase !== 'running' && i < 10_000; i++) e.update(STEP, NOTHING);
}

const lane = (e: Dash100Event, i: number) => e.lanes.find((l) => l.playerIndex === i)!;

describe('2-player races', () => {
  it('puts P1 in lane 2 and P2 in lane 3, with two CPUs', () => {
    const e = race();
    expect(lane(e, 0).laneNumber).toBe(PLAYER_LANE);
    expect(lane(e, 1).laneNumber).toBe(3);
    expect(e.lanes.filter((l) => l.cpu)).toHaveLength(2);
  });

  it('P2 keys move only P2, and P1 keys move only P1', () => {
    const e = race();
    waitForGo(e);
    e.update(STEP, pressed('P2_LEFT'));
    e.update(STEP, pressed('P2_RIGHT'));
    expect(lane(e, 1).runner.taps).toBe(2);
    expect(lane(e, 0).runner.taps).toBe(0);
    e.update(STEP, pressed('P1_LEFT'));
    expect(lane(e, 0).runner.taps).toBe(1);
    expect(lane(e, 1).runner.taps).toBe(2);
  });

  it('false starts count per player; two disqualify only that player', () => {
    const e = race();
    e.update(STEP, pressed('P2_LEFT'));
    expect(lane(e, 1).falseStarts).toBe(1);
    expect(lane(e, 0).falseStarts).toBe(0);
    for (let t = 0; t <= RACE_START.FALSE_START_TEXT_TIME + STEP; t += STEP) e.update(STEP, NOTHING);
    e.update(STEP, pressed('P2_RIGHT'));
    expect(e.phase).toBe('disqualified');
    expect(lane(e, 1).disqualified).toBe(true);
    expect(lane(e, 0).disqualified).toBe(false);
  });

  it('the race finishes with both humans in the results', () => {
    const e = race();
    waitForGo(e);
    let left = true;
    for (let i = 0; !e.isFinished() && i < 60 * 60; i++) {
      const tap = i % 6 === 0;
      const actions: Action[] = tap ? [left ? 'P1_LEFT' : 'P1_RIGHT', left ? 'P2_LEFT' : 'P2_RIGHT'] : [];
      if (tap) left = !left;
      e.update(STEP, pressed(...actions));
    }
    const humans = e.getResults().filter((r) => r.playerIndex >= 0);
    expect(humans.map((h) => h.name).sort()).toEqual(['ANN', 'BOB']);
    expect(humans.every((h) => h.mark !== null)).toBe(true);
  });
});

function holding(action: Action, fresh = false): InputSnapshot {
  return { isDown: (a) => a === action, justPressed: (a) => fresh && a === action, justReleased: () => false };
}

describe('2-player field events', () => {
  it('players take turns: P1, P2, P1, P2, P1, P2', () => {
    const e = new LongJumpEvent();
    e.init({ players: TWO, difficulty: 'normal', rng: new Rng(1) });
    const order: number[] = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      order.push(e.current.playerIndex);
      const p = e.current.playerIndex === 0 ? 'P1' : 'P2';
      e.update(STEP, pressed(`${p}_LEFT` as Action));
      e.runner.position = LONG_JUMP.RUNWAY - 6;
      e.runner.speed = 10;
      e.update(STEP, holding(`${p}_ACTION` as Action, true));
      while (e.phase === 'hold' && e.meter.angle < 40) e.update(STEP, holding(`${p}_ACTION` as Action));
      e.update(STEP, NOTHING);
      for (let i = 0; i < 1000 && e.phase !== 'ready' && e.phase !== 'finished'; i++) e.update(STEP, NOTHING);
    }
    expect(order).toEqual([0, 1, 0, 1, 0, 1]);
    expect(e.isFinished()).toBe(true);
    expect(e.getResults().filter((r) => r.playerIndex >= 0)).toHaveLength(2);
  });

  it("the other player's keys do nothing on your turn", () => {
    const e = new LongJumpEvent();
    e.init({ players: TWO, difficulty: 'normal', rng: new Rng(1) });
    e.update(STEP, pressed('P2_LEFT'));
    expect(e.phase).toBe('ready');
    e.update(STEP, pressed('P1_LEFT'));
    expect(e.phase).toBe('runup');
  });
});

function results(marks: [number | null, number | null]): EventResult[] {
  return [
    { playerIndex: 0, name: 'ANN', mark: marks[0], foul: false, disqualified: false, points: 0 },
    { playerIndex: 1, name: 'BOB', mark: marks[1], foul: false, disqualified: false, points: 0 },
    { playerIndex: -1, name: 'ACE', mark: 11, foul: false, disqualified: false, points: 0 },
  ].filter((r) => r.playerIndex < 0 || marks[r.playerIndex] !== undefined);
}

describe('2-player championship', () => {
  it('a player who misses a mark is out; the other carries on', () => {
    const c = new Championship('normal', false, 2);
    const o = c.record(results([11.5, 12.5]));
    expect(o.qualifiedPlayers).toEqual({ 0: true, 1: false });
    expect(o.eliminated).toEqual([1]);
    expect(c.state).toBe('playing');
    expect(c.activePlayers()).toEqual([0]);
  });

  it('it is game over only when both players are out', () => {
    const c = new Championship('normal', false, 2);
    c.record(results([11.5, 12.5]));
    c.record([{ playerIndex: 0, name: 'ANN', mark: 6, foul: false, disqualified: false, points: 0 }]);
    expect(c.state).toBe('gameOver');
  });

  it('a knocked-out player sits out the next event', () => {
    const s = new Session('championship', TWO, 'normal', false);
    s.series!.record(results([11.5, 12.5]));
    expect(s.activePlayers().map((p) => p.initials)).toEqual(['ANN']);
    expect(s.activePlayers()[0].index).toBe(0);
  });

  it('keeps separate totals even with the same initials', () => {
    const c = new Championship('normal', false, 2);
    c.record([
      { playerIndex: 0, name: 'AAA', mark: 10, foul: false, disqualified: false, points: 0 },
      { playerIndex: 1, name: 'AAA', mark: 11, foul: false, disqualified: false, points: 0 },
    ]);
    expect(c.playerTotal(0)).toBeGreaterThan(c.playerTotal(1));
    expect(c.playerTotal(1)).toBeGreaterThan(0);
  });
});

describe('versus', () => {
  it('has no qualifying, and the higher total wins', () => {
    const s = new Session('versus', TWO, 'normal', false, ['dash100']);
    const o = s.series!.record(results([13.5, 10.5]));
    expect(o.eliminated).toEqual([]);
    expect(s.series!.state).toBe('complete');
    expect(s.series!.playerTotal(1)).toBeGreaterThan(s.series!.playerTotal(0));
  });

  it('can run all four events', () => {
    const s = new Session('versus', TWO, 'normal', false);
    expect(s.series!.events).toHaveLength(4);
  });
});

describe('CPU colours with two players', () => {
  it('no CPU wears either player colour', () => {
    const teams = Object.keys(TEAM_KITS) as (keyof typeof TEAM_KITS)[];
    for (const a of teams) {
      for (const b of teams) {
        if (a === b) continue;
        for (const cpu of cpuLineup([a, b])) {
          expect(cpu.look.shirt).not.toBe(TEAM_KITS[a].shirt);
          expect(cpu.look.shirt).not.toBe(TEAM_KITS[b].shirt);
        }
      }
    }
  });
});
