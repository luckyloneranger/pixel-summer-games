import { describe, expect, it } from 'vitest';
import { GhostRecorder, ghostPosition } from '../src/game/ghost';
import { GHOST } from '../src/game/tuning';
import { Dash100Event } from '../src/events/dash100';
import { Rng } from '../src/core/rng';
import { NOTHING, STEP, pressed } from './helpers';
import { ghostPixels, mapToPixels } from '../src/gfx/sprite';
import { ATHLETE_FRAMES, makeLook } from '../src/gfx/sprites/athlete';
import { PALETTE } from '../src/gfx/palette';

/** Run a 100 m with one or two humans, tapping steadily. */
function race(players: number, ghost?: number[]): Dash100Event {
  const e = new Dash100Event();
  const ps = [{ initials: 'ANN', index: 0 }, { initials: 'BOB', index: 1 }].slice(0, players);
  e.init({ players: ps, difficulty: 'normal', rng: new Rng(5), ghost });
  for (let i = 0; i < 60 * 40 && !e.isFinished(); i++) {
    if (e.phase !== 'running') e.update(STEP, NOTHING);
    else e.update(STEP, i % 6 === 0 ? pressed(i % 12 ? 'P1_LEFT' : 'P1_RIGHT', i % 12 ? 'P2_LEFT' : 'P2_RIGHT') : NOTHING);
  }
  return e;
}

describe('ghost runner', () => {
  it('records positions at a steady rate and replays them smoothly', () => {
    const rec = new GhostRecorder();
    for (let t = 0; t <= 1; t += 1 / 60) rec.sample(t, t * 10); // 10 m/s
    expect(rec.samples.length).toBeGreaterThanOrEqual(Math.floor(1 / GHOST.SAMPLE));
    expect(ghostPosition(rec.samples, 0.5)).toBeCloseTo(5, 0);
    expect(ghostPosition(rec.samples, 0.525)).toBeGreaterThan(ghostPosition(rec.samples, 0.5));
    expect(ghostPosition(rec.samples, 99)).toBe(rec.samples[rec.samples.length - 1]); // waits at the end
  });

  it('a solo race gives back a run that reaches the line', () => {
    const e = race(1);
    const run = e.ghostRun()!;
    expect(run).not.toBeNull();
    expect(run[run.length - 1]).toBe(100);
    // About one sample per 0.05 s of the finish time.
    const time = e.getResults().find((r) => r.playerIndex === 0)!.mark!;
    expect(run.length).toBeGreaterThanOrEqual(Math.floor(time / GHOST.SAMPLE));
  });

  it('two players on one keyboard: no ghost', () => {
    expect(race(2).ghostRun()).toBeNull();
  });

  it('racing with a ghost changes nothing about the result', () => {
    const plain = race(1);
    const withGhost = race(1, plain.ghostRun()!);
    expect(withGhost.getResults()).toEqual(plain.getResults());
  });

  it('ghost sprites are a pale checkerboard of the athlete', () => {
    const px = mapToPixels(ATHLETE_FRAMES.stand, makeLook('red', 'light', PALETTE.INK));
    const g = ghostPixels(px);
    const colours = new Set(g.flat().filter((c) => c !== null));
    expect([...colours]).toEqual([PALETTE.CLOUD]);
    expect(g.flat().filter((c) => c !== null).length).toBeLessThan(px.flat().filter((c) => c !== null).length);
  });
});
