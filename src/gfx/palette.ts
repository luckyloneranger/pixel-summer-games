// The game's colours. Phase 2 grows this into the full fixed 24-colour
// palette; until then these placeholders are the only colours used.

export const PALETTE = {
  BLACK: '#000000',
  NIGHT: '#14183a',
  NAVY: '#24306e',
  GREY: '#7c7c8c',
  WHITE: '#f4f4f0',
  YELLOW: '#f8d838',
  ORANGE: '#f08830',
  RED: '#c83c3c',
  GREEN: '#38a048',
  SKY: '#4c8cdc',
} as const;

export type Colour = (typeof PALETTE)[keyof typeof PALETTE];
