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
  TIME_SCALES: [0.25, 0.5, 1, 2, 4], // game-speed steps for the [ and ] debug keys
};

/**
 * Alternate-tap running, shared by every event and every CPU runner.
 * Each valid tap adds TAP_IMPULSE * (1 - speed / AIM_SPEED). AIM_SPEED sits
 * above MAX_SPEED so fast tappers (10+ taps/s) actually reach the cap.
 * With these values: ~7 taps/s ≈ 86% of top speed (100 m ≈ 11.5 s),
 * ~10 taps/s ≈ top speed (100 m ≈ 9.9 s).
 */
export const RUNNER = {
  MAX_SPEED: 11.5, // m/s, hard cap on running speed
  AIM_SPEED: 15, // m/s, speed the tap gains shrink towards (must be > MAX_SPEED)
  TAP_IMPULSE: 1.6, // m/s, speed added by one tap from a standstill
  DRAG: 4, // m/s per second, speed lost every second
  TAP_RATE_WINDOW: 1, // s, window used to measure taps per second (debug/HUD)
};

/** Start sequence and false starts, shared by every race. */
export const RACE_START = {
  MARKS_TIME: 1.5, // s, "ON YOUR MARKS" shown before "SET"
  SET_WAIT_MIN: 1.0, // s, shortest random wait between SET and GO
  SET_WAIT_MAX: 2.5, // s, longest random wait between SET and GO
  GO_TEXT_TIME: 0.8, // s, how long "GO!" stays on screen
  FALSE_START_TEXT_TIME: 2.0, // s, "FALSE START" shown before the restart
  FALSE_STARTS_TO_DQ: 2, // false starts by one player that disqualify them
};

/** 100 m dash. */
export const DASH100 = {
  DISTANCE: 100, // m
  PIXELS_PER_METER: 12, // px per m when drawing the track
  CAMERA_LEAD: 80, // px, runner's distance from the screen's left edge (shows the track ahead)
};

/** Computer opponents. */
export const CPU = {
  TAP_RATE: { easy: 6.5, normal: 8.5, hard: 10.5 }, // taps/s by difficulty
  TAP_RATE_VARIATION: 0.1, // ± fraction, re-rolled for each race
  REACTION_MIN: 0.15, // s, fastest reaction to GO
  REACTION_MAX: 0.35, // s, slowest reaction to GO
};

/** Animation and presentation timing. */
export const ANIMATION = {
  STRIDE_PER_FRAME: 1.1, // m run per run-cycle frame (4 frames = 2 strides)
  CROWD_PARALLAX: 0.35, // crowd scroll speed relative to the track (0-1)
  WAVE_FRAME_TIME: 0.25, // s per frame of the crowd wave
  RESULTS_DELAY: 2.0, // s after the race ends before the results screen
};

/** Hold-and-release angle meter (long jump, javelin). */
export const ANGLE_METER = {
  RATE: 90, // degrees per second while Action is held
  MAX: 80, // degrees, the meter stops here
};

/** Long jump. */
export const LONG_JUMP = {
  RUNWAY: 40, // m from the start of the runway to the foul line
  ATTEMPTS: 3, // jumps; the best one counts
  LAUNCH_EFFICIENCY: 0.795, // launch speed = run speed x this (45° at top speed ≈ 8.5 m)
  GRAVITY: 9.81, // m/s²
  PERFECT_ZONE: 0.2, // m before the foul line that counts as a perfect take-off
  PERFECT_BONUS: 0.05, // fraction added to the distance for a perfect take-off
  QUALIFY: 7.0, // m, qualifying mark on Normal
  PIT_START: 1.0, // m past the foul line where the sand starts
  PIT_END: 10.0, // m past the foul line where the sand ends
  RESULT_TIME: 2.5, // s the mark (or FOUL) stays up before the next attempt
  TAPE_TIME: 1.0, // s for the tape measure to run out
  PUFF_TIME: 0.5, // s the sand puff lasts
  PIXELS_PER_METER: 14, // px per m when drawing
  CAMERA_LEAD: 110, // px, athlete's distance from the left edge of the screen
};

/** CPU field-event marks, drawn from a range per difficulty (no run-up simulated). */
export const CPU_FIELD = {
  FOUL_CHANCE: 0.15, // chance any one CPU attempt is a foul
  LONG_JUMP: { easy: [6.0, 7.2], normal: [6.8, 8.0], hard: [7.5, 8.6] }, // m, [min, max]
  JAVELIN: { easy: [55, 72], normal: [65, 82], hard: [75, 92] }, // m, [min, max]
};

/** Javelin throw. */
export const JAVELIN = {
  RUNWAY: 30, // m from the start of the runway to the foul line
  ATTEMPTS: 3, // throws; the best one counts
  LAUNCH_EFFICIENCY: 2.62, // throw speed = run speed x this (the arm adds a lot; 45° at top speed ≈ 94 m)
  GRAVITY: 9.81, // m/s²
  RELEASE_HEIGHT: 1.8, // m, the javelin leaves from shoulder height
  QUALIFY: 70.0, // m, qualifying mark on Normal
  BRAKE: 15, // m/s², how hard the athlete stops after the release
  RESULT_TIME: 3.0, // s the mark (or FOUL) stays up before the next attempt
  WOBBLE_TIME: 1.0, // s the stuck javelin keeps wobbling
  WOBBLE_DEGREES: 8, // degrees, size of the first wobble
  WOBBLE_SPEED: 30, // radians per second, how fast it wobbles
  PIXELS_PER_METER: 8, // px per m when drawing (shows about 40 m of field)
  CAMERA_LEAD: 100, // px, followed object's distance from the left edge of the screen
  CAMERA_RISE_START: 80, // px above the ground before the camera starts rising with the javelin
};

/** 110 m hurdles. */
export const HURDLES = {
  DISTANCE: 110, // m
  FIRST_HURDLE: 13.72, // m from the start
  SPACING: 9.14, // m between hurdles
  COUNT: 10, // hurdles per lane (last one is 14.02 m from the finish)
  JUMP_TIME: 0.45, // s in the air per jump
  JUMP_HEIGHT: 1.2, // m, height of the feet at the top of the jump (hurdle is 1.07 m)
  CLEAR_FROM: 0.2, // fraction of the jump: the hurdle must pass under you after this...
  CLEAR_TO: 0.8, // ...and before this, or you clip it
  HIT_SPEED_LOSS: 0.4, // fraction of speed lost when you clip a hurdle
  CRASH_SPEED_LOSS: 0.7, // fraction of speed lost running straight into one
  STUMBLE_TIME: 0.4, // s of stumbling after a crash
  HIT_TEXT_TIME: 0.6, // s the "HIT!" label shows over the athlete
  QUALIFY: 15.5, // s, qualifying time on Normal
  CPU_HIT_CHANCE: { easy: 0.25, normal: 0.12, hard: 0.05 }, // chance a CPU clips each hurdle
  PIXELS_PER_METER: 12, // px per m when drawing the track
  CAMERA_LEAD: 80, // px, runner's distance from the left edge of the screen
};
