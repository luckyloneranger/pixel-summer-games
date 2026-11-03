import { Dash100Event } from '../events/dash100';
import type { AthleticsEvent, EventId } from '../events/event';
import { Hurdles110Event } from '../events/hurdles110';
import { JavelinEvent } from '../events/javelin';
import { LongJumpEvent } from '../events/long-jump';
import { HighJumpEvent } from '../events/high-jump';

/** Make a fresh event by id. */
export function createEvent(id: EventId): AthleticsEvent {
  switch (id) {
    case 'dash100':
      return new Dash100Event();
    case 'longJump':
      return new LongJumpEvent();
    case 'highJump':
      return new HighJumpEvent();
    case 'javelin':
      return new JavelinEvent();
    case 'hurdles110':
      return new Hurdles110Event();
  }
}
