import { ANGLE_METER } from '../game/tuning';

/**
 * Hold Action to raise the angle from 0°, release to lock it.
 * Shared by the long jump and the javelin.
 */
export class AngleMeter {
  angle = 0; // degrees
  state: 'idle' | 'rising' | 'locked' = 'idle';

  constructor(
    private readonly rate: number = ANGLE_METER.RATE,
    private readonly max: number = ANGLE_METER.MAX,
  ) {}

  reset(): void {
    this.angle = 0;
    this.state = 'idle';
  }

  start(): void {
    if (this.state === 'idle') this.state = 'rising';
  }

  update(dt: number): void {
    if (this.state === 'rising') this.angle = Math.min(this.max, this.angle + this.rate * dt);
  }

  /** Lock the angle and return it. */
  release(): number {
    this.state = 'locked';
    return this.angle;
  }
}
