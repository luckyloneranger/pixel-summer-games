import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { PALETTE } from '../gfx/palette';
import { type MenuItem, drawHeader, drawMenu, moveSelection } from '../ui/widgets';
import { EventSelectScene } from './event-select';
import { HighScoresScene } from './high-scores';
import { OptionsScene } from './options';
import { PlayerSetupScene } from './player-setup';

const ITEMS: MenuItem[] = [
  { label: 'CHAMPIONSHIP' },
  { label: 'PRACTICE' },
  { label: 'VERSUS', enabled: false, note: 'PHASE 8' },
  { label: 'HIGH SCORES' },
  { label: 'HOW TO PLAY', enabled: false, note: 'PHASE 9' },
  { label: 'OPTIONS' },
];

/** Main menu. */
export class MenuScene implements Scene {
  readonly name = 'MENU';
  private selected = 0;

  constructor(private readonly game: Game) {}

  update(_dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK')) {
      this.game.scenes.pop();
      return;
    }
    this.selected = moveSelection(input, this.selected, ITEMS.length);
    if (!input.justPressed('CONFIRM') || ITEMS[this.selected].enabled === false) return;
    const g = this.game;
    switch (ITEMS[this.selected].label) {
      case 'CHAMPIONSHIP':
        g.scenes.push(new PlayerSetupScene(g));
        break;
      case 'PRACTICE':
        g.scenes.push(new EventSelectScene(g));
        break;
      case 'HIGH SCORES':
        g.scenes.push(new HighScoresScene(g, { toTitle: false }));
        break;
      case 'OPTIONS':
        g.scenes.push(new OptionsScene(g));
        break;
    }
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'MAIN MENU');
    drawMenu(r, ITEMS, this.selected, 104, 48, 16);
    r.text('UP/DOWN: CHOOSE  ENTER: OK', r.width / 2, 156, PALETTE.GREY_LIGHT, 'center');
    r.text('ESC: BACK', r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}
