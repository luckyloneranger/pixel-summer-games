// Original 16x24 athlete, facing right. See SPRITE_CHARS in ../sprite.ts
// for what each character means. Run frames are built from an upper body
// (rows 0-14) plus a leg pose (rows 15-23).

import { PALETTE } from '../palette';
import { buildSprite, scale2x, type Look, type SpriteLight } from '../sprite';

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
// Passing frames (legs crossing mid-stride), between the planted and forward poses.
const LEGS_PASS_NEAR = [
  '......KKkk......',
  '.......Kkk......',
  '.......kkKK.....',
  '.......kk.KK....',
  '.......kk..K....',
  '.......kk..w....',
  '.......kk..bb...',
  '.......ww.......',
  '.......bbbb.....',
];
const LEGS_PASS_FAR = [
  '......kkKK......',
  '.......kKK......',
  '.......KKkk.....',
  '.......KK.kk....',
  '.......KK..k....',
  '.......KK..w....',
  '.......KK..bb...',
  '.......ww.......',
  '.......bbbb.....',
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

/** Throwing: arm forward, weight on the front leg. */
const THROW = [
    '......hhhh......',
    '.....hhhhhh.....',
    '.....hhkkkk.....',
    '.....hkkkok.....',
    '.....kkkkkkk....',
    '......kkkk....kk',
    '.......kk....kk.',
    '.....SSSSSSkkk..',
    '....SSSSSSSS....',
    '...kSSSSSSSS....',
    '..kkTSSSSSS.....',
    '.kk.TSSSSSS.....',
    '.....TSSSS......',
    '.....wwwww......',
    '.....wwwwww.....',
    '.....KK..kk.....',
    '....KK....kk....',
    '...KK.....kk....',
    '..KK.......kk...',
    '.KK........kk...',
    '.KK.........kk..',
    'KK..........kk..',
    'ww..........ww..',
    'bb..........bbbb',
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
  // In the air: arms swinging, legs reaching forward for the landing.
  jump: [
    '........hhhh....',
    '.......hhhhhh...',
    '.......hhkkkk...',
    '.......hkkkok...',
    '.......kkkkkkk..',
    '...k....kkkk....',
    '...kk....kk.....',
    '....kkSSSSS.....',
    '.....SSSSSSS....',
    '.....SSSSSSSkk..',
    '.....TSSSSS..kk.',
    '.....TSSSSS.....',
    '......TSSS......',
    '......wwww......',
    '......wwwwkk....',
    '.....KKK..kkk...',
    '....KK......kk..',
    '...KK.......kk..',
    '..KK........kk..',
    '..ww........ww..',
    '..bb........bbb.',
    ...blank(3),
  ],
  // Sitting in the sand after landing, legs out in front.
  land: [
    ...blank(12),
    '....hhhh........',
    '...hhhhhh.......',
    '...hhkkkk.......',
    '...hkkkok.......',
    '...kkkkkkk......',
    '....kkkk........',
    '...SSSSSkkk.....',
    '...SSSSSS.kkk...',
    '...TSSSS........',
    '...TTSSS........',
    '..wwwwKKKKKKKwb.',
    '..wwwwkkkkkkkwbb',
  ],
  // Javelin follow-through: throwing arm forward and up, legs braced.
  throw: THROW,
  /** The throw facing left (the hammer swinging round the far side). */
  throwBack: THROW.map((row) => [...row].reverse().join('')),
  // Stumbling after running into a hurdle: pitched forward, arms flung back.
  stumble: [
    ...blank(2),
    '..........hhhh..',
    '.........hhhhhh.',
    '.........hhkkkk.',
    '...k.....hkkkok.',
    '...kk....kkkkkkk',
    '....kkSSSSSkkk..',
    '.....SSSSSSS....',
    '....SSSSSSSkk...',
    '....TSSSSSS.kk..',
    '....TTSSSS...k..',
    '.....wwww.......',
    '.....wwww.......',
    '....KK..kk......',
    '...KK....kk.....',
    '..KK......kk....',
    '.KK........kk...',
    'KK..........kk..',
    'ww...........ww.',
    'bb...........bbb',
    ...blank(3),
  ],
  // High jump: arched back over the bar, head leading, feet trailing.
  flop: [
    ...blank(10),
    '................',
    'bb..............',
    '.KK.........hhh.',
    '..KK.....SSkhhhh',
    '...kkwwSSSSkkok.',
    '....kwwSSSSSkk..',
    '....kww.SSS.....',
    ...blank(7),
  ],
  // Lying flat on the landing mat.
  lie: [
    ...blank(20),
    '...........hhh..',
    'bbKKKKwwwSSSkkh.',
    'bbkkkkwwwSSSkkhh',
    '................',
  ],
  run0: [...UPPER_ARM_BACK, ...LEGS_NEAR_FORWARD],
  run1: [...UPPER_ARM_BACK, ...LEGS_NEAR_PLANTED],
  run2: [...UPPER_ARM_FORWARD, ...LEGS_FAR_FORWARD],
  run3: [...UPPER_ARM_FORWARD, ...LEGS_FAR_PLANTED],
  // Swimming, front crawl (lying in the water, head to the right, arms turning over).
  swim0: [
    ...blank(18),
    '........kk......',
    '.......kk..hhh..',
    '.......k..hhhhh.',
    'wwKKSSSSSSkkkok.',
    'kkkkSSSSSSSkkk..',
    '...........k....',
  ],
  swim1: [
    ...blank(18),
    '................',
    '...........hhh..',
    '..........hhhhh.',
    'wwKKSSSSSSkkkokk',
    'kkkkSSSSSSSkkk.k',
    '..k.............',
  ],
  swim2: [
    ...blank(18),
    '................',
    '...........hhh..',
    '..k.......hhhhh.',
    '.k.KSSSSSSkkkok.',
    'wwKKSSSSSSSkkk..',
    'kk..............',
  ],
  swim3: [
    ...blank(18),
    '..........k.....',
    '.........k.hhh..',
    '.........khhhhh.',
    'kkKKSSSSSSkkkok.',
    'wwkkSSSSSSSkkk..',
    '................',
  ],
  // Javelin: drawing the arm back while holding for the angle.
  windUp: [
    '.......hhhh.....',
    '......hhhhhh....',
    '......hhkkkk....',
    '......hkkkok....',
    '......kkkkkkk...',
    '.......kkkk.....',
    '.kk.....kk......',
    '..kk.SSSSSS.....',
    '...kkSSSSSSS....',
    '....SSSSSSSSk...',
    '.....TSSSSS.kk..',
    '.....TSSSSS..k..',
    '......TSSSS.....',
    '......wwwww.....',
    '......wwwwww....',
    '.....KK...kk....',
    '....KK.....kk...',
    '...KK......kk...',
    '..KK........kk..',
    '.KK.........kk..',
    '.KK..........kk.',
    'KK...........kk.',
    'ww...........ww.',
    'bb...........bbb',
  ],
  // Javelin: following through after the throw.
  follow: [
    '................',
    '.........hhhh...',
    '........hhhhhh..',
    '........hhkkkk..',
    '........hkkkok..',
    '........kkkkkkk.',
    '.........kkkk...',
    '.......SSSSkk...',
    '......SSSSSSkk..',
    '.....SSSSSSS.kk.',
    '....TSSSSSS...k.',
    '....TSSSSS......',
    '.....TSSS.......',
    '.....wwww.......',
    '....wwwwww......',
    '....KK..kk......',
    '...KK....kk.....',
    '..KK......kk....',
    '.KK........kk...',
    'KK.........kk...',
    'w...........kk..',
    'b...........kk..',
    '............ww..',
    '............bbbb',
  ],
  // Hammer: facing us mid-turn (the hammer out to our right).
  spinFront: [
    '......hhhh......',
    '.....hhhhhh.....',
    '.....hkkkkh.....',
    '.....kokkok.....',
    '.....kkkkkk.....',
    '......kkkk......',
    '.......kk.......',
    '.....SSSSSS.....',
    '....SSSSSSSSkk..',
    '....SSSSSSSSSkkk',
    '....TSSSSSST....',
    '....TSSSSSST....',
    '.....TSSSST.....',
    '.....wwwwww.....',
    '.....wwwwww.....',
    '.....KK..kk.....',
    '.....KK..kk.....',
    '....KK....kk....',
    '....KK....kk....',
    '...KK......kk...',
    '...KK......kk...',
    '..KK........kk..',
    '..ww........ww..',
    '.bbb........bbb.',
  ],
  // Hammer: back to us mid-turn.
  spinBack: [
    '......hhhh......',
    '.....hhhhhh.....',
    '.....hhhhhh.....',
    '.....hhhhhh.....',
    '.....khhhhk.....',
    '......kkkk......',
    '.......kk.......',
    '.....SSSSSS.....',
    '..kkSSSSSSSS....',
    'kkkSSSSSSSSS....',
    '....TSSSSSST....',
    '....TSSSSSST....',
    '.....TSSSST.....',
    '.....wwwwww.....',
    '.....wwwwww.....',
    '.....KK..kk.....',
    '.....KK..kk.....',
    '....KK....kk....',
    '....KK....kk....',
    '...KK......kk...',
    '...KK......kk...',
    '..KK........kk..',
    '..ww........ww..',
    '.bbb........bbb.',
  ],
  // Swimming: diving off the block at GO.
  dive: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    'ww..............',
    'bKK.............',
    '..KKK...........',
    '....KSSS........',
    '.....SSSSSS.....',
    '......TSSSSShh..',
    '.........kkhhhh.',
    '..........kkokkk',
    '...............k',
    '................',
    '................',
  ],
  // Pole vault: swinging upside down up the pole.
  swing: [
    '.....bb.........',
    '.....ww.........',
    '.....Kk.........',
    '.....Kk.........',
    '....KKkk........',
    '....KK.kk.......',
    '....wwww........',
    '....wwww........',
    '...SSSSS........',
    '...SSSSSS.......',
    '...TSSSSS.......',
    '....TSSSkk......',
    '.....SSS.kk.....',
    '....hkkkk.k.....',
    '...hhkokk.......',
    '...hhhkkk.......',
    '....hhhh........',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  // Celebrating: one fist in the air.
  fistPump: [
    '.............kk.',
    '......hhhh...kk.',
    '.....hhhhhh..k..',
    '.....hhkkkk..k..',
    '.....hkkkok.kk..',
    '.....kkkkkkkk...',
    '......kkkk.k....',
    '.....SSSSSSk....',
    '....SSSSSSSS....',
    '....SSSkSSSS....',
    '....TSSkSSST....',
    '....TSSkSSST....',
    '.....SSkSSS.....',
    '.....wwkwww.....',
    '.....wwwwww.....',
    '......KKkk......',
    '......KKkk......',
    '......KKkk......',
    '......KKkk......',
    '......KKkk......',
    '......KKkk......',
    '......KKkk......',
    '......wwww......',
    '......bbbbbb....',
  ],
  // Celebrating: a bow to the crowd.
  bow: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '....SSSSS.hhh...',
    '...SSSSSSShhhh..',
    '...SSSSSSkkkkh..',
    '....SSSST.kkok..',
    '..wwwSSST..kk...',
    '..www.kk....kk..',
    '.kkKK..k.....k..',
    '.kkKK...........',
    '.kkKK...........',
    '.kkKK...........',
    '.kkKK...........',
    '.kkKK...........',
    '.kkKK...........',
    '.kkKK...........',
    '.wwww...........',
    'bbbbb...........',
    '................',
    '................',
  ],
  runPassA: [...UPPER_ARM_BACK, ...LEGS_PASS_NEAR],
  runPassB: [...UPPER_ARM_FORWARD, ...LEGS_PASS_FAR],
} satisfies Record<string, string[]>;

export type Pose = keyof typeof ATHLETE_FRAMES;
/** Six frames: forward, planted, passing, then the same with the other leg. */
export const RUN_CYCLE: readonly Pose[] = ['run0', 'run1', 'runPassA', 'run2', 'run3', 'runPassB'];

/** Winner poses: each athlete always uses the same one (see celebrationFor). */
export const CELEBRATIONS: readonly Pose[] = ['celebrate', 'fistPump', 'bow'];

/** The celebration an athlete uses, fixed per athlete so it feels like their own. */
export function celebrationFor(id: number): Pose {
  return CELEBRATIONS[((id % CELEBRATIONS.length) + CELEBRATIONS.length) % CELEBRATIONS.length];
}

/** Front crawl, one stroke after another. */
export const SWIM_CYCLE: readonly Pose[] = ['swim0', 'swim1', 'swim2', 'swim3'];

/** Hair styles, so athletes don't all look alike. */
export type HairStyle = 'short' | 'bun' | 'long';

/** Poses where the head is upright (hair styles are added only to these). */
const UPRIGHT: ReadonlySet<Pose> = new Set(['stand', 'crouch', 'set', 'jump', 'land', 'throw', 'stumble', 'celebrate', ...RUN_CYCLE]);

/**
 * Add a hair style to a pose's pixel map. Athletes face right, so the back of
 * the head is the left edge of the hair: a bun sits on top at the back, long
 * hair hangs down behind the neck.
 */
export function withHair(map: readonly string[], style: HairStyle, pose: Pose): string[] {
  const rows = map.map((r) => [...r]);
  if (style === 'short' || !UPRIGHT.has(pose)) return rows.map((r) => r.join(''));
  // The back-most hair pixel in the top hair row, and the lowest hair row.
  const top = rows.findIndex((r) => r.includes('h'));
  if (top < 0) return rows.map((r) => r.join(''));
  const back = rows[top].indexOf('h');
  const set = (x: number, y: number) => {
    if (y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] === '.') rows[y][x] = 'h';
  };
  if (style === 'bun') {
    set(back - 1, top);
    set(back - 1, top - 1);
    set(back, top - 1);
  } else {
    // Long: two columns down the back of the head to the shoulders.
    for (let y = top + 1; y <= top + 5; y++) {
      const first = rows[y].findIndex((c) => c !== '.');
      if (first > 0) set(first - 1, y);
    }
  }
  return rows.map((r) => r.join(''));
}

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

export function makeLook(kit: TeamKit, skin: SkinTone, hair: string, hairStyle: HairStyle = 'short'): Look {
  return { ...TEAM_KITS[kit], ...SKIN_TONES[skin], hair, hairStyle };
}

/** All frames for one athlete look, built on first use and then reused. */
export class AthleteSprites {
  private readonly frames = new Map<Pose, HTMLCanvasElement>();

  /** `ghost` builds see-through pale copies (the ghost runner); `scale` 2 builds big ones (Scale2x). */
  constructor(
    private readonly look: Look,
    private readonly ghost = false,
    readonly scale: 1 | 2 = 1,
    /** The light they stand in: warm rims at sunset, darker legs at night. */
    readonly light: SpriteLight = 'day',
  ) {}

  get(pose: Pose): HTMLCanvasElement {
    let img = this.frames.get(pose);
    if (!img) {
      const map = withHair(ATHLETE_FRAMES[pose], this.look.hairStyle ?? 'short', pose);
      img = buildSprite(this.scale === 2 ? scale2x(map) : map, this.look, true, this.ghost, this.light);
      this.frames.set(pose, img);
    }
    return img;
  }
}
