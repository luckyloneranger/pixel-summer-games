import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Action } from '../core/keymap';
import type { Renderer } from '../core/renderer';
import { Rng } from '../core/rng';
import type { Scene } from '../core/scene-manager';
import { Dash100Event } from '../events/dash100';
import { ANIMATION } from '../game/tuning';
import { PALETTE } from '../gfx/palette';
import { blink } from '../ui/widgets';

/** Any of these ends the demo. */
const WAKE_KEYS: Action[] = [
  'CONFIRM', 'BACK', 'MENU_UP', 'MENU_DOWN', 'MENU_LEFT', 'MENU_RIGHT',
  'P1_LEFT', 'P1_RIGHT', 'P1_ACTION', 'P2_LEFT', 'P2_RIGHT', 'P2_ACTION',
];

/**
 * Attract mode: after the title has sat idle for a while, four CPU runners
 * race the 100 m on their own. Any key goes back to the title.
 */
export class AttractScene implements Scene {
  readonly name = 'DEMO';
  readonly music = 'title' as const;
  private readonly race = new Dash100Event();
  private time = 0;
  private finishedFor = 0;

  constructor(private readonly game: Game) {
    // Its own random numbers, so the demo never disturbs a seeded replay.
    this.race.init({ players: [], difficulty: 'hard', rng: new Rng(Math.floor(Math.random() * 1e9)) });
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (WAKE_KEYS.some((a) => input.justPressed(a))) {
      this.game.scenes.pop();
      return;
    }
    this.race.update(dt, input);
    if (this.race.isFinished()) {
      this.finishedFor += dt;
      if (this.finishedFor > ANIMATION.RESULTS_DELAY + 1) this.game.scenes.pop();
    }
  }

  crowdLevel(): number {
    return this.race.crowdLevel() * 0.5; // a quieter crowd for the demo
  }

  render(r: Renderer): void {
    this.race.render(r);
    r.rect(0, 150, r.width, 14, PALETTE.INK);
    r.text('DEMO', 8, 153, PALETTE.GREY_LIGHT);
    if (blink(this.time, 1, this.game.steady)) r.text(this.game.prompts.start(), r.width / 2, 153, PALETTE.YELLOW, 'center');
  }
}
