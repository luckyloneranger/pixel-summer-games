import { describe, expect, it } from 'vitest';
import { Rng, seedFromQuery } from '../src/core/rng';

describe('Rng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('gives a different sequence for a different seed', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('stays within [0, 1) and within range()', () => {
    const rng = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const w = rng.range(1.0, 2.5);
      expect(w).toBeGreaterThanOrEqual(1.0);
      expect(w).toBeLessThan(2.5);
    }
  });

  it('reads ?seed= from the URL', () => {
    expect(seedFromQuery('?seed=777')).toBe(777);
    expect(seedFromQuery('?debug=1&seed=5')).toBe(5);
  });

  it('picks a valid random seed when none is given', () => {
    const s = seedFromQuery('');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});
