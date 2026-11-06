import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { PALETTE } from '../gfx/palette';
import { type MenuItem, drawHeader, drawMenu, moveSelection, rowAt } from '../ui/widgets';
import { EventSelectScene } from './event-select';
import { HighScoresScene } from './high-scores';
import { HowToPlayScene } from './how-to-play';
import { OptionsScene } from './options';
import { OnlineMenuScene } from './online-menu';
import { AwardsScene } from './awards';
import { PlayerSetupScene } from './player-setup';

const ITEMS: MenuItem[] = [
  { label: 'CHAMPIONSHIP' },
  { label: 'PRACTICE' },
  { label: 'VERSUS' },
  { label: 'ONLINE' },
  { label: 'HIGH SCORES' },
  { label: 'AWARDS' },
  { label: 'HOW TO PLAY' },
  { label: 'OPTIONS' },
];

const MENU_TOP = 36; // px, first row
const MENU_STEP = 13; // px between rows

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
      case 'AWARDS':
        g.scenes.push(new AwardsScene(g));
        break;
      case 'HOW TO PLAY':
        g.scenes.push(new HowToPlayScene(g));
        break;
      case 'OPTIONS':
        g.scenes.push(new OptionsScene(g));
        break;
    }
  }

  selectAt(_x: number, y: number): boolean {
    const i = rowAt(y, MENU_TOP, MENU_STEP, ITEMS.length);
    if (i < 0) return false;
    this.selected = i;
    return true;
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'MAIN MENU');
    drawMenu(r, ITEMS, this.selected, 104, MENU_TOP, MENU_STEP);
    const p = this.game.prompts;
    // Versus shares one keyboard between two players.
    if (p.touch && ITEMS[this.selected].label === 'VERSUS') r.text('VERSUS NEEDS A KEYBOARD', r.width / 2, p.noteY(156), PALETTE.YELLOW, 'center');
    else r.text(`${p.upDown()}: CHOOSE  ${p.okTo('SELECT')}`, r.width / 2, 156, PALETTE.GREY_LIGHT, 'center');
    r.text(this.game.prompts.backTo(), r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}
