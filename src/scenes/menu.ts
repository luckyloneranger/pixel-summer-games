import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { Dash100Event } from '../events/dash100';
import type { Difficulty } from '../events/event';
import { PALETTE } from '../gfx/palette';
import { EventPlayScene } from './event-play';

/** Temporary test menu. The full main menu arrives in Phase 6. */
const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const ROWS = ['event', 'difficulty'] as const;

export class MenuScene implements Scene {
  readonly name = 'MENU';
  private row = 0;

  constructor(private readonly game: Game) {}

  update(_dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK')) {
      this.game.scenes.pop();
      return;
    }
    if (input.justPressed('MENU_UP')) this.row = (this.row + ROWS.length - 1) % ROWS.length;
    if (input.justPressed('MENU_DOWN')) this.row = (this.row + 1) % ROWS.length;

    if (ROWS[this.row] === 'difficulty') {
      const step =
        (input.justPressed('P1_RIGHT') || input.justPressed('P2_RIGHT') ? 1 : 0) -
        (input.justPressed('P1_LEFT') || input.justPressed('P2_LEFT') ? 1 : 0);
      if (step !== 0) {
        const i = DIFFICULTIES.indexOf(this.game.settings.difficulty);
        this.game.settings.difficulty = DIFFICULTIES[(i + step + DIFFICULTIES.length) % DIFFICULTIES.length];
      }
    }
    if (input.justPressed('CONFIRM') && ROWS[this.row] === 'event') {
      this.game.scenes.push(new EventPlayScene(this.game, () => new Dash100Event()));
    }
  }

  render(r: Renderer): void {
    r.clear(PALETTE.NAVY);
    r.text('MAIN MENU', r.width / 2, 24, PALETTE.YELLOW, 'center', 2);
    r.text('TEST EVENTS', r.width / 2, 56, PALETTE.GREY_LIGHT, 'center');

    const labels = ['100 M DASH', `DIFFICULTY < ${this.game.settings.difficulty} >`];
    labels.forEach((label, i) => {
      const y = 80 + i * 14;
      const selected = i === this.row;
      if (selected) r.text('>', 64, y, PALETTE.YELLOW);
      r.text(label, 80, y, selected ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
    });

    r.text('FULL MENU IN PHASE 6', r.width / 2, 136, PALETTE.GREY_LIGHT, 'center');
    r.text('UP/DOWN  LEFT/RIGHT  ENTER', r.width / 2, 152, PALETTE.GREY_LIGHT, 'center');
    r.text('ESC: BACK', r.width / 2, 164, PALETTE.GREY_LIGHT, 'center');
  }
}
