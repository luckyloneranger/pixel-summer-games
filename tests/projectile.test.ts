import { describe, expect, it } from 'vitest';
import { AngleMeter } from '../src/events/angle-meter';
import { Projectile, flatRange } from '../src/events/projectile';
import { ANGLE_METER, LONG_JUMP, RUNNER } from '../src/game/tuning';
import { STEP } from './helpers';

function fly(speed: number, angle: number, g = 9.81): Projectile {
  const p = new Projectile(g);
  p.launch(0, 0, speed, angle);
  for (let i = 0; i < 10_000 && !p.landed; i++) p.update(STEP);
  return p;
}

describe('Projectile', () => {
  it('lands where the textbook formula says', () => {
    for (const angle of [15, 30, 45, 60]) {
      expect(fly(10, angle).x).toBeCloseTo(flatRange(10, angle, 9.81), 6);
    }
  });

  it('goes furthest at 45°', () => {
    const at45 = fly(10, 45).x;
    expect(at45).toBeGreaterThan(fly(10, 40).x);
    expect(at45).toBeGreaterThan(fly(10, 50).x);
  });

  it('rises then falls, and tilts down on the way down', () => {
    const p = new Projectile(9.81);
    p.launch(0, 0, 10, 45);
    p.update(0.1);
    expect(p.y).toBeGreaterThan(0);
    expect(p.headingDegrees).toBeGreaterThan(0);
    p.update(p.flightTime - 0.15);
    expect(p.headingDegrees).toBeLessThan(0);
  });

  it('does not depend on the step size', () => {
    const a = new Projectile(9.81);
    const b = new Projectile(9.81);
    a.launch(0, 0, 9, 40);
    b.launch(0, 0, 9, 40);
    while (!a.landed) a.update(1 / 60);
    while (!b.landed) b.update(1 / 7);
    expect(a.x).toBeCloseTo(b.x, 9);
  });

  it('a long jump near 45° at top speed lands about 8.5 m (SPEC Phase 3)', () => {
    const range = flatRange(RUNNER.MAX_SPEED * LONG_JUMP.LAUNCH_EFFICIENCY, 45, LONG_JUMP.GRAVITY);
    expect(range).toBeGreaterThan(8.3);
    expect(range).toBeLessThan(8.7);
  });
});

describe('AngleMeter', () => {
  it('does nothing until started', () => {
    const m = new AngleMeter();
    m.update(1);
    expect(m.angle).toBe(0);
  });

  it('rises at the set rate and stops at the cap', () => {
    const m = new AngleMeter();
    m.start();
    m.update(0.25);
    expect(m.angle).toBeCloseTo(ANGLE_METER.RATE * 0.25);
    m.update(10);
    expect(m.angle).toBe(ANGLE_METER.MAX);
  });

  it('locks on release', () => {
    const m = new AngleMeter();
    m.start();
    m.update(0.5);
    const locked = m.release();
    m.update(1);
    expect(m.angle).toBe(locked);
    expect(m.state).toBe('locked');
  });
});
