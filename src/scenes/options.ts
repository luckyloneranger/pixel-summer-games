import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { AUDIO } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { drawHeader, leftRight, moveSelection } from '../ui/widgets';
import { ControlsScene } from './controls';

type Row =
  | 'CASUAL MODE'
  | 'ASSIST RUN'
  | 'REDUCE FLASHING'
  | 'MASTER VOLUME'
  | 'MUSIC VOLUME'
  | 'EFFECTS VOLUME'
  | 'MUTE (M)'
  | 'CONTROLS';
const ROWS: Row[] = [
  'CASUAL MODE',
  'ASSIST RUN',
  'REDUCE FLASHING',
  'MASTER VOLUME',
  'MUSIC VOLUME',
  'EFFECTS VOLUME',
  'MUTE (M)',
  'CONTROLS',
];

/** A short explanation shown under the list for the selected row. */
const HELP: Partial<Record<Row, [string, string]>> = {
  'CASUAL MODE': ['MISS A QUALIFYING MARK AND', 'KEEP GOING WITH 0 POINTS'],
  'ASSIST RUN': ['HOLD A RUN KEY TO REACH 80%', 'SPEED. TAPPING STILL GOES FASTER'],
  'REDUCE FLASHING': ['NO BLINKING TEXT', 'AND NO SCREEN SHAKE'],
  CONTROLS: ['CHANGE THE KEYS FOR', 'PLAYER 1 AND PLAYER 2'],
};

/** Options: game rules, accessibility, sound and controls. All saved. */
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
    const confirm = input.justPressed('CONFIRM');
    const toggle = confirm || step !== 0;
    const s = this.game.store.data.settings;
    const clamp = (v: number) => Math.min(AUDIO.VOLUME_STEPS, Math.max(0, v + step));
    switch (ROWS[this.row]) {
      case 'CASUAL MODE':
        if (toggle) s.casual = !s.casual;
        break;
      case 'ASSIST RUN':
        if (toggle) s.assist = !s.assist;
        break;
      case 'REDUCE FLASHING':
        if (toggle) s.reduceFlashing = !s.reduceFlashing;
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
      case 'CONTROLS':
        if (confirm) this.game.scenes.push(new ControlsScene(this.game));
        return;
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
    const onOff = (b: boolean) => (b ? 'ON' : 'OFF');
    const values: (string | number)[] = [
      onOff(s.casual),
      onOff(s.assist),
      onOff(s.reduceFlashing),
      s.master,
      s.music,
      s.sfx,
      onOff(s.muted),
      '...',
    ];
    ROWS.forEach((label, i) => {
      const y = 30 + i * 13;
      const selected = i === this.row;
      if (selected) r.text('>', 18, y, PALETTE.YELLOW);
      r.text(label, 32, y, selected ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
      const v = values[i];
      if (typeof v === 'number') drawVolumeBar(r, 176, y, v);
      else r.text(v, 176, y, PALETTE.YELLOW);
    });
    const help = HELP[ROWS[this.row]];
    if (help) {
      r.text(help[0], r.width / 2, 138, PALETTE.GREY_LIGHT, 'center');
      r.text(help[1], r.width / 2, 148, PALETTE.GREY_LIGHT, 'center');
    }
    r.text('LEFT/RIGHT: CHANGE  ESC: BACK', r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}

/** A row of blocks: lit up to the volume level. */
function drawVolumeBar(r: Renderer, x: number, y: number, level: number): void {
  for (let i = 0; i < AUDIO.VOLUME_STEPS; i++) {
    r.rect(x + i * 8, y, 6, 7, i < level ? PALETTE.YELLOW : PALETTE.GREY_DARK);
  }
  r.text(String(level), x + AUDIO.VOLUME_STEPS * 8 + 6, y, PALETTE.WHITE);
}
