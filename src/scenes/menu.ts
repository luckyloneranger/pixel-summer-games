import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { Dash100Event } from '../events/dash100';
import { PALETTE } from '../gfx/palette';
import { EventPlayScene } from './event-play';

/** Temporary test menu. The full main menu arrives in Phase 6. */
const ITEMS = [{ label: '100 M DASH', create: () => new Dash100Event() }];

export class MenuScene implements Scene {
  readonly name = 'MENU';
  private selected = 0;

  constructor(private readonly game: Game) {}

  update(_dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK')) {
      this.game.scenes.pop();
      return;
    }
    if (input.justPressed('MENU_UP')) this.selected = (this.selected + ITEMS.length - 1) % ITEMS.length;
    if (input.justPressed('MENU_DOWN')) this.selected = (this.selected + 1) % ITEMS.length;
    if (input.justPressed('CONFIRM')) {
      this.game.scenes.push(new EventPlayScene(this.game, ITEMS[this.selected].create()));
    }
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NAVY);
    r.text('MAIN MENU', r.width / 2, 24, PALETTE.YELLOW, 'center', 2);
    r.text('TEST EVENTS', r.width / 2, 56, PALETTE.GREY, 'center');
    ITEMS.forEach((item, i) => {
      const y = 76 + i * 12;
      const isSel = i === this.selected;
      if (isSel) r.text('>', 100, y, PALETTE.YELLOW);
      r.text(item.label, 116, y, isSel ? PALETTE.WHITE : PALETTE.GREY);
    });
    r.text('FULL MENU IN PHASE 6', r.width / 2, 136, PALETTE.GREY, 'center');
    r.text('ENTER: START  ESC: BACK', r.width / 2, 160, PALETTE.GREY, 'center');
  }
}
