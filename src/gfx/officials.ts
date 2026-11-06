// The officials beside the action: a field judge who raises a white flag for
// a fair attempt or a red one for a foul, and the race starter with the pistol.

import type { Renderer } from '../core/renderer';
import { PALETTE } from './palette';
import type { Look, SpriteLight } from './sprite';
import { ATHLETE_H, ATHLETE_W, AthleteSprites } from './sprites/athlete';

/** Officials wear a navy blazer. */
export const OFFICIAL_LOOK: Look = {
  shirt: PALETTE.NAVY,
  shirtShade: PALETTE.NIGHT,
  skin: PALETTE.SKIN,
  skinShade: PALETTE.SKIN_DARK,
  hair: PALETTE.GREY_LIGHT,
};

/** What the field judge's flag says. */
export type FlagSignal = 'none' | 'white' | 'red';

/** A landed attempt with a mark is fair (white); no mark or a foul is red. */
export function flagFor(phase: string, mark: number | null): FlagSignal {
  if (phase === 'foul') return 'red';
  if (phase === 'landed') return mark !== null ? 'white' : 'red';
  return 'none';
}

/** What the starter is doing: waiting, gun up at "set", or just fired (smoke). */
export type StarterStage = 'idle' | 'set' | 'fired';

const SMOKE_TIME = 0.6; // s the pistol smoke hangs in the air

/** Has the smoke cleared `t` seconds after the gun? */
export function smokeGone(t: number): boolean {
  return t >= SMOKE_TIME;
}

/** Builds the official's sprites once per light, and draws them. */
export class Officials {
  private sprites: AthleteSprites | null = null;
  private light: SpriteLight = 'day';

  private body(light: SpriteLight): AthleteSprites {
    if (!this.sprites || this.light !== light) {
      this.sprites = new AthleteSprites(OFFICIAL_LOOK, false, 1, light);
      this.light = light;
    }
    return this.sprites;
  }

  /** The field judge, feet centred on (x, feetY), with the flag up or down. */
  judge(r: Renderer, x: number, feetY: number, signal: FlagSignal, light: SpriteLight): void {
    const left = Math.round(x - ATHLETE_W / 2);
    const top = Math.round(feetY - ATHLETE_H + 1);
    r.image(this.body(light).get('stand'), left, top);
    const colour = signal === 'red' ? PALETTE.RED : PALETTE.WHITE;
    if (signal === 'none') {
      // Flag rolled up, held down by the side.
      r.rect(left + 12, top + 12, 1, 6, PALETTE.GREY_LIGHT);
      r.rect(left + 13, top + 14, 1, 3, PALETTE.WHITE);
    } else {
      // Arm and flag held high.
      r.rect(left + 12, top + 3, 1, 7, OFFICIAL_LOOK.skin);
      r.rect(left + 12, top - 4, 1, 7, PALETTE.GREY_LIGHT);
      r.rect(left + 13, top - 4, 6, 4, colour);
      r.rect(left + 13, top, 4, 1, colour === PALETTE.RED ? PALETTE.RED_DARK : PALETTE.GREY_LIGHT);
    }
  }

  /** The starter: arm up with the pistol at "set"; a puff of smoke just after the gun. */
  starter(r: Renderer, x: number, feetY: number, stage: StarterStage, sinceGun: number, light: SpriteLight): void {
    const left = Math.round(x - ATHLETE_W / 2);
    const top = Math.round(feetY - ATHLETE_H + 1);
    r.image(this.body(light).get('stand'), left, top);
    if (stage === 'idle') return;
    r.rect(left + 12, top - 1, 1, 10, OFFICIAL_LOOK.skin); // arm straight up
    r.rect(left + 11, top - 3, 3, 2, PALETTE.INK); // the pistol
    r.rect(left + 12, top - 4, 1, 1, PALETTE.GREY_LIGHT); // its shine, so it shows on the dark wall
    if (stage === 'fired' && !smokeGone(sinceGun)) {
      const grow = Math.floor((sinceGun / SMOKE_TIME) * 4);
      r.rect(left + 11 - grow, top - 6 - grow, 3 + grow, 3 + grow, PALETTE.CLOUD);
      r.rect(left + 13, top - 9 - grow * 2, 2 + grow, 2 + grow, PALETTE.GREY_LIGHT);
    }
  }
}
