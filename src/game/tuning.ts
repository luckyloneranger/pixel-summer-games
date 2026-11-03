// Every tunable number in the game lives here, grouped by area, with units.
// Change values here to adjust the feel without touching game code.

/** Screen and game loop. */
export const DISPLAY = {
  WIDTH: 320, // px, low-resolution drawing width (16:9)
  HEIGHT: 180, // px, low-resolution drawing height
};

export const LOOP = {
  STEPS_PER_SECOND: 60, // logic updates per second (fixed step)
  MAX_FRAME_TIME: 0.25, // s, longest frame we catch up on (stops a burst after a tab switch)
};

/** Title screen. */
export const TITLE = {
  BLINK_PERIOD: 1.0, // s, one full on/off cycle of "PRESS START"
};

/** Debug overlay. */
export const DEBUG = {
  FPS_SAMPLE_PERIOD: 0.5, // s, how often the FPS number refreshes
};
