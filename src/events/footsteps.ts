import { AUDIO } from '../game/tuning';
import type { SoundSink } from './event';
import type { TapRunner } from './tap-runner';

/** Sends a footstep cue every stride, pitched by speed, so faster = quicker and higher. */
export class Footsteps {
  private lastStep = 0;

  reset(): void {
    this.lastStep = 0;
  }

  update(runner: TapRunner, sound: SoundSink): void {
    const step = Math.floor(runner.position / AUDIO.STEP_DISTANCE);
    if (step > this.lastStep) {
      this.lastStep = step;
      if (runner.speed > 0) sound.play('footstep', runner.speedFraction);
    }
  }
}

/** Crowd level for an athlete running at `speedFraction` of top speed. */
export function runningCrowd(speedFraction: number): number {
  return AUDIO.CROWD_IDLE + (AUDIO.CROWD_RUNNING - AUDIO.CROWD_IDLE) * speedFraction;
}
