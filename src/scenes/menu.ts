import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { PALETTE } from '../gfx/palette';

/** Empty main menu. The real menu arrives in Phase 6. */
export class MenuScene implements Scene {
  readonly name = 'MENU';

  constructor(private readonly game: Game) {}

  update(_dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK')) this.game.scenes.pop();
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NAVY);
    r.text('MAIN MENU', r.width / 2, 24, PALETTE.YELLOW, 'center', 2);
    r.text('COMING IN PHASE 6', r.width / 2, 84, PALETTE.WHITE, 'center');
    r.text('ESC: BACK', r.width / 2, 160, PALETTE.GREY, 'center');
  }
}
