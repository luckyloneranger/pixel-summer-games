import type { AttemptTracker } from './field-attempts';

/**
 * High jump attempts: the bar goes up through a list of heights. You get up
 * to `triesPerHeight` tries at each; clearing it moves you to the next
 * height, and that many misses in a row at one height ends your event.
 * Each entry in `marks` is the height cleared on that jump, or null for a miss.
 */
export class HeightAttempts implements AttemptTracker {
  readonly marks: (number | null)[] = [];
  /** Index of the height you're trying now. */
  heightIndex = 0;
  /** Misses at the current height. */
  misses = 0;

  constructor(
    readonly heights: readonly number[],
    readonly triesPerHeight: number,
  ) {}

  /** The bar height for the next jump (m). */
  get height(): number {
    return this.heights[Math.min(this.heightIndex, this.heights.length - 1)];
  }

  record(cleared: number | null): void {
    if (this.done) return;
    this.marks.push(cleared);
    if (cleared !== null) {
      this.heightIndex++;
      this.misses = 0;
    } else {
      this.misses++;
    }
  }

  /** Highest height cleared, or null. */
  get best(): number | null {
    return this.heightIndex > 0 ? this.heights[this.heightIndex - 1] : null;
  }

  /** Which try at the current height (1-3). */
  get current(): number {
    return Math.min(this.misses + 1, this.triesPerHeight);
  }

  /** Out after three misses in a row, or done after clearing the top height. */
  get done(): boolean {
    return this.misses >= this.triesPerHeight || this.heightIndex >= this.heights.length;
  }
}
