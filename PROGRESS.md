# Progress

Phase checklist for Pixel Summer Games. See `SPEC.md` section 9 for what each phase covers.

| Phase | Status |
| --- | --- |
| 0 – Setup and skeleton | ✅ Approved |
| 1 – 100 m with plain boxes | ✅ Done, awaiting play-test |
| 2 – 100 m art and CPU runners | ⏳ Next |
| 3 – Long jump | – |
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

**Next:** Phase 2 – 100 m art and CPU runners.
