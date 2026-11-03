import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { playerLook } from '../events/cpu';
import { PALETTE } from '../gfx/palette';
import { AthleteSprites, RUN_CYCLE, type Pose } from '../gfx/sprites/athlete';
import { drawHeader, leftRight } from '../ui/widgets';

interface Page {
  title: string;
  lines: string[];
  pose: Pose | 'run'; // 'run' animates the run cycle
}

// Lines are at most 36 characters so they fit the 320-pixel screen.
const PAGES: Page[] = [
  {
    title: 'THE BASICS',
    pose: 'run',
    lines: [
      'TAP A AND D IN TURN TO RUN.',
      'THE FASTER YOU TAP, THE FASTER',
      'YOU GO. THE SAME KEY TWICE',
      'OR HOLDING A KEY DOES NOTHING.',
      'W OR SPACE IS THE ACTION KEY.',
      'PLAYER 2: LEFT, RIGHT AND UP.',
      'PHONES: USE THE ON-SCREEN PADS.',
    ],
  },
  {
    title: '100 M DASH',
    pose: 'set',
    lines: [
      'WAIT FOR GO! TAPPING EARLY IS',
      'A FALSE START. TWO FALSE STARTS',
      'AND YOU ARE OUT.',
      'TIP: KEEP A STEADY, FAST RHYTHM.',
      'ABOUT 10 TAPS A SECOND REACHES',
      'TOP SPEED.',
    ],
  },
  {
    title: 'LONG JUMP',
    pose: 'jump',
    lines: [
      'SPRINT, THEN HOLD W TO RAISE',
      'THE ANGLE. LET GO TO JUMP.',
      'RELEASE BEFORE THE RED LINE.',
      'AIM FOR ABOUT 45 DEGREES.',
      'TIP: LET GO RIGHT ON THE WHITE',
      'BOARD FOR A PERFECT TAKE-OFF.',
    ],
  },
  {
    title: 'HIGH JUMP',
    pose: 'flop',
    lines: [
      'RUN UP, HOLD W TO RAISE THE',
      'ANGLE AND LET GO JUST BEFORE',
      'THE LINE. YOU MUST BE HIGHER',
      'THAN THE BAR AS YOU PASS IT.',
      'TIP: GO STEEP (ABOUT 60-70',
      'DEGREES) AND KEEP YOUR SPEED.',
      '3 MISSES IN A ROW AND YOU ARE OUT.',
    ],
  },
  {
    title: 'JAVELIN',
    pose: 'throw',
    lines: [
      'SAME AS THE LONG JUMP, BUT YOU',
      'THROW: HOLD W, LET GO BEFORE',
      'THE LINE. 3 THROWS, BEST COUNTS.',
      'TIP: START HOLDING EARLY - THE',
      'RUNWAY GOES BY FAST AT SPEED.',
    ],
  },
  {
    title: '110 M HURDLES',
    pose: 'jump',
    lines: [
      'RUN WITH A AND D, AND TAP W',
      'TO JUMP EACH HURDLE.',
      'HITTING ONE COSTS SPEED;',
      'NOT JUMPING COSTS MORE.',
      'TIP: AT FULL SPEED, JUMP ABOUT',
      '1 METRE BEFORE THE HURDLE.',
    ],
  },
];

/** Short pages: the basics, then one per event. Left/right to turn pages. */
export class HowToPlayScene implements Scene {
  readonly name = 'HOW TO PLAY';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private page = 0;
  private time = 0;
  private readonly sprites: AthleteSprites;

  constructor(private readonly game: Game) {
    this.sprites = new AthleteSprites(playerLook(game.store.data.settings.team));
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (input.justPressed('BACK')) {
      this.game.scenes.pop();
      return;
    }
    const step = leftRight(input) || (input.justPressed('CONFIRM') ? 1 : 0);
    if (step === 0) return;
    const next = this.page + step;
    if (next >= PAGES.length) this.game.scenes.pop(); // Enter on the last page closes
    else this.page = Math.max(0, next);
  }

  render(r: Renderer): void {
    const p = PAGES[this.page];
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'HOW TO PLAY');
    r.text(p.title, 16, 32, PALETTE.YELLOW);
    r.text(`${this.page + 1}/${PAGES.length}`, r.width - 16, 32, PALETTE.GREY_LIGHT, 'right');
    p.lines.forEach((line, i) => r.text(line, 16, 48 + i * 12, PALETTE.WHITE));
    const pose = p.pose === 'run' ? RUN_CYCLE[Math.floor(this.time * 8) % RUN_CYCLE.length] : p.pose;
    r.image(this.sprites.get(pose), r.width - 36, 128);
    r.text('LEFT/RIGHT: PAGE  ESC: BACK', r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}
