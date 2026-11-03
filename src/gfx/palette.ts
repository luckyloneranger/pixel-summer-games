// The game's fixed palette: 24 original colours in the spirit of 8-bit
// consoles. Every colour drawn on screen comes from this list.

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
} as const;

export type Colour = (typeof PALETTE)[keyof typeof PALETTE];
