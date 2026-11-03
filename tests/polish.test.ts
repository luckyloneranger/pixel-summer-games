import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { cpuLineup } from '../src/events/cpu';
import { Dash100Event } from '../src/events/dash100';
import type { EffectsSink } from '../src/events/event';
import { HURDLE_POSITIONS, Hurdles110Event } from '../src/events/hurdles110';
import { LongJumpEvent } from '../src/events/long-jump';
import { DustTrail } from '../src/gfx/effects';
import { EFFECTS, LONG_JUMP } from '../src/game/tuning';
import type { InputSnapshot } from '../src/core/input';
import type { Action } from '../src/core/keymap';
import { NOTHING, STEP, pressed } from './helpers';

function shakes(): EffectsSink & { amounts: number[] } {
  const amounts: number[] = [];
  return { amounts, shake: (px) => void amounts.push(px), highlight: () => {}, calm: false };
}

function waitForGo(e: Dash100Event | Hurdles110Event): void {
  for (let i = 0; e.phase !== 'running' && i < 10_000; i++) e.update(STEP, NOTHING);
}

describe('demo race (attract mode)', () => {
  it('runs four CPUs with no humans all the way to the finish', () => {
    const e = new Dash100Event();
    e.init({ players: [], difficulty: 'hard', rng: new Rng(5) });
    expect(e.demo).toBe(true);
    expect(e.lanes.every((l) => l.cpu !== null)).toBe(true);
    for (let i = 0; !e.isFinished() && i < 60 * 60; i++) e.update(STEP, NOTHING);
    expect(e.isFinished()).toBe(true);
    expect(e.getResults().every((r) => r.mark !== null)).toBe(true);
  });

  it('a CPU line-up can have four runners, all different colours', () => {
    const cpus = cpuLineup([], 4);
    expect(cpus).toHaveLength(4);
    expect(new Set(cpus.map((c) => c.look.shirt)).size).toBe(4);
  });
});

describe('did not finish', () => {
  it('a player who stops after everyone else has finished gets no mark', () => {
    const e = new Dash100Event();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'hard', rng: new Rng(1) });
    waitForGo(e);
    // Never tap: the CPUs finish, then the clock runs out on the player.
    for (let i = 0; !e.isFinished() && i < 60 * 60; i++) e.update(STEP, NOTHING);
    expect(e.isFinished()).toBe(true);
    const me = e.getResults().find((r) => r.playerIndex === 0)!;
    expect(me.dnf).toBe(true);
    expect(me.mark).toBeNull();
  });

  it('is not given while the player is still moving', () => {
    const e = new Dash100Event();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'hard', rng: new Rng(1) });
    waitForGo(e);
    let left = true;
    for (let i = 0; !e.isFinished() && i < 60 * 60; i++) {
      const tap = i % 12 === 0; // slow, but moving
      e.update(STEP, tap ? pressed(left ? 'P1_LEFT' : 'P1_RIGHT') : NOTHING);
      if (tap) left = !left;
    }
    expect(e.player.dnf).toBe(false);
    expect(e.player.finishTime).not.toBeNull();
  });
});

describe('photo finish', () => {
  it('freezes the race when the top two cross within 0.05 s', () => {
    const e = new Dash100Event();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1) });
    waitForGo(e);
    // Put two runners a hair apart just before the line.
    const [a, b] = e.lanes;
    a.runner.position = 99.95;
    b.runner.position = 99.9;
    a.runner.speed = b.runner.speed = 11;
    e.update(STEP, NOTHING);
    expect(e.photoFinish).toBeGreaterThan(0);
    const pos = e.lanes[2].runner.position;
    e.update(STEP, NOTHING);
    expect(e.lanes[2].runner.position).toBe(pos); // frozen
  });

  it('does not happen for a clear win', () => {
    const e = new Dash100Event();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1) });
    waitForGo(e);
    const [a, b] = e.lanes;
    a.runner.position = 99.95;
    b.runner.position = 95;
    a.runner.speed = b.runner.speed = 11;
    for (let i = 0; i < 60; i++) e.update(STEP, NOTHING);
    expect(e.photoFinish).toBe(0);
  });
});

describe('game feel', () => {
  it('dust only appears at high speed, every so many metres', () => {
    const t = new DustTrail();
    expect(t.due(5, 0.5)).toBe(false);
    expect(t.due(5, 0.95)).toBe(true);
    expect(t.due(5.2, 0.95)).toBe(false);
    expect(t.due(5 + EFFECTS.DUST_EVERY + 0.01, 0.95)).toBe(true);
  });

  it('hitting a hurdle asks for a screen shake', () => {
    const fx = shakes();
    const e = new Hurdles110Event();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1), effects: fx });
    waitForGo(e);
    e.runner.position = HURDLE_POSITIONS[0] - 0.05;
    e.runner.speed = 10;
    e.update(STEP, NOTHING);
    expect(fx.amounts).toEqual([EFFECTS.SHAKE_HURDLE]);
  });

  it('a long jump landing gives a small bump', () => {
    const fx = shakes();
    const e = new LongJumpEvent();
    e.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: new Rng(1), effects: fx });
    e.update(STEP, pressed('P1_LEFT'));
    e.runner.position = LONG_JUMP.RUNWAY - 6;
    e.runner.speed = 10;
    const hold = (fresh: boolean): InputSnapshot => ({
      isDown: (a: Action) => a === 'P1_ACTION',
      justPressed: (a: Action) => fresh && a === 'P1_ACTION',
      justReleased: () => false,
    });
    e.update(STEP, hold(true));
    while (e.phase === 'hold' && e.meter.angle < 40) e.update(STEP, hold(false));
    e.update(STEP, NOTHING);
    for (let i = 0; i < 500 && e.phase === 'flight'; i++) e.update(STEP, NOTHING);
    expect(fx.amounts).toEqual([EFFECTS.SHAKE_LAND]);
  });
});
