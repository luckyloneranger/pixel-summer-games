import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { ACHIEVEMENTS } from '../game/achievements';
import { PALETTE } from '../gfx/palette';
import { drawHeader, moveSelection } from '../ui/widgets';

const TOP = 34; // px, first row
const ROW_H = 10; // px between rows
const SHOWN = 10; // rows visible at once (the list scrolls)

/** Every award: earned ones lit up, the rest greyed with how to earn them. */
export class AwardsScene implements Scene {
  readonly name = 'AWARDS';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private selected = 0;

  constructor(private readonly game: Game) {}

  update(_dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK') || input.justPressed('CONFIRM')) {
      this.game.scenes.pop();
      return;
    }
    this.selected = moveSelection(input, this.selected, ACHIEVEMENTS.length);
  }

  render(r: Renderer): void {
    const have = this.game.store.data.achievements;
    const earned = ACHIEVEMENTS.filter((a) => a.id in have).length;
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'AWARDS');
    r.text(`${earned}/${ACHIEVEMENTS.length}`, r.width - 12, 8, PALETTE.YELLOW, 'right');
    // Keep the selected row in view.
    const first = Math.min(Math.max(0, this.selected - SHOWN + 2), ACHIEVEMENTS.length - SHOWN);
    ACHIEVEMENTS.slice(first, first + SHOWN).forEach((a, i) => {
      const y = TOP + i * ROW_H;
      const index = first + i;
      const got = a.id in have;
      if (index === this.selected) r.text('>', 16, y, PALETTE.YELLOW);
      r.rect(30, y + 1, 6, 6, got ? PALETTE.YELLOW : PALETTE.GREY_DARK); // a medal, lit when earned
      r.text(a.name, 42, y, got ? PALETTE.WHITE : PALETTE.GREY);
    });
    const a = ACHIEVEMENTS[this.selected];
    r.text(a.detail, r.width / 2, TOP + SHOWN * ROW_H + 6, PALETTE.CYAN, 'center');
    const when = have[a.id];
    if (when) r.text(`EARNED ${new Date(when).toISOString().slice(0, 10)}`, r.width / 2, TOP + SHOWN * ROW_H + 16, PALETTE.GREY_LIGHT, 'center');
    r.text(this.game.prompts.backTo(), r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}
