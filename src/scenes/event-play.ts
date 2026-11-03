import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { AthleticsEvent } from '../events/event';
import { ANIMATION } from '../game/tuning';
import { ResultsScene } from './results';

/** Plays one event, then moves on to its results. Esc goes back to the menu. */
export class EventPlayScene implements Scene {
  readonly name = 'EVENT';
  private readonly event: AthleticsEvent;
  private finishedFor = 0; // s since the event finished

  constructor(
    private readonly game: Game,
    private readonly createEvent: () => AthleticsEvent,
  ) {
    this.event = createEvent();
  }

  enter(): void {
    this.event.init({
      players: [{ initials: 'P1' }],
      difficulty: this.game.settings.difficulty,
      rng: this.game.rng,
    });
  }

  update(dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK')) {
      this.game.scenes.pop();
      return;
    }
    this.event.update(dt, input);
    if (!this.event.isFinished()) return;
    // Let the finish breathe for a moment (Enter skips), then show results.
    this.finishedFor += dt;
    if (this.finishedFor >= ANIMATION.RESULTS_DELAY || input.justPressed('CONFIRM')) {
      const retry = () => new EventPlayScene(this.game, this.createEvent);
      this.game.scenes.replace(new ResultsScene(this.game, this.event.name, this.event.getResults(), retry));
    }
  }

  render(r: Renderer): void {
    this.event.render(r);
  }

  debugLines(): string[] {
    return this.event.debugLines?.() ?? [];
  }
}
