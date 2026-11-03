/**
 * Seeded random numbers (mulberry32). The same seed always gives the same
 * sequence, so a run can be replayed exactly with ?seed=1234 in the URL.
 */
export class Rng {
  private state: number;

  constructor(readonly seed: number) {
    this.state = seed >>> 0;
  }

  /** A number from 0 (inclusive) to 1 (exclusive). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A number from min (inclusive) to max (exclusive). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}

/** Read ?seed= from a URL query string, or pick a fresh random seed. */
export function seedFromQuery(query: string): number {
  const raw = new URLSearchParams(query).get('seed');
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
  if (Number.isFinite(parsed)) return parsed >>> 0;
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
