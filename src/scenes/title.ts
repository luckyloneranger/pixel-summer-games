import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { EFFECTS, TITLE } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { MenuScene } from './menu';
import { AttractScene } from './attract';
import { blink } from '../ui/widgets';

/** Placeholder title screen. Art and the attract-mode demo come later. */
export class TitleScene implements Scene {
  readonly name = 'TITLE';
  readonly isMenu = true;
  readonly music = 'title' as const;
  private time = 0;
  private idle = 0; // s since the last key press, for the demo race

  constructor(private readonly game: Game) {}

  enter(): void {
    this.time = 0;
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.idle += dt;
    if (input.justPressed('CONFIRM')) {
      this.idle = 0;
      this.game.scenes.push(new MenuScene(this.game));
    } else if (input.justPressed('BACK') || input.justPressed('MENU_UP') || input.justPressed('MENU_DOWN')) {
      this.idle = 0;
    } else if (this.idle >= EFFECTS.ATTRACT_DELAY) {
      // Nobody is playing: show off with a CPU demo race.
      this.idle = 0;
      this.game.scenes.push(new AttractScene(this.game));
    }
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NIGHT);

    // Simple stand-in track so you can judge pixel sharpness.
    r.rect(0, 140, r.width, 40, PALETTE.ORANGE);
    for (let lane = 0; lane < 4; lane++) r.rect(0, 144 + lane * 9, r.width, 1, PALETTE.WHITE);

    r.text('PIXEL', r.width / 2, 40, PALETTE.YELLOW, 'center', 2);
    r.text('SUMMER GAMES', r.width / 2, 60, PALETTE.YELLOW, 'center', 2);

    const blinkOn = blink(this.time, TITLE.BLINK_PERIOD, this.game.steady);
    if (blinkOn) r.text('PRESS START', r.width / 2, 104, PALETTE.WHITE, 'center');
    r.text('ENTER', r.width / 2, 118, PALETTE.GREY, 'center');
    const top = this.game.store.data.highScores.championship[0];
    if (top) r.text(`HI ${top.score} ${top.initials}`, r.width / 2, 8, PALETTE.WHITE, 'center');
  }
}
