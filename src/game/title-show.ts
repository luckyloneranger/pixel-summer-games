// What happens on the title screen, as plain numbers: where the logo is, the
// crowd wave, the background athletes, confetti and the bottom ticker.
// No drawing here (see src/gfx/title-art.ts), so it can be unit-tested.

import type { Rng } from '../core/rng';
import type { EventId } from '../events/event';
import type { Pose, TeamKit } from '../gfx/sprites/athlete';
import { RUN_CYCLE } from '../gfx/sprites/athlete';
import { PALETTE } from '../gfx/palette';
import type { HighScore, PersonalBests } from './records';
import { EVENT_KIND, EVENT_NAMES } from './scoring';
import { CHAMPIONSHIP_EVENTS } from './championship';
import { TITLE } from './tuning';

// ------------------------------------------------------------------ logo

/** How far (px) the logo is still above its resting place, t s after the title opened. */
export function logoOffset(t: number): number {
  const p = Math.min(1, Math.max(0, t / TITLE.LOGO_DROP_TIME));
  return Math.round(TITLE.LOGO_DROP_FROM * (1 - bounce(p)));
}

/** 0 → 1 with three shrinking bounces at the end (like a dropped ball). */
function bounce(p: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
}

/** Has the logo landed (first touch), so the confetti can fly? */
export function logoLanded(t: number): boolean {
  return t >= TITLE.LOGO_DROP_TIME / 2.75; // the bounce first reaches the bottom here
}

/** Which letter of the logo the shine is on (-1 = no shine right now). */
export function shineLetter(t: number, letters: number): number {
  const into = (t % TITLE.SHINE_EVERY) - (TITLE.SHINE_EVERY - TITLE.SHINE_TIME);
  if (t < TITLE.LOGO_DROP_TIME || into < 0) return -1;
  return Math.min(letters - 1, Math.floor((into / TITLE.SHINE_TIME) * letters));
}

// ------------------------------------------------------------- stadium

/** Centre x (px) of the Mexican wave in the crowd, or null between waves. */
export function waveCentre(t: number, screenWidth: number): number | null {
  const x = (t % TITLE.WAVE_PERIOD) * TITLE.WAVE_SPEED - TITLE.WAVE_WIDTH;
  return x <= screenWidth + TITLE.WAVE_WIDTH ? x : null;
}

/** Angle (radians from straight down) of a floodlight beam. The two sides swing opposite ways. */
export function beamAngle(t: number, side: -1 | 1): number {
  return side * (0.75 + TITLE.FLOODLIGHT_SWING * Math.sin((t / TITLE.FLOODLIGHT_PERIOD) * Math.PI * 2));
}

// -------------------------------------------------------------- confetti

export interface Confetto {
  x: number; // px
  y: number; // px
  vx: number; // px/s
  vy: number; // px/s
  colour: string;
}

const CONFETTI_COLOURS = [PALETTE.YELLOW, PALETTE.RED, PALETTE.CYAN, PALETTE.GREEN, PALETTE.WHITE, PALETTE.PURPLE];

/** A burst of confetti thrown up from the logo. */
export function throwConfetti(rng: Rng, cx: number, y: number): Confetto[] {
  return Array.from({ length: TITLE.CONFETTI_COUNT }, (_, i) => ({
    x: cx + rng.range(-100, 100),
    y: y + rng.range(-4, 4),
    vx: rng.range(-TITLE.CONFETTI_DRIFT, TITLE.CONFETTI_DRIFT),
    vy: rng.range(-70, -20), // up first, then gravity brings it down
    colour: CONFETTI_COLOURS[i % CONFETTI_COLOURS.length],
  }));
}

/** Move confetti on; pieces that fall off the bottom are dropped. */
export function updateConfetti(pieces: Confetto[], dt: number, floor: number): Confetto[] {
  for (const c of pieces) {
    c.vy += TITLE.CONFETTI_FALL * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
  }
  return pieces.filter((c) => c.y < floor);
}

// ---------------------------------------------------------- the parade

/** Something to draw in a background act. Positions in screen px; `feet` is where the soles touch. */
export type ParadeItem =
  | { k: 'athlete'; x: number; feet: number; pose: Pose; kit: TeamKit }
  | { k: 'javelin'; x: number; y: number; angle: number } // angle: radians, up is positive
  | { k: 'pit'; x: number; w: number; feet: number }
  | { k: 'mat'; x: number; w: number; feet: number }
  | { k: 'bar'; x: number; height: number; feet: number }
  | { k: 'puff'; x: number; y: number };

export const PARADE_ACTS = ['sprint', 'longJump', 'javelin', 'highJump'] as const;
export type ParadeAct = (typeof PARADE_ACTS)[number];

// Where things stand in each act (screen px; drawing layout, not gameplay).
const LANE_FEET = [123, 137, 151, 165]; // feet line in each of the 4 lanes
const START_X = -20;
const LJ = { TAKEOFF: 170, LAND: 236, PEAK: 22, AIR: 0.6, PIT: 200 };
const JV = { THROW_AT: 100, LAND_X: 300, PEAK: 26, AIR: 2.0 }; // low arc: stays below PRESS START
const HJ = { TAKEOFF: 165, BAR: 196, LAND: 222, PEAK: 34, AIR: 0.7, BAR_HEIGHT: 24, MAT: 204 };

/** Which act is on and how far into it (s). */
export function currentAct(t: number): { act: ParadeAct; t: number } {
  const n = Math.floor(t / TITLE.ACT_TIME);
  return { act: PARADE_ACTS[n % PARADE_ACTS.length], t: t - n * TITLE.ACT_TIME };
}

/** Everything in the background act at time t. */
export function parade(t: number): ParadeItem[] {
  const { act, t: at } = currentAct(t);
  switch (act) {
    case 'sprint':
      return sprint(at);
    case 'longJump':
      return longJump(at);
    case 'javelin':
      return javelin(at);
    case 'highJump':
      return highJump(at);
  }
}

const runPose = (x: number): Pose => RUN_CYCLE[Math.floor(Math.abs(x) / 8) % RUN_CYCLE.length];

/** Three runners race across; the red one is a touch quicker. */
function sprint(t: number): ParadeItem[] {
  const runners: [TeamKit, number, number][] = [
    ['blue', 0, 0.9],
    ['red', 1, 1.0],
    ['green', 2, 0.84],
  ];
  return runners.map(([kit, lane, pace]) => {
    const x = START_X + TITLE.RUN_SPEED * 1.3 * pace * t;
    return { k: 'athlete', x, feet: LANE_FEET[lane + 1], pose: runPose(x), kit };
  });
}

/** Run up, take off at the board, fly and land in the sand, then celebrate. */
function longJump(t: number): ParadeItem[] {
  const feet = LANE_FEET[3];
  const items: ParadeItem[] = [{ k: 'pit', x: LJ.PIT, w: 64, feet }];
  const runTime = (LJ.TAKEOFF - START_X) / TITLE.RUN_SPEED;
  if (t < runTime) {
    const x = START_X + TITLE.RUN_SPEED * t;
    items.push({ k: 'athlete', x, feet, pose: runPose(x), kit: 'yellow' });
  } else if (t < runTime + LJ.AIR) {
    const p = (t - runTime) / LJ.AIR;
    const x = LJ.TAKEOFF + (LJ.LAND - LJ.TAKEOFF) * p;
    items.push({ k: 'athlete', x, feet: feet - arc(p) * LJ.PEAK, pose: 'jump', kit: 'yellow' });
  } else {
    const after = t - runTime - LJ.AIR;
    items.push({ k: 'athlete', x: LJ.LAND, feet, pose: after < 0.5 ? 'land' : 'celebrate', kit: 'yellow' });
    items.push(...puffs(LJ.LAND + 8, feet, after));
  }
  return items;
}

/** Run up, throw, and the javelin flies across and sticks in the grass. */
function javelin(t: number): ParadeItem[] {
  const feet = LANE_FEET[2];
  const runTime = (JV.THROW_AT - START_X) / TITLE.RUN_SPEED;
  const items: ParadeItem[] = [];
  if (t < runTime) {
    const x = START_X + TITLE.RUN_SPEED * t;
    items.push({ k: 'athlete', x, feet, pose: runPose(x), kit: 'purple' });
    return items;
  }
  const after = t - runTime;
  items.push({ k: 'athlete', x: JV.THROW_AT, feet, pose: after < 1.5 ? 'throw' : 'celebrate', kit: 'purple' });
  const p = Math.min(1, after / JV.AIR);
  const startX = JV.THROW_AT + 10;
  const startY = feet - 18;
  const x = startX + (JV.LAND_X - startX) * p;
  // A parabola from the hand to the ground; the javelin points along its path.
  const y = startY + (feet - startY) * p - arc(p) * JV.PEAK;
  const slope = (feet - startY) / (JV.LAND_X - startX) - (JV.PEAK * (4 - 8 * p)) / (JV.LAND_X - startX);
  items.push({ k: 'javelin', x, y, angle: -Math.atan(slope) });
  if (p >= 1) items.push(...puffs(JV.LAND_X, feet, after - JV.AIR));
  return items;
}

/** Run up, flop over the bar, land on the mat, then celebrate. */
function highJump(t: number): ParadeItem[] {
  const feet = LANE_FEET[3];
  const items: ParadeItem[] = [
    { k: 'mat', x: HJ.MAT, w: 40, feet },
    { k: 'bar', x: HJ.BAR, height: HJ.BAR_HEIGHT, feet },
  ];
  const runTime = (HJ.TAKEOFF - START_X) / TITLE.RUN_SPEED;
  if (t < runTime) {
    const x = START_X + TITLE.RUN_SPEED * t;
    items.push({ k: 'athlete', x, feet, pose: runPose(x), kit: 'green' });
  } else if (t < runTime + HJ.AIR) {
    const p = (t - runTime) / HJ.AIR;
    const x = HJ.TAKEOFF + (HJ.LAND - HJ.TAKEOFF) * p;
    items.push({ k: 'athlete', x, feet: feet - arc(p) * HJ.PEAK, pose: p < 0.35 ? 'jump' : 'flop', kit: 'green' });
  } else {
    const after = t - runTime - HJ.AIR;
    items.push({ k: 'athlete', x: HJ.LAND, feet: feet - 4, pose: after < 0.7 ? 'lie' : 'celebrate', kit: 'green' });
  }
  return items;
}

/** 0 at both ends, 1 in the middle (a jump's height over its length). */
function arc(p: number): number {
  return 4 * p * (1 - p);
}

/** A few specks of sand or dirt kicked up `after` s ago (gone after half a second). */
function puffs(x: number, feet: number, after: number): ParadeItem[] {
  if (after > 0.5) return [];
  const rise = Math.round(after * 24);
  return [-6, -2, 3, 7].map((dx, i) => ({ k: 'puff', x: x + dx * (1 + after * 2), y: feet - 2 - rise + (i % 2) * 2 }));
}

// --------------------------------------------------------------- ticker

const TIPS = [
  'TIP: TAP THE TWO RUN KEYS IN TURN - NEVER THE SAME ONE TWICE',
  'TIP: AROUND 20 DEGREES IS A GOOD LONG JUMP ANGLE',
  'TIP: THROW THE JAVELIN AT ABOUT 40 DEGREES',
  'TIP: THE HIGH JUMP NEEDS A STEEP TAKE-OFF - HOLD LONGER',
  'TIP: LET GO JUST BEFORE THE LINE FOR THE LONGEST JUMP',
];

/** The scrolling line along the bottom: your bests, the top score and the tips. */
export function tickerText(bests: PersonalBests, top: HighScore | undefined): string {
  const parts: string[] = [];
  if (top) parts.push(`TOP SCORE ${top.score} BY ${top.initials}`);
  const yours = CHAMPIONSHIP_EVENTS.filter((id): id is EventId => bests[id] !== undefined).map((id) => {
    const unit = EVENT_KIND[id] === 'race' ? 'S' : 'M';
    return `${EVENT_NAMES[id]} ${bests[id]!.toFixed(2)} ${unit}`;
  });
  if (yours.length) parts.push(`YOUR BESTS: ${yours.join('   ')}`);
  else parts.push('SET A PERSONAL BEST IN PRACTICE!');
  parts.push(...TIPS);
  return parts.join('   +   ');
}

/** Left edge (px) of the ticker text t s in: it scrolls in from the right and loops. */
export function tickerX(t: number, textPx: number, screenWidth: number): number {
  const loop = textPx + screenWidth;
  return screenWidth - ((t * TITLE.TICKER_SPEED) % loop);
}
