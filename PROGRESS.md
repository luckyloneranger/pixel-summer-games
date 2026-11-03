# Progress

Phase checklist for Pixel Summer Games. See `SPEC.md` section 9 for what each phase covers.

| Phase | Status |
| --- | --- |
| 0 – Setup and skeleton | ✅ Approved |
| 1 – 100 m with plain boxes | ✅ Approved |
| 2 – 100 m art and CPU runners | ✅ Approved |
| 3 – Long jump | ✅ Approved |
| 4 – Javelin | ✅ Approved |
| 5 – 110 m hurdles | ✅ Done, awaiting play-test |
| 6 – Game flow | ⏳ Next |
| 7 – Audio | – |
| 8 – Two players, touch and options | – |
| 9 – Polish and launch | – |

## Phase 0 – Setup and skeleton

**Done**
- Vite + TypeScript (strict) project; `npm run dev`, `npm run build`, `npm test`.
- 320 × 180 canvas, scaled by the largest whole number that fits the window (in physical pixels, so it stays sharp on high-DPI screens), centred with black bars.
- Fixed 60-step game loop with a 250 ms catch-up cap (`src/core/loop.ts`).
- Scene manager with push / pop / replace and overlay support.
- Input module: logical actions, `isDown` / `justPressed` / `justReleased`, ignores auto-repeat, blocks arrow/Space scrolling, releases keys when the window loses focus. Key map in `src/core/keymap.ts`.
- Seeded random numbers (`?seed=1234`).
- Debug overlay (`?debug=1` or the backtick key): FPS, scene, scale, seed.
- Original 8 × 8 bitmap font (capitals, digits, common symbols).
- Placeholder title ("PRESS START") → Enter → empty menu → Esc back.
- 30 unit tests: input, loop, scene manager, RNG, scaling, font.

**Known issues / notes**
- Palette is a 10-colour placeholder; the full 24-colour palette comes in Phase 2.
- The game doesn't pause on tab switch yet (nothing to pause). The loop's 250 ms cap already stops a jump forward on return. Pause overlay arrives in Phase 6.

## Phase 1 – 100 m with plain boxes

**Done**
- `TapRunner` (`src/events/tap-runner.ts`): only alternating presses count; same key twice, held keys and auto-repeat add nothing; pressing both keys at once counts once. Speed drains every frame and is capped.
- Speed formula uses `AIM_SPEED` above `MAX_SPEED` so 10 taps/s reaches the top (user chose option A; SPEC section 4 updated).
- 100 m race (`src/events/dash100.ts`): ON YOUR MARKS → SET → random 1.0–2.5 s → GO, false start → restart, second false start → disqualified, timer to 0.01 s (finish moment worked out within the step), reaction time.
- Plain-box runner with legs that swap on every tap, 4-lane track, 10 m markers, chequered finish, camera that looks ahead, speed meter.
- Temporary test menu with "100 M DASH"; Enter retries, Esc returns.
- Debug overlay adds race state, speed, taps/s, position; `[` and `]` change game speed (0.25×–4×) while the overlay is open.
- 51 unit tests, including simulated 7 and 10 taps/s races against the SPEC time targets.

**Known issues / notes**
- Simulated times: 7 taps/s ≈ 11.5 s, 10 taps/s ≈ 9.9 s (plus your reaction time).
- No CPU runners, art or sound yet (Phases 2 and 7). Lanes 1, 3 and 4 are empty.
- A runner who never taps never finishes; press Esc.
- Debug key `N` (skip to next event) waits for the championship in Phase 6.

## Phase 2 – 100 m art and CPU runners

**Done**
- Full fixed 24-colour palette (`src/gfx/palette.ts`).
- Original 16 × 24 athlete sprites drawn in code: stand, crouch, set, 4-frame run cycle, celebrate. Kit colour, skin tone and hair are swapped per athlete. The run cycle advances with distance covered, so it speeds up with the runner.
- Stadium: crowd stand drawn in code with parallax and a 2-frame wave when you win, front wall boards, grass, 4-lane track, lane numbers, 10 m boards, chequered finish.
- Scoreboard panel with timer box and a 16-segment speed meter (`src/ui/hud.ts`).
- 3 CPU runners (ACE, JET, KAI) using the same running code, at 6.5 / 8.5 / 10.5 taps/s ±10% by difficulty, reacting in 0.15–0.35 s (`src/events/cpu.ts`).
- The race ends when everyone has finished. A false start restarts every lane. After two false starts you're disqualified and the CPUs race without you.
- Results screen: place, lane, name, time, reaction (`src/scenes/results.ts`). Enter runs again, Esc goes to the menu.
- Temporary difficulty selector in the test menu.
- 69 unit tests (adds CPU difficulty ordering, reaction range, sprite sizes, palette size, results order, DQ flow).

**Known issues / notes**
- Normal CPUs run about 10.5 s, so an average player (about 11.5 s) usually finishes 4th on Normal. Tune `CPU.TAP_RATE` if it feels too hard.
- The crouch and set poses are small and simple; they could get a polish pass in Phase 9.
- Jump, throw and stumble frames come with Phases 3–5. Photo finish and dust puffs are Phase 9 polish.
- Your initials are fixed as "P1" until player setup (Phase 6).

## Phase 3 – Long jump

**Done**
- Shared field-event pieces, ready for the javelin: `projectile.ts` (exact flight maths, independent of frame rate), `angle-meter.ts` (hold to raise at 90°/s, capped at 80°, locks on release), `field-attempts.ts` (3 attempts, best mark, fouls).
- Long jump (`src/events/long-jump.ts`): 40 m runway, take-off board, foul line, sand pit with metre marks. Hold W/Space to raise the angle (arc indicator); release to take off. Launch speed = run speed × 0.795.
- While the meter is held, speed is frozen (no gain and no drain), as SPEC section 4 says.
- Fouls: releasing past the line, or running over it without jumping. A foul uses up the attempt.
- PERFECT TAKE-OFF (release within 0.20 m of the line) adds 5%. Distances are rounded down to the centimetre and measured from the foul line.
- Sand puff, tape measure, crowd wave for jumps of 7.00 m or more.
- Jump and landing sprite frames; ° added to the font.
- CPU marks drawn from a range per difficulty (Easy 6.0–7.2, Normal 6.8–8.0, Hard 7.5–8.6 m, 15% foul chance).
- Results screen has a field layout: attempts 1–3 (X = foul) and best.
- 91 unit tests (adds projectile range vs formula, 45° ≈ 8.5 m at top speed, angle meter, fouls, perfect bonus, attempts, CPU marks).

**Known issues / notes**
- Reaching the 7.00 m qualifying mark needs about 8 taps/s plus a good release. At 7 taps/s the best possible is about 6.3 m. Raise `LONG_JUMP.LAUNCH_EFFICIENCY` if this is too hard.
- The Action key only starts the meter once you're moving.
- CPUs don't appear on the runway; their marks show in the results.

## Phase 4 – Javelin

**Done**
- Shared base `src/events/run-up-event.ts` for run-up field events (run, hold, release, fouls, 3 attempts, CPU marks, results). The long jump now uses it; all of its tests pass unchanged.
- Javelin (`src/events/javelin.ts`): 30 m runway and foul line. The javelin is carried over the shoulder and tips up with the angle meter. It flies from 1.8 m with launch speed = run speed × 2.62, tilts along its flight path, sticks in the grass, wobbles and gets a marker flag. The athlete brakes to a stop after the release.
- The camera follows the javelin sideways and rises with high throws (the stands slide down), so it never leaves the screen.
- Distance lines every 10 m on the grass; distance-to-line boards on the runway.
- Throw follow-through sprite frame; renderer can draw lines.
- CPU javelin marks: Easy 55–72, Normal 65–82, Hard 75–92 m, 15% fouls.
- 103 unit tests (adds: 42–48° throws at 96%+ speed land 85–95 m, fouls, braking, tilt up then down, camera keeps the javelin on screen for 10°–80° throws).

**Known issues / notes**
- At 7 taps/s (86% speed) the best throw is about 69 m, just under the 70 m qualifying mark.
- A very weak throw that lands behind the foul line scores 0.00 rather than counting as a foul (the spec doesn't say which).
- Distance lines on the grass go out to 110 m.

## Phase 5 – 110 m hurdles

**Done**
- Shared race base `src/events/race-event.ts` (start sequence, false starts, lanes, CPUs, finish, results, drawing). The 100 m now uses it; its tests changed only to use the renamed `RACE_START` tuning group.
- 110 m hurdles (`src/events/hurdles110.ts`): 10 hurdles per lane at 13.72 m + 9.14 m spacing (last 14.02 m from the finish). Tap W/Space to jump (0.45 s arc).
- A hurdle passing under the middle 60% of the jump is cleared. Too early or late clips it (knocked down, −40% speed, "HIT!"). No jump crashes into it (−70% speed and a 0.4 s stumble). Never a disqualification.
- Taps in the air or while stumbling add no speed but keep your left/right rhythm (recorded in SPEC section 5).
- CPU hurdlers jump each hurdle and clip some (Easy 25%, Normal 12%, Hard 5% per hurdle); they skip taps in the air instead of saving them up.
- Hurdle and knocked-hurdle drawings (`src/gfx/sprites/props.ts`), stumble sprite frame.
- 117 unit tests (adds hurdle layout, clear/hit/crash rules, clean 10 taps/s run ≈ 12.9 s, hits costing time, CPU hit rates by difficulty, false starts).

**Measured times** (test simulation, perfect jumps): 10 taps/s ≈ 12.9 s, 8.5 taps/s ≈ 14.1 s, ~6.7 taps/s ≈ 16.4 s. Hitting all 10 hurdles adds 6–9 s.

**Known issues / notes**
- Screen shake on a hit and the clank sound come in Phases 9 and 7.
- An average tapper (about 7 taps/s) needs clean jumps to get near the 15.50 s qualifying mark.

**Next:** Phase 6 – Game flow (menus, championship, scoring, high scores, pause).
