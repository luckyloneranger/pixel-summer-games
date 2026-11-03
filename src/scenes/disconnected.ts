import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { PALETTE } from '../gfx/palette';

/** Shown over an online match when the other player leaves or the connection drops. */
export class DisconnectedScene implements Scene {
  readonly name = 'DISCONNECTED';
  readonly isOverlay = true;
  readonly isMenu = true;

  constructor(
    private readonly game: Game,
    private readonly message: string,
  ) {}

  update(_dt: number, input: InputSnapshot): void {
    if (!input.justPressed('CONFIRM') && !input.justPressed('BACK')) return;
    const g = this.game;
    g.session?.online?.conn.close();
    g.session = null;
    g.scenes.popTo('MENU');
  }

  render(r: Renderer): void {
    const w = 220;
    const h = 60;
    const x = (r.width - w) / 2;
    const y = (r.height - h) / 2;
    r.rect(x - 2, y - 2, w + 4, h + 4, PALETTE.RED);
    r.rect(x, y, w, h, PALETTE.INK);
    r.text(this.message, r.width / 2, y + 14, PALETTE.WHITE, 'center');
    r.text('THE MATCH IS OVER', r.width / 2, y + 28, PALETTE.GREY_LIGHT, 'center');
    r.text(this.game.prompts.okTo('MENU'), r.width / 2, y + 44, PALETTE.YELLOW, 'center');
  }
}
