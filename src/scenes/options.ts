import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { PALETTE } from '../gfx/palette';
import { drawHeader, leftRight } from '../ui/widgets';

/** Options. Phase 6 has Casual mode; sound and controls arrive in Phases 7-8. */
export class OptionsScene implements Scene {
  readonly name = 'OPTIONS';

  constructor(private readonly game: Game) {}

  update(_dt: number, input: InputSnapshot): void {
    const s = this.game.store.data.settings;
    if (leftRight(input) !== 0 || input.justPressed('CONFIRM')) {
      s.casual = !s.casual;
      this.game.store.save();
    }
    if (input.justPressed('BACK')) this.game.scenes.pop();
  }

  render(r: Renderer): void {
    const s = this.game.store.data.settings;
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'OPTIONS');
    r.text('>', 26, 52, PALETTE.YELLOW);
    r.text('CASUAL MODE', 40, 52, PALETTE.WHITE);
    r.text(`< ${s.casual ? 'ON' : 'OFF'} >`, 200, 52, s.casual ? PALETTE.GREEN : PALETTE.WHITE);
    r.text('MISS A QUALIFYING MARK AND', 40, 70, PALETTE.GREY_LIGHT);
    r.text('KEEP GOING WITH 0 POINTS', 40, 80, PALETTE.GREY_LIGHT);
    r.text('SOUND: PHASE 7', 40, 108, PALETTE.GREY);
    r.text('CONTROLS, SHAKE: PHASE 8', 40, 120, PALETTE.GREY);
    r.text('LEFT/RIGHT: CHANGE  ESC: BACK', r.width / 2, 164, PALETTE.GREY_LIGHT, 'center');
  }
}
