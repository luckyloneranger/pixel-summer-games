import type { Game } from '../core/game';
import { drawBackdrop } from '../ui/backdrop';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { REMAPPABLE, defaultControls, keyName, remapKey } from '../core/keymap';
import { PALETTE } from '../gfx/palette';
import { blink, drawHeader, moveSelection } from '../ui/widgets';

const LABELS: Record<string, string> = {
  P1_LEFT: 'P1 LEFT',
  P1_RIGHT: 'P1 RIGHT',
  P1_ACTION: 'P1 ACTION',
  P2_LEFT: 'P2 LEFT',
  P2_RIGHT: 'P2 RIGHT',
  P2_ACTION: 'P2 ACTION',
};
const RESET_ROW = REMAPPABLE.length;

/** Remap the gameplay keys: pick an action, press Enter, then press the new key. */
export class ControlsScene implements Scene {
  readonly name = 'CONTROLS';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private row = 0;
  private listening = false;
  private message = '';
  private time = 0;

  constructor(private readonly game: Game) {}

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    const g = this.game;
    const s = g.store.data.settings;
    if (this.listening) {
      const key = g.input.takeLastKey();
      if (!key) return;
      this.listening = false;
      if (key === 'Escape') {
        this.message = 'CANCELLED';
        return;
      }
      const next = remapKey(s.controls, REMAPPABLE[this.row], key);
      if (!next) {
        this.message = `${keyName(key)} IS USED BY MENUS`;
        return;
      }
      s.controls = next;
      this.save(`${LABELS[REMAPPABLE[this.row]]} = ${keyName(key)}`);
      return;
    }
    if (input.justPressed('BACK')) {
      g.scenes.pop();
      return;
    }
    this.row = moveSelection(input, this.row, REMAPPABLE.length + 1);
    if (!input.justPressed('CONFIRM')) return;
    if (this.row === RESET_ROW) {
      s.controls = null;
      this.save('KEYS RESET');
    } else {
      g.input.takeLastKey(); // forget the Enter that started listening
      this.listening = true;
      this.message = '';
    }
  }

  private save(message: string): void {
    this.game.store.save();
    this.game.applyControls();
    this.message = message;
  }

  render(r: Renderer): void {
    drawBackdrop(r);
    drawHeader(r, 'CONTROLS');
    const controls = this.game.store.data.settings.controls ?? defaultControls();
    REMAPPABLE.forEach((action, i) => {
      const y = 32 + i * 14;
      const selected = i === this.row;
      if (selected) r.text('>', 26, y, PALETTE.YELLOW);
      r.text(LABELS[action], 40, y, selected ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
      const waiting = selected && this.listening;
      if (waiting) {
        if (blink(this.time, 0.5, this.game.steady)) r.text('PRESS A KEY', 160, y, PALETTE.YELLOW);
      } else {
        r.text(controls[action].map(keyName).join('/'), 160, y, PALETTE.YELLOW);
      }
    });
    const resetY = 32 + RESET_ROW * 14 + 6;
    if (this.row === RESET_ROW) r.text('>', 26, resetY, PALETTE.YELLOW);
    r.text('RESET TO DEFAULTS', 40, resetY, this.row === RESET_ROW ? PALETTE.WHITE : PALETTE.GREY_LIGHT);

    if (this.message) r.text(this.message, r.width / 2, 140, PALETTE.CYAN, 'center');
    const p = this.game.prompts;
    const help = this.listening ? `PRESS THE NEW KEY  ${p.back()}: CANCEL` : p.hint(p.okTo('CHANGE'), p.backTo());
    r.text(help, r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}
