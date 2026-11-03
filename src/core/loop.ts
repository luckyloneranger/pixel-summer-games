import { LOOP } from '../game/tuning';

/**
 * Turns real frame times into a whole number of fixed logic steps.
 * Fixed steps make the game behave the same on 60 Hz and 144 Hz screens.
 */
export class FixedStepClock {
  readonly step: number;
  private accumulator = 0;

  constructor(
    stepsPerSecond: number = LOOP.STEPS_PER_SECOND,
    private readonly maxFrameTime: number = LOOP.MAX_FRAME_TIME,
  ) {
    this.step = 1 / stepsPerSecond;
  }

  /** Add one frame's elapsed seconds; returns how many logic steps to run now. */
  advance(frameSeconds: number): number {
    this.accumulator += Math.min(Math.max(frameSeconds, 0), this.maxFrameTime);
    let steps = 0;
    // Tiny tolerance so floating-point error doesn't drop a step.
    while (this.accumulator >= this.step - 1e-9) {
      this.accumulator -= this.step;
      steps++;
    }
    if (this.accumulator < 0) this.accumulator = 0;
    return steps;
  }
}

/** Runs update() at a fixed rate and render() once per screen refresh. */
export function startLoop(
  clock: FixedStepClock,
  update: (dt: number) => void,
  render: (nowMs: number) => void,
): void {
  let lastMs = -1;
  const frame = (nowMs: number) => {
    if (lastMs < 0) lastMs = nowMs;
    const steps = clock.advance((nowMs - lastMs) / 1000);
    lastMs = nowMs;
    for (let i = 0; i < steps; i++) update(clock.step);
    render(nowMs);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
