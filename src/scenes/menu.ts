import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { PALETTE } from '../gfx/palette';
import { type MenuItem, drawHeader, drawMenu, moveSelection } from '../ui/widgets';
import { EventSelectScene } from './event-select';
import { HighScoresScene } from './high-scores';
import { HowToPlayScene } from './how-to-play';
import { OptionsScene } from './options';
import { OnlineMenuScene } from './online-menu';
import { PlayerSetupScene } from './player-setup';

const ITEMS: MenuItem[] = [
  { label: 'CHAMPIONSHIP' },
  { label: 'PRACTICE' },
  { label: 'VERSUS' },
  { label: 'ONLINE' },
  { label: 'HIGH SCORES' },
  { label: 'HOW TO PLAY' },
  { label: 'OPTIONS' },
];

/** Main menu. */
export class MenuScene implements Scene {
  readonly name = 'MENU';
  readonly isMenu = true;
  readonly music = 'menu' as const;
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
      case 'VERSUS':
        g.scenes.push(new PlayerSetupScene(g, 'versus'));
        break;
      case 'ONLINE':
        g.scenes.push(new OnlineMenuScene(g));
        break;
      case 'PRACTICE':
        g.scenes.push(new EventSelectScene(g));
        break;
      case 'HIGH SCORES':
        g.scenes.push(new HighScoresScene(g, { toTitle: false }));
        break;
      case 'HOW TO PLAY':
        g.scenes.push(new HowToPlayScene(g));
        break;
      case 'OPTIONS':
        g.scenes.push(new OptionsScene(g));
        break;
    }
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'MAIN MENU');
    drawMenu(r, ITEMS, this.selected, 104, 40, 15);
    r.text('UP/DOWN: CHOOSE  ENTER: OK', r.width / 2, 156, PALETTE.GREY_LIGHT, 'center');
    r.text('ESC: BACK', r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}
