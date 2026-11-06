// Online field events (run-up events and the hammer): the other player's
// messages about their attempts, worked through in order.

import type { GameMessage } from '../net/protocol';
import type { NetLink } from './event';

/** Messages about one attempt: progress, the release, the mark, a foul. */
export type AttemptMessage = Extract<GameMessage, { k: 'field' | 'release' | 'landed' | 'foul' }>;

/** What the event offers the sync: where it is, how to catch up, how to apply a message. */
export interface AttemptHost {
  /** Number of the attempt in progress (counts every player's attempts). */
  attemptNo(): number;
  /** Finish the current attempt so the next can start; false if its result isn't known yet. */
  catchUp(): boolean;
  /** A message about the attempt in progress. */
  apply(m: AttemptMessage): void;
}

/**
 * Keeps the other player's attempt messages in order. Old ones are dropped;
 * ones for the next attempt make this screen catch up first (or wait for the
 * current attempt's result, which is on its way and arrives in order).
 */
export class AttemptSync {
  private readonly queue: AttemptMessage[] = [];

  constructor(private readonly net: NetLink) {}

  process(host: AttemptHost): void {
    this.queue.push(...this.net.take('field', 'release', 'landed', 'foul'));
    while (this.queue.length) {
      const m = this.queue[0];
      const n = host.attemptNo();
      if (m.n < n) {
        this.queue.shift(); // old news
        continue;
      }
      if (m.n > n) {
        if (host.catchUp()) continue;
        if (m.k === 'field') this.queue.shift(); // progress updates can go; a newer one is coming
        else break; // wait for this attempt's result first
        continue;
      }
      this.queue.shift();
      host.apply(m);
    }
  }
}
