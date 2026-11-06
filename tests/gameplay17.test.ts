import { describe, expect, it } from 'vitest';
import { LongJumpEvent } from '../src/events/long-jump';
import { Rng } from '../src/core/rng';
import { LONG_JUMP } from '../src/game/tuning';
import { Session } from '../src/game/session';
import { ALL_EVENTS, CHAMPIONSHIP_EVENTS } from '../src/game/championship';
import { NOTHING, STEP, pressed } from './helpers';
import type { InputSnapshot } from '../src/core/input';

const hold = (fresh: boolean): InputSnapshot => ({
  isDown: (a) => a === 'P1_ACTION',
  justPressed: (a) => fresh && a === 'P1_ACTION',
  justReleased: () => false,
});

describe('last take-off marker', () => {
  it('marks where you took off, on your next run-up only', () => {
    const e = new LongJumpEvent();
    e.init({ players: [{ initials: 'ANN' }], difficulty: 'normal', rng: new Rng(1) });
    const marker = () => (e as unknown as { takeoffMarker: number | null }).takeoffMarker;
    expect(marker()).toBeNull(); // nothing yet on the first jump
    e.update(STEP, pressed('P1_LEFT'));
    e.runner.position = LONG_JUMP.RUNWAY - 4;
    e.runner.speed = 10;
    e.update(STEP, hold(true));
    for (let i = 0; i < 10; i++) e.update(STEP, hold(false));
    e.update(STEP, NOTHING); // let go
    const takeoff = e.takeoffX;
    expect(marker()).toBeNull(); // not while in the air
    for (let i = 0; i < 60 * 6 && e.phase !== 'ready'; i++) e.update(STEP, NOTHING);
    expect(e.phase).toBe('ready');
    expect(marker()).toBeCloseTo(takeoff);
  });
});

describe('championship event sets', () => {
  it('classic five or all nine', () => {
    const five = new Session('championship', [{ initials: 'ANN', team: 'red' }], 'normal', false);
    expect(five.series!.events).toEqual(CHAMPIONSHIP_EVENTS);
    const nine = new Session('championship', [{ initials: 'ANN', team: 'red' }], 'normal', false, ALL_EVENTS);
    expect(nine.series!.events).toHaveLength(9);
  });
});
