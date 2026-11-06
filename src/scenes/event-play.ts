import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { AthleticsEvent, EventId } from '../events/event';
import { createEvent } from '../game/events';
import { isBetter, qualifyingMark } from '../game/scoring';
import type { Session } from '../game/session';
import { ANIMATION, REPLAY } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
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
  private replayT: number | null = null; // s into the instant replay (null = not replaying)
  private replayDone = false;

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
      // Your best run's ghost (offline only; the event uses it with one player).
      ghost: online || !this.game.store.data.settings.ghost ? undefined : this.game.store.data.ghosts[this.eventId],
    });
  }

  /** Start this event again from scratch (from the pause menu). */
  restart(): void {
    this.game.scenes.replace(new EventPlayScene(this.game, this.session, this.eventId));
  }

  update(dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK') || input.justPressed('PAUSE')) {
      this.game.scenes.push(new PauseScene(this.game, this, !!this.session.online));
      return;
    }
    // (No debug skip online: the other game would be left behind.)
    if (this.game.debug.visible && input.justPressed('DEBUG_SKIP') && this.session.series && !this.session.online) {
      this.skipWithQualifyingMark();
      return;
    }
    if (this.replayT !== null) {
      // The instant replay: Enter skips it.
      this.replayT += dt;
      if (this.replayDone || input.justPressed('CONFIRM')) this.showResults(this.event.getResults());
      return;
    }
    this.event.update(dt, input);
    if (!this.event.isFinished()) return;
    // Let the finish breathe for a moment (Enter skips), then the replay (if any), then results.
    this.finishedFor += dt;
    if (this.finishedFor >= ANIMATION.RESULTS_DELAY || input.justPressed('CONFIRM')) {
      if (!this.session.online && this.event.hasReplay?.()) this.replayT = 0;
      else this.showResults(this.event.getResults());
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
    this.keepGhostIfBest(results);
    const run = this.session.online ? null : (this.event.ghostRun?.() ?? null);
    this.game.scenes.replace(new ResultsScene(this.game, this.session, this.eventId, results, run));
  }

  onFocusLost(): void {
    // Online the match can't stop for one player, so there's no auto-pause.
    if (!this.event.isFinished() && !this.session.online) this.game.scenes.push(new PauseScene(this.game, this));
  }

  /** Online pause menu: the event keeps running underneath (with no keys pressed). */
  tickUnderPause(dt: number): void {
    this.update(dt, NO_INPUT);
  }

  /** Field events get a big ACTION area on a phone; races keep the plain pads. */
  touchLayout(): 'event' | 'eventWide' {
    return this.event.kind === 'field' ? 'eventWide' : 'event';
  }

  crowdLevel(): number {
    return this.event.crowdLevel?.() ?? 0;
  }

  render(r: Renderer): void {
    if (this.replayT !== null && this.event.renderReplay) {
      this.replayDone = !this.event.renderReplay(r, this.replayT);
      // Letterbox bars and a blinking REPLAY tag, like a TV replay.
      r.rect(0, 0, r.width, REPLAY.BAR_H, PALETTE.BLACK);
      r.rect(0, r.height - REPLAY.BAR_H, r.width, REPLAY.BAR_H, PALETTE.BLACK);
      if (this.game.steady || Math.floor(this.replayT * 2) % 2 === 0) r.text('REPLAY', 6, 3, PALETTE.RED);
      r.text(this.game.prompts.okTo('SKIP'), r.width - 6, r.height - 11, PALETTE.GREY_LIGHT, 'right');
      return;
    }
    this.event.render(r);
  }

  debugLines(): string[] {
    return [...(this.event.debugLines?.() ?? []), 'N: SKIP EVENT'];
  }

  /** A new best race (offline, one player): keep it as the ghost to beat next time. */
  private keepGhostIfBest(results: ReturnType<AthleticsEvent['getResults']>): void {
    const run = this.session.online ? null : (this.event.ghostRun?.() ?? null);
    const me = results.find((r) => r.playerIndex === 0);
    if (!run || !me || me.mark === null || me.disqualified) return;
    const data = this.game.store.data;
    const old = data.personalBests[this.eventId];
    if (old !== undefined && !isBetter(this.eventId, me.mark, old)) return;
    data.ghosts[this.eventId] = run;
    this.game.store.save();
  }
}
