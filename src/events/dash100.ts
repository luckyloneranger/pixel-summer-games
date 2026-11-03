import { DASH100 } from '../game/tuning';
import { RaceEvent, type Lane } from './race-event';

export { PLACE_LABELS, PLAYER_LANE, roundHundredths, type Lane } from './race-event';
export type { RacePhase as DashPhase } from './race-event';

/** 100 m dash: one player and three CPU runners, flat out to the line. */
export class Dash100Event extends RaceEvent {
  readonly id = 'dash100';
  readonly name = '100 M DASH';

  constructor() {
    super(DASH100);
  }

  protected createLane(base: Lane): Lane {
    return base;
  }
}
