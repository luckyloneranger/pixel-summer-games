import { Dash100Event } from '../events/dash100';
import type { AthleticsEvent, EventId } from '../events/event';
import { Hurdles110Event } from '../events/hurdles110';
import { JavelinEvent } from '../events/javelin';
import { LongJumpEvent } from '../events/long-jump';
import { HighJumpEvent } from '../events/high-jump';
import { TripleJumpEvent } from '../events/triple-jump';
import { PoleVaultEvent } from '../events/pole-vault';
import { HammerEvent } from '../events/hammer';
import { Swim50Event } from '../events/swim50';

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
    case 'tripleJump':
      return new TripleJumpEvent();
    case 'poleVault':
      return new PoleVaultEvent();
    case 'hammer':
      return new HammerEvent();
    case 'swim50':
      return new Swim50Event();
  }
}
