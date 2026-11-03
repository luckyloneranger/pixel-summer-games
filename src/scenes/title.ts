import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { Rng } from '../core/rng';
import { EFFECTS, TITLE } from '../game/tuning';
import { logoLanded, throwConfetti, tickerText, updateConfetti, type Confetto } from '../game/title-show';
import { TitleArt } from '../gfx/title-art';
import { MenuScene } from './menu';
import { AttractScene } from './attract';

const CONFETTI_SEED = 77; // fixed: the burst looks the same every visit
const CONFETTI_FROM_Y = 40; // px, where the burst starts (the middle of the logo)

/**
 * Title: a night-time stadium with a crowd wave, athletes showing off each
 * event, and the logo dropping in. Enter fires the starting pistol and opens
 * the menu. Left alone, it shows a CPU demo race.
 */
export class TitleScene implements Scene {
  readonly name = 'TITLE';
  readonly music = 'title' as const;
  private readonly art = new TitleArt();
  private time = 0;
  private idle = 0; // s since the last key press, for the demo race
  private confetti: Confetto[] = [];
  private thrown = false;
  private flashLeft = 0; // s of starting-pistol flash left before the menu opens

  constructor(private readonly game: Game) {}

  enter(): void {
    // Coming back from the menu or the demo: the logo is already in place.
    if (this.time > 0) this.time = Math.max(this.time, TITLE.LOGO_DROP_TIME);
    this.flashLeft = 0;
  }

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    this.idle += dt;
    this.confetti = updateConfetti(this.confetti, dt, this.game.renderer.height);
    if (!this.thrown && logoLanded(this.time)) {
      this.thrown = true;
      this.confetti = throwConfetti(new Rng(CONFETTI_SEED), this.game.renderer.width / 2, CONFETTI_FROM_Y);
    }

    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      if (this.flashLeft <= 0) this.game.scenes.push(new MenuScene(this.game));
      return;
    }
    if (input.justPressed('CONFIRM')) {
      this.idle = 0;
      this.game.sfx('pistol');
      // With reduced flashing, skip the flash and go straight on.
      this.flashLeft = this.game.steady ? 0 : TITLE.FLASH_TIME;
      if (this.flashLeft === 0) this.game.scenes.push(new MenuScene(this.game));
    } else if (input.justPressed('BACK') || input.justPressed('MENU_UP') || input.justPressed('MENU_DOWN')) {
      this.idle = 0;
    } else if (this.idle >= EFFECTS.ATTRACT_DELAY) {
      // Nobody is playing: show off with a CPU demo race.
      this.idle = 0;
      this.game.scenes.push(new AttractScene(this.game));
    }
  }

  render(r: Renderer): void {
    const data = this.game.store.data;
    this.art.render(r, {
      t: this.time,
      steady: this.game.steady,
      confetti: this.confetti,
      ticker: tickerText(data.personalBests, data.highScores.championship[0]),
      flash: this.flashLeft > 0,
      start: this.game.prompts.start(),
    });
  }

  debugLines(): string[] {
    return [`TIME ${this.time.toFixed(1)}`, `CONFETTI ${this.confetti.length}`];
  }
}
