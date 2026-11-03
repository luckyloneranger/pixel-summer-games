/** Tracks a field event's attempts: each is a distance in m, or null for a foul. */
export class FieldAttempts {
  readonly marks: (number | null)[] = [];

  constructor(readonly total: number) {}

  record(mark: number | null): void {
    if (!this.done) this.marks.push(mark);
  }

  /** Best valid mark so far, or null if every attempt so far was a foul. */
  get best(): number | null {
    let best: number | null = null;
    for (const m of this.marks) if (m !== null && (best === null || m > best)) best = m;
    return best;
  }

  /** 1-based number of the attempt in progress (or the last one when done). */
  get current(): number {
    return Math.min(this.marks.length + 1, this.total);
  }

  get done(): boolean {
    return this.marks.length >= this.total;
  }
}

/** Distances are measured down to the centimetre below, as in real jumping. */
export function floorCentimetres(metres: number): number {
  return Math.floor(metres * 100 + 1e-6) / 100;
}
