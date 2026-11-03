import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { PALETTE } from '../gfx/palette';
import { type MenuItem, drawMenu, moveSelection } from '../ui/widgets';
import type { EventPlayScene } from './event-play';
import { OptionsScene } from './options';

const ITEMS: MenuItem[] = [
  { label: 'RESUME' },
  { label: 'RESTART EVENT' },
  { label: 'OPTIONS' },
  { label: 'QUIT TO MENU' },
];

/** Pause overlay, drawn over the frozen event. */
export class PauseScene implements Scene {
  readonly name = 'PAUSE';
  readonly isMenu = true;
  readonly isOverlay = true;
  private selected = 0;

  constructor(
    private readonly game: Game,
    private readonly play: EventPlayScene,
  ) {}

  update(_dt: number, input: InputSnapshot): void {
    const g = this.game;
    if (input.justPressed('BACK')) {
      g.scenes.pop();
      return;
    }
    this.selected = moveSelection(input, this.selected, ITEMS.length);
    if (!input.justPressed('CONFIRM')) return;
    switch (ITEMS[this.selected].label) {
      case 'RESUME':
        g.scenes.pop();
        break;
      case 'RESTART EVENT':
        g.scenes.pop();
        this.play.restart();
        break;
      case 'OPTIONS':
        g.scenes.push(new OptionsScene(g));
        break;
      case 'QUIT TO MENU':
        g.session = null;
        g.scenes.popTo('MENU');
        break;
    }
  }

  render(r: Renderer): void {
    const w = 160;
    const h = 92;
    const x = (r.width - w) / 2;
    const y = (r.height - h) / 2;
    r.rect(x - 2, y - 2, w + 4, h + 4, PALETTE.YELLOW);
    r.rect(x, y, w, h, PALETTE.INK);
    r.text('PAUSED', r.width / 2, y + 8, PALETTE.YELLOW, 'center', 2);
    drawMenu(r, ITEMS, this.selected, x + 32, y + 34, 13);
  }
}
