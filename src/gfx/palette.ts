// The game's fixed palette: 36 original colours in the spirit of 8-bit
// consoles, in ramps of light and dark shades for shading. Every colour drawn
// on screen comes from this list (the optional retro TV filter darkens the
// finished picture afterwards).

export const PALETTE = {
  BLACK: '#000000',
  INK: '#1c1c2c', // outlines, eyes, shoes
  NIGHT: '#14183a',
  NAVY: '#24306e',
  BLUE: '#3c5cc8',
  SKY: '#4c8cdc',
  CYAN: '#7cd8e8',
  WHITE: '#f4f4f0',
  GREY_LIGHT: '#b8b8c4',
  GREY: '#7c7c8c',
  GREY_DARK: '#44445a',
  SKIN_LIGHT: '#f8c898',
  SKIN: '#d89060',
  SKIN_DARK: '#8c5030',
  BROWN: '#5c3418',
  RED: '#c83c3c',
  RED_DARK: '#7c1c28',
  ORANGE: '#f08830', // running track
  ORANGE_DARK: '#b85c20',
  YELLOW: '#f8d838',
  GOLD: '#c89c20',
  GREEN: '#38a048',
  GREEN_DARK: '#1c6430',
  PURPLE: '#8c4cb8',
  // Added in Phase 13: highlights for shading, and sky colours.
  MIDNIGHT: '#0c0e24', // top of the night sky
  SKY_PALE: '#c4ecf4', // daytime sky near the horizon
  RED_LIGHT: '#ec6c64',
  GREEN_LIGHT: '#6cc85c',
  YELLOW_LIGHT: '#fcf094',
  PURPLE_LIGHT: '#b884dc',
  SKIN_PALE: '#fce4c4',
  BROWN_LIGHT: '#94643c',
  PINK: '#e8689c', // sunset sky
  PEACH: '#f8b47c', // sunset sky near the horizon
  ORANGE_LIGHT: '#f8a850',
  CLOUD: '#e4e8f4', // clouds (a touch darker than WHITE so they don't glare)
} as const;

/** The next lighter shade of a colour, for highlights (itself if there's none). */
const LIGHTER: Record<string, string> = {
  [PALETTE.RED]: PALETTE.RED_LIGHT,
  [PALETTE.RED_DARK]: PALETTE.RED,
  [PALETTE.BLUE]: PALETTE.SKY,
  [PALETTE.NAVY]: PALETTE.BLUE,
  [PALETTE.GREEN]: PALETTE.GREEN_LIGHT,
  [PALETTE.GREEN_DARK]: PALETTE.GREEN,
  [PALETTE.YELLOW]: PALETTE.YELLOW_LIGHT,
  [PALETTE.GOLD]: PALETTE.YELLOW,
  [PALETTE.PURPLE]: PALETTE.PURPLE_LIGHT,
  [PALETTE.SKIN_LIGHT]: PALETTE.SKIN_PALE,
  [PALETTE.SKIN]: PALETTE.SKIN_LIGHT,
  [PALETTE.SKIN_DARK]: PALETTE.SKIN,
  [PALETTE.BROWN]: PALETTE.BROWN_LIGHT,
  [PALETTE.INK]: PALETTE.GREY_DARK,
  [PALETTE.ORANGE]: PALETTE.ORANGE_LIGHT,
};

export function lighter(colour: string): string {
  return LIGHTER[colour] ?? colour;
}

export type Colour = (typeof PALETTE)[keyof typeof PALETTE];
