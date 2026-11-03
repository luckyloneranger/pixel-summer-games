// Original 16x24 athlete, facing right. See SPRITE_CHARS in ../sprite.ts
// for what each character means. Run frames are built from an upper body
// (rows 0-14) plus a leg pose (rows 15-23).

import { PALETTE } from '../palette';
import { buildSprite, type Look } from '../sprite';

export const ATHLETE_W = 16; // px
export const ATHLETE_H = 24; // px

const EMPTY = '................';
const blank = (rows: number) => Array<string>(rows).fill(EMPTY);

const HEAD_RUN = [
  '.......hhhh.....',
  '......hhhhhh....',
  '......hhkkkk....',
  '......hkkkok....',
  '......kkkkkkk...',
  '.......kkkk.....',
  '........kk......',
];

const UPPER_ARM_FORWARD = [
  ...HEAD_RUN,
  '......SSSSS.....',
  '.....SSSSSSS....',
  '.....SSSSSSkk...',
  '.....TSSSSS.kk..',
  '.....TSSSSS..k..',
  '......TSSS......',
  '......wwww......',
  '......wwww......',
];

const UPPER_ARM_BACK = [
  ...HEAD_RUN,
  '......SSSSS.....',
  '.....SSSSSSS....',
  '....kSSSSSSS....',
  '...kkTSSSSS.....',
  '..kk.TSSSSS.....',
  '......TSSS......',
  '......wwww......',
  '......wwww......',
];

// Leg poses: 'k' is the near leg, 'K' the far (shaded) leg.
const LEGS_NEAR_FORWARD = [
  '......KKkk......',
  '.....KK..kk.....',
  '....KK....kk....',
  '...KK.....kk....',
  '..KK.......kk...',
  '.wK........kk...',
  'bb.........kk...',
  'b..........ww...',
  '...........bbbb.',
];
const LEGS_NEAR_PLANTED = [
  '......KKkk......',
  '......KKkk......',
  '.....KK.kk......',
  '....KK..kk......',
  '...wK...kk......',
  '..bb....kk......',
  '........kk......',
  '........ww......',
  '........bbbb....',
];
const LEGS_FAR_FORWARD = [
  '......kkKK......',
  '.....kk..KK.....',
  '....kk....KK....',
  '...kk.....KK....',
  '..kk.......KK...',
  '.wk........KK...',
  'bb.........KK...',
  'b..........ww...',
  '...........bbbb.',
];
const LEGS_FAR_PLANTED = [
  '......kkKK......',
  '......kkKK......',
  '.....kk.KK......',
  '....kk..KK......',
  '...wk...KK......',
  '..bb....KK......',
  '........KK......',
  '........ww......',
  '........bbbb....',
];
const LEGS_STAND = [
  '......KKkk......',
  '......KKkk......',
  '......KKkk......',
  '......KKkk......',
  '......KKkk......',
  '......KKkk......',
  '......KKkk......',
  '......wwww......',
  '......bbbbbb....',
];

const HEAD_STAND = [
  '......hhhh......',
  '.....hhhhhh.....',
  '.....hhkkkk.....',
  '.....hkkkok.....',
  '.....kkkkkkk....',
  '......kkkk......',
  '.......kk.......',
];

export const ATHLETE_FRAMES = {
  stand: [
    ...HEAD_STAND,
    '.....SSSSSS.....',
    '....SSSSSSSS....',
    '....SSSkSSSS....',
    '....TSSkSSST....',
    '....TSSkSSST....',
    '.....SSkSSS.....',
    '.....wwkwww.....',
    '.....wwwwww.....',
    ...LEGS_STAND,
  ],
  celebrate: [
    '..k...hhhh...k..',
    '..k..hhhhhh..k..',
    '..k..hhkkkk..k..',
    '..kk.hkkkok.kk..',
    '...k.kkkkkkkk...',
    '...kk.kkkk.kk...',
    '....kk.kk.kk....',
    '.....SSSSSS.....',
    '.....SSSSSS.....',
    '.....SSSSSS.....',
    '.....TSSSST.....',
    '.....TSSSST.....',
    '.....SSSSSS.....',
    '.....wwwwww.....',
    '.....wwwwww.....',
    ...LEGS_STAND,
  ],
  // ON YOUR MARKS: low in the blocks, hands on the line.
  crouch: [
    ...blank(13),
    '...........hhh..',
    '....SSSSSS.hhhh.',
    '...wSSSSSSSkkkk.',
    '..wwTTTSSSSkok..',
    '..wwKK....kkk...',
    '..KK.Kk...kk....',
    '.KK...kk..kk....',
    '.KK....kk.kk....',
    'KK.....kk.kk....',
    'ww....kk..kk....',
    'bb...bbb..kk....',
  ],
  // SET: hips up, weight forward over the hands.
  set: [
    ...blank(10),
    '..ww............',
    '..wwTT..........',
    '..KkTSSS........',
    '.KK.kSSSSS......',
    '.KK..kkSSSSS.hh.',
    '.KK...kk.SSSShhh',
    'KK.....kk..kkkko',
    'KK.....kk..kkk..',
    'ww......kk.kk...',
    'bb......kk.kk...',
    '........kk.kk...',
    '........kk.kk...',
    '.......kk..kk...',
    '......bbb..kk...',
  ],
  run0: [...UPPER_ARM_BACK, ...LEGS_NEAR_FORWARD],
  run1: [...UPPER_ARM_BACK, ...LEGS_NEAR_PLANTED],
  run2: [...UPPER_ARM_FORWARD, ...LEGS_FAR_FORWARD],
  run3: [...UPPER_ARM_FORWARD, ...LEGS_FAR_PLANTED],
} satisfies Record<string, string[]>;

export type Pose = keyof typeof ATHLETE_FRAMES;
export const RUN_CYCLE: readonly Pose[] = ['run0', 'run1', 'run2', 'run3'];

/** Team kits: shirt and its shade. Player 1 is red. */
export const TEAM_KITS = {
  red: { shirt: PALETTE.RED, shirtShade: PALETTE.RED_DARK },
  blue: { shirt: PALETTE.BLUE, shirtShade: PALETTE.NAVY },
  green: { shirt: PALETTE.GREEN, shirtShade: PALETTE.GREEN_DARK },
  yellow: { shirt: PALETTE.YELLOW, shirtShade: PALETTE.GOLD },
  purple: { shirt: PALETTE.PURPLE, shirtShade: PALETTE.NAVY },
};
export type TeamKit = keyof typeof TEAM_KITS;

export const SKIN_TONES = {
  light: { skin: PALETTE.SKIN_LIGHT, skinShade: PALETTE.SKIN },
  medium: { skin: PALETTE.SKIN, skinShade: PALETTE.SKIN_DARK },
  dark: { skin: PALETTE.SKIN_DARK, skinShade: PALETTE.BROWN },
};
export type SkinTone = keyof typeof SKIN_TONES;

export function makeLook(kit: TeamKit, skin: SkinTone, hair: string): Look {
  return { ...TEAM_KITS[kit], ...SKIN_TONES[skin], hair };
}

/** All frames for one athlete look, built on first use and then reused. */
export class AthleteSprites {
  private readonly frames = new Map<Pose, HTMLCanvasElement>();

  constructor(private readonly look: Look) {}

  get(pose: Pose): HTMLCanvasElement {
    let img = this.frames.get(pose);
    if (!img) {
      img = buildSprite(ATHLETE_FRAMES[pose], this.look);
      this.frames.set(pose, img);
    }
    return img;
  }
}
