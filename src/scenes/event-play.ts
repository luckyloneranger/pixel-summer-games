import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { AthleticsEvent, EventId } from '../events/event';
import { createEvent } from '../game/events';
import { isBetter, qualifyingMark } from '../game/scoring';
import type { Session } from '../game/session';
import { ANIMATION } from '../game/tuning';
import { PauseScene } from './pause';
import { ResultsScene } from './results';
import { Rng } from '../core/rng';
import type { NetLink } from '../events/event';
import type { OnlineMatch } from '../game/session';

/** Each event in an online match gets its own seed: base seed + index x this. */
const ONLINE_SEED_STEP = 7919;

/** An input with nothing pressed (used while the online pause menu is open). */
const NO_INPUT: InputSnapshot = { isDown: () => false, justPressed: () => false, justReleased: () => false };

/** Hand an event the link to the other player. */
function netLink(online: OnlineMatch): NetLink {
  return {
    localIndex: online.localIndex,
    isHost: online.localIndex === 0,
    send: (m) => online.conn.send(m),
    take: (...kinds) => online.conn.take(...kinds),
  };
}

/** Plays one event, then moves on to its results. Esc pauses. */
export class EventPlayScene implements Scene {
  readonly name = 'EVENT';
  readonly music = null;
  private readonly event: AthleticsEvent;
  private finishedFor = 0; // s since the event finished

  constructor(
    private readonly game: Game,
    private readonly session: Session,
    private readonly eventId: EventId,
  ) {
    this.event = createEvent(eventId);
  }

  enter(): void {
    const online = this.session.online;
    this.event.init({
      players: this.session.activePlayers(),
      difficulty: this.session.difficulty,
      // Online, both games use the same seed for this event, so CPUs and timing match.
      rng: online ? new Rng(online.seed + (this.session.series?.index ?? 0) * ONLINE_SEED_STEP) : this.game.rng,
      net: online ? netLink(online) : undefined,
      prompts: this.game.prompts,
      practice: this.session.mode !== 'championship', // only championships have qualifying marks
      sound: this.game.sound,
      effects: this.game.effects,
      assist: this.game.store.data.settings.assist,
    });
  }

  /** Start this event again from scratch (from the pause menu). */
  restart(): void {
    this.game.scenes.replace(new EventPlayScene(this.game, this.session, this.eventId));
  }

  update(dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK')) {
      this.game.scenes.push(new PauseScene(this.game, this, !!this.session.online));
      return;
    }
    // (No debug skip online: the other game would be left behind.)
    if (this.game.debug.visible && input.justPressed('DEBUG_SKIP') && this.session.series && !this.session.online) {
      this.skipWithQualifyingMark();
      return;
    }
    this.event.update(dt, input);
    if (!this.event.isFinished()) return;
    // Let the finish breathe for a moment (Enter skips), then show results.
    this.finishedFor += dt;
    if (this.finishedFor >= ANIMATION.RESULTS_DELAY || input.justPressed('CONFIRM')) {
      this.showResults(this.event.getResults());
    }
  }

  /** Debug key N: pretend every human hit the qualifying mark exactly. */
  private skipWithQualifyingMark(): void {
    const mark = qualifyingMark(this.eventId, this.session.difficulty);
    const results = this.event.getResults().map((r) =>
      r.playerIndex >= 0 ? { ...r, mark, disqualified: false, foul: false } : r,
    );
    // Re-rank: best mark first, no mark last.
    const id = this.eventId;
    results.sort((a, b) => {
      if (a.mark === null || b.mark === null) return a.mark === null ? (b.mark === null ? 0 : 1) : -1;
      return isBetter(id, a.mark, b.mark) ? -1 : isBetter(id, b.mark, a.mark) ? 1 : 0;
    });
    this.showResults(results);
  }

  private showResults(results: ReturnType<AthleticsEvent['getResults']>): void {
    this.game.scenes.replace(new ResultsScene(this.game, this.session, this.eventId, results));
  }

  onFocusLost(): void {
    // Online the match can't stop for one player, so there's no auto-pause.
    if (!this.event.isFinished() && !this.session.online) this.game.scenes.push(new PauseScene(this.game, this));
  }

  /** Online pause menu: the event keeps running underneath (with no keys pressed). */
  tickUnderPause(dt: number): void {
    this.update(dt, NO_INPUT);
  }

  crowdLevel(): number {
    return this.event.crowdLevel?.() ?? 0;
  }

  render(r: Renderer): void {
    this.event.render(r);
  }

  debugLines(): string[] {
    return [...(this.event.debugLines?.() ?? []), 'N: SKIP EVENT'];
  }
}
