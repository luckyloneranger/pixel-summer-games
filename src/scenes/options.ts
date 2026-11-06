import type { Game } from '../core/game';
import { drawBackdrop, drawPanel } from '../ui/backdrop';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { AUDIO } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { drawHeader, leftRight, moveSelection, rowAt } from '../ui/widgets';
import { ControlsScene } from './controls';

type Row =
  | 'CASUAL MODE'
  | 'ASSIST RUN'
  | 'REDUCE FLASHING'
  | 'RETRO TV'
  | 'GHOST RUNNER'
  | 'LEADERBOARD'
  | 'MASTER VOLUME'
  | 'MUSIC VOLUME'
  | 'EFFECTS VOLUME'
  | 'MUTE (M)'
  | 'CONTROLS';
const ROWS: Row[] = [
  'CASUAL MODE',
  'ASSIST RUN',
  'REDUCE FLASHING',
  'RETRO TV',
  'GHOST RUNNER',
  'LEADERBOARD',
  'MASTER VOLUME',
  'MUSIC VOLUME',
  'EFFECTS VOLUME',
  'MUTE (M)',
  'CONTROLS',
];

const ROW_H = 9; // px between option rows (11 rows fit above the help lines)

/** A short explanation shown under the list for the selected row. */
const HELP: Partial<Record<Row, [string, string]>> = {
  'CASUAL MODE': ['MISS A QUALIFYING MARK AND', 'KEEP GOING WITH 0 POINTS'],
  'ASSIST RUN': ['HOLD RUN TO REACH 80% OF TOP', 'SPEED. TAPPING STILL GOES FASTER'],
  'REDUCE FLASHING': ['NO BLINKING, FLASHES, SHAKE', 'OR SLOW-MOTION ZOOM'],
  'RETRO TV': ['SCANLINES AND DARK CORNERS', 'LIKE AN OLD TELEVISION'],
  'GHOST RUNNER': ['RACE AGAINST YOUR BEST RUN', '(ONE PLAYER, NOT ONLINE)'],
  LEADERBOARD: ['SEND YOUR INITIALS AND BESTS', 'TO THE WEEKLY ONLINE TOP 10'],
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
      case 'RETRO TV':
        if (toggle) s.crt = !s.crt;
        break;
      case 'GHOST RUNNER':
        if (toggle) s.ghost = !s.ghost;
        break;
      case 'LEADERBOARD':
        if (toggle) s.leaderboard = !s.leaderboard;
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
        // Keys can't be changed without a keyboard (pressing one switches to keyboard hints).
        if (confirm && !this.game.prompts.touch) this.game.scenes.push(new ControlsScene(this.game));
        return;
    }
    if (toggle) {
      this.game.store.save();
      this.game.applyVolumes();
    }
  }

  /** Tap a row to pick it; tap it again to change it. */
  selectAt(_x: number, y: number): boolean {
    const i = rowAt(y, 28, ROW_H, ROWS.length);
    if (i < 0) return false;
    const again = i === this.row;
    this.row = i;
    return again;
  }

  render(r: Renderer): void {
    const s = this.game.store.data.settings;
    drawBackdrop(r);
    drawHeader(r, 'OPTIONS');
    drawPanel(r, 10, 25, 300, ROWS.length * ROW_H + 9);
    const onOff = (b: boolean) => (b ? 'ON' : 'OFF');
    const values: (string | number)[] = [
      onOff(s.casual),
      onOff(s.assist),
      onOff(s.reduceFlashing),
      onOff(s.crt),
      onOff(s.ghost),
      onOff(s.leaderboard),
      s.master,
      s.music,
      s.sfx,
      onOff(s.muted),
      '...',
    ];
    ROWS.forEach((label, i) => {
      const y = 28 + i * ROW_H;
      const selected = i === this.row;
      if (selected) r.text('>', 18, y, PALETTE.YELLOW);
      r.text(label, 32, y, selected ? PALETTE.WHITE : PALETTE.GREY_LIGHT);
      const v = values[i];
      if (typeof v === 'number') drawVolumeBar(r, 176, y, v);
      else r.text(v, 176, y, PALETTE.YELLOW);
    });
    const touchControls = ROWS[this.row] === 'CONTROLS' && this.game.prompts.touch;
    const help = touchControls ? ['NEEDS A KEYBOARD:', 'PLUG ONE IN TO CHANGE THE KEYS'] : HELP[ROWS[this.row]];
    if (help) {
      const y = this.game.prompts.noteY(148) - 10; // two lines, the second just above the phone bar
      r.text(help[0], r.width / 2, y, PALETTE.GREY_LIGHT, 'center');
      r.text(help[1], r.width / 2, y + 10, PALETTE.GREY_LIGHT, 'center');
    }
    r.text(this.game.prompts.hint(`${this.game.prompts.leftRight()}: CHANGE`, this.game.prompts.backTo()), r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}

/** A row of blocks: lit up to the volume level. */
function drawVolumeBar(r: Renderer, x: number, y: number, level: number): void {
  for (let i = 0; i < AUDIO.VOLUME_STEPS; i++) {
    r.rect(x + i * 8, y, 6, 7, i < level ? PALETTE.YELLOW : PALETTE.GREY_DARK);
  }
  r.text(String(level), x + AUDIO.VOLUME_STEPS * 8 + 6, y, PALETTE.WHITE);
}
