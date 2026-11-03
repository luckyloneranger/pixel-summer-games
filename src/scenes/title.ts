import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { TITLE } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { MenuScene } from './menu';

/** Placeholder title screen. Art and the attract-mode demo come later. */
export class TitleScene implements Scene {
  readonly name = 'TITLE';
  readonly isMenu = true;
  readonly music = 'title' as const;
  private time = 0;

  constructor(private readonly game: Game) {}

  enter(): void {
    this.time = 0;
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (input.justPressed('CONFIRM')) this.game.scenes.push(new MenuScene(this.game));
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NIGHT);

    // Simple stand-in track so you can judge pixel sharpness.
    r.rect(0, 140, r.width, 40, PALETTE.ORANGE);
    for (let lane = 0; lane < 4; lane++) r.rect(0, 144 + lane * 9, r.width, 1, PALETTE.WHITE);

    r.text('PIXEL', r.width / 2, 40, PALETTE.YELLOW, 'center', 2);
    r.text('SUMMER GAMES', r.width / 2, 60, PALETTE.YELLOW, 'center', 2);

    const blinkOn = this.time % TITLE.BLINK_PERIOD < TITLE.BLINK_PERIOD / 2;
    if (blinkOn) r.text('PRESS START', r.width / 2, 104, PALETTE.WHITE, 'center');
    r.text('ENTER', r.width / 2, 118, PALETTE.GREY, 'center');
    const top = this.game.store.data.highScores.championship[0];
    if (top) r.text(`HI ${top.score} ${top.initials}`, r.width / 2, 8, PALETTE.WHITE, 'center');
  }
}
