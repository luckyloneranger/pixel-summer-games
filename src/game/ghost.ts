// Ghost runner: your best race, replayed alongside you. A run is stored as
// your position (m) every GHOST.SAMPLE seconds after GO.

import { GHOST } from './tuning';

/** Records one run's positions as the race goes. */
export class GhostRecorder {
  readonly samples: number[] = [];

  /** Call every step while racing: `t` s after GO, at `position` m. */
  sample(t: number, position: number): void {
    const due = Math.floor(t / GHOST.SAMPLE);
    while (this.samples.length <= due) this.samples.push(Math.round(position * 100) / 100);
  }
}

/** Where the ghost is `t` s after GO (it stops at its last position). */
export function ghostPosition(samples: readonly number[], t: number): number {
  if (samples.length === 0) return 0;
  const f = t / GHOST.SAMPLE;
  const i = Math.floor(f);
  if (i >= samples.length - 1) return samples[samples.length - 1];
  if (i < 0) return samples[0];
  return samples[i] + (samples[i + 1] - samples[i]) * (f - i);
}
