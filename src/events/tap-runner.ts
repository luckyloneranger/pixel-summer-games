import { RUNNER } from '../game/tuning';

export type RunKey = 'left' | 'right';
export type RunnerConfig = typeof RUNNER;

/**
 * The alternate-tap speed model. Only a press of the key opposite to the last
 * valid one counts, so mashing one key does nothing. Used by players and CPUs.
 */
export class TapRunner {
  speed = 0; // m/s
  position = 0; // m
  /** Number of valid taps so far (drives the stride animation). */
  taps = 0;
  /**
   * False during the angle meter: taps add nothing and the speed is held
   * steady (no drain), so the athlete keeps moving at their current speed.
   */
  canAccelerate = true;
  private lastKey: RunKey | null = null;
  private time = 0; // s, the runner's own clock for the tap-rate window
  private readonly tapTimes: number[] = [];

  constructor(private readonly cfg: RunnerConfig = RUNNER) {}

  reset(): void {
    this.speed = 0;
    this.position = 0;
    this.taps = 0;
    this.canAccelerate = true;
    this.lastKey = null;
    this.time = 0;
    this.tapTimes.length = 0;
  }

  /** Register a run-key press. Returns true if it was a valid (alternating) tap. */
  tap(key: RunKey): boolean {
    if (key === this.lastKey) return false;
    this.lastKey = key;
    this.taps++;
    this.tapTimes.push(this.time);
    if (this.canAccelerate) {
      this.speed += this.cfg.TAP_IMPULSE * (1 - this.speed / this.cfg.AIM_SPEED);
      this.speed = Math.min(this.speed, this.cfg.MAX_SPEED);
    }
    return true;
  }

  /** The key that must be pressed next for a valid tap (null = either). */
  get nextKey(): RunKey | null {
    if (this.lastKey === null) return null;
    return this.lastKey === 'left' ? 'right' : 'left';
  }

  /** Advance one logic step: drain speed, then move. */
  update(dt: number): void {
    this.time += dt;
    if (this.canAccelerate) {
      this.speed = Math.min(Math.max(0, this.speed - this.cfg.DRAG * dt), this.cfg.MAX_SPEED);
    }
    this.position += this.speed * dt;
    // Forget taps older than the measuring window.
    const cutoff = this.time - this.cfg.TAP_RATE_WINDOW;
    while (this.tapTimes.length > 0 && this.tapTimes[0] < cutoff) this.tapTimes.shift();
  }

  /** Valid taps per second over the last window. */
  get tapRate(): number {
    return this.tapTimes.length / this.cfg.TAP_RATE_WINDOW;
  }

  /** Speed as a fraction of top speed, 0 to 1 (for the speed meter). */
  get speedFraction(): number {
    return this.speed / this.cfg.MAX_SPEED;
  }
}

/**
 * Turn this step's left/right presses into at most one tap. If both keys are
 * pressed in the same instant, only the one the runner needs next counts,
 * so pressing both together isn't a shortcut.
 */
export function applyRunPresses(runner: TapRunner, left: boolean, right: boolean): boolean {
  if (left && right) return runner.tap(runner.nextKey ?? 'left');
  if (left) return runner.tap('left');
  if (right) return runner.tap('right');
  return false;
}
