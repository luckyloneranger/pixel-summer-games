import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { AUDIO } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { drawHeader, leftRight, moveSelection } from '../ui/widgets';

type Row = 'CASUAL MODE' | 'MASTER VOLUME' | 'MUSIC VOLUME' | 'EFFECTS VOLUME' | 'MUTE (M)';
const ROWS: Row[] = ['CASUAL MODE', 'MASTER VOLUME', 'MUSIC VOLUME', 'EFFECTS VOLUME', 'MUTE (M)'];

/** Options: Casual mode and sound. Controls and shake arrive in Phase 8. */
export class OptionsScene implements Scene {
  readonly name = 'OPTIONS';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private row = 0;

  constructor(private readonly game: Game) {}

  update(_dt: number, input: InputSnapshot): void {
    if (input.justPressed('BACK')) {
      this.game.scenes.pop();
      return;
    }
    this.row = moveSelection(input, this.row, ROWS.length);
    const step = leftRight(input);
    const toggle = input.justPressed('CONFIRM') || step !== 0;
    const s = this.game.store.data.settings;
    const clamp = (v: number) => Math.min(AUDIO.VOLUME_STEPS, Math.max(0, v + step));
    switch (ROWS[this.row]) {
      case 'CASUAL MODE':
        if (toggle) s.casual = !s.casual;
        break;
      case 'MASTER VOLUME':
        s.master = clamp(s.master);
        break;
      case 'MUSIC VOLUME':
        s.music = clamp(s.music);
        break;
      case 'EFFECTS VOLUME':
        s.sfx = clamp(s.sfx);
        break;
      case 'MUTE (M)':
        if (toggle) s.muted = !s.muted;
        break;
    }
    if (toggle) {
      this.game.store.save();
      this.game.applyVolumes();
    }
  }

  render(r: Renderer): void {
    const s = this.game.store.data.settings;
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'OPTIONS');
    const values: (string | number)[] = [s.casual ? 'ON' : 'OFF', s.master, s.music, s.sfx, s.muted ? 'ON' : 'OFF'];
    ROWS.forEach((label, i) => {
      const y = 40 + i * 16;
      const selected = i === this.row;
      if (selected) r.text('>', 18, y, PALETTE.YELLOW);
      r.text(label, 32, y, selected ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
      const v = values[i];
      if (typeof v === 'number') drawVolumeBar(r, 176, y, v);
      else r.text(v, 176, y, PALETTE.YELLOW);
    });
    if (ROWS[this.row] === 'CASUAL MODE') {
      r.text('MISS A QUALIFYING MARK AND', r.width / 2, 124, PALETTE.GREY_LIGHT, 'center');
      r.text('KEEP GOING WITH 0 POINTS', r.width / 2, 134, PALETTE.GREY_LIGHT, 'center');
    }
    r.text('CONTROLS, SHAKE: PHASE 8', r.width / 2, 150, PALETTE.GREY, 'center');
    r.text('LEFT/RIGHT: CHANGE  ESC: BACK', r.width / 2, 164, PALETTE.GREY_LIGHT, 'center');
  }
}

/** A row of blocks: lit up to the volume level. */
function drawVolumeBar(r: Renderer, x: number, y: number, level: number): void {
  for (let i = 0; i < AUDIO.VOLUME_STEPS; i++) {
    r.rect(x + i * 8, y, 6, 7, i < level ? PALETTE.YELLOW : PALETTE.GREY_DARK);
  }
  r.text(String(level), x + AUDIO.VOLUME_STEPS * 8 + 6, y, PALETTE.WHITE);
}
