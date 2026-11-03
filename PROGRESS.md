# Progress

Phase checklist for Pixel Summer Games. See `SPEC.md` section 9 for what each phase covers.

| Phase | Status |
| --- | --- |
| 0 – Setup and skeleton | ✅ Done, awaiting play-test |
| 1 – 100 m with plain boxes | ⏳ Next |
| 2 – 100 m art and CPU runners | – |
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
- Debug-only keys `[`, `]` and `N` are not wired up yet; they need events to be useful (Phase 1+).

**Next:** Phase 1 – 100 m with plain boxes (TapRunner, start sequence, false starts, timer).
