import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import type { AthleticsEvent } from '../events/event';
import { PALETTE } from '../gfx/palette';

/** Plays one event. Enter retries once it's over; Esc goes back to the menu. */
export class EventPlayScene implements Scene {
  readonly name = 'EVENT';

  constructor(
    private readonly game: Game,
    private readonly event: AthleticsEvent,
  ) {}

  enter(): void {
    this.start();
  }

  private start(): void {
    this.event.init({ players: [{ initials: 'P1' }], difficulty: 'normal', rng: this.game.rng });
  }

  update(dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK')) {
      this.game.scenes.pop();
      return;
    }
    if (this.event.isFinished() && input.justPressed('CONFIRM')) {
      this.start();
      return;
    }
    this.event.update(dt, input);
  }

  render(r: Renderer): void {
    this.event.render(r);
    if (this.event.isFinished()) {
      r.text('ENTER: RUN AGAIN  ESC: MENU', r.width / 2, 84, PALETTE.WHITE, 'center');
    }
  }

  debugLines(): string[] {
    return this.event.debugLines?.() ?? [];
  }
}
