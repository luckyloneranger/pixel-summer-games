# Progress

Phase checklist for Pixel Summer Games. See `SPEC.md` section 9 for what each phase covers.

| Phase | Status |
| --- | --- |
| 0 – Setup and skeleton | ✅ Approved |
| 1 – 100 m with plain boxes | ✅ Approved |
| 2 – 100 m art and CPU runners | ✅ Done, awaiting play-test |
| 3 – Long jump | ⏳ Next |
| 4 – Javelin | – |
| 5 – 110 m hurdles | – |
| 6 – Game flow | – |
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

**Next:** Phase 3 – Long jump.
