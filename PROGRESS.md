# Progress

Phase checklist for Pixel Summer Games. See `SPEC.md` section 9 for what each phase covers.

| Phase | Status |
| --- | --- |
| 0 – Setup and skeleton | ✅ Approved |
| 1 – 100 m with plain boxes | ✅ Approved |
| 2 – 100 m art and CPU runners | ✅ Approved |
| 3 – Long jump | ✅ Approved |
| 4 – Javelin | ✅ Approved |
| 5 – 110 m hurdles | ✅ Approved |
| 6 – Game flow | ✅ Approved |
| 7 – Audio | ✅ Approved |
| 8a – Two players | ✅ Approved |
| 8b – Touch and options | ✅ Approved |
| 9 – Polish and launch | ✅ Approved – v1 launched |
| 10 – High jump | ✅ Approved |
| 10+ – More events | – |
| 11a – Online: server, lobby, races | ✅ Approved (room server live on Cloudflare) |
| 11b – Online: field events, reconnect | ✅ Approved |
| 12 – A more fun title screen | ✅ Approved |
| 12b – Hints that match the device | ✅ Approved |
| 13 – Graphics quality (13a–13d) | ✅ Approved |
| 14 – Ghost runner, awards, weekly leaderboard | 🔍 Ready for review |
| 15 – Triple jump, pole vault, hammer, 50 m swim | 🔍 Ready for review |
| 16 – Gamepad, new title tune, fixes | 🔍 Ready for review |
| 17 – Touch, pads, online rejoin, leaderboard checks, all-nine | 🔍 Ready for review |

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

## Phase 6 – Game flow

**Done**
- Full screen flow: Title → Main menu → Player setup (initials, team colour, difficulty) → Event intro card → Event → Results → next event / Game over → Podium → High-score entry → High scores → Title.
- Main menu: Championship, Practice, Versus (greyed, Phase 8), High Scores, How to Play (greyed, Phase 9), Options.
- Scoring (`src/game/scoring.ts`): straight-line points from the SPEC table, capped at 1,200; fouls/DQ/no mark = 0. Qualifying marks scaled by difficulty (Easy +8% time / −10% distance, Hard −4% / +6%). All numbers in `SCORING` and `DIFFICULTY_MARKS` in tuning.ts.
- Championship (`src/game/championship.ts`): 100 m → long jump → javelin → hurdles; missing a mark ends the run; Casual mode (Options) carries on with 0 points. CPUs score points from their marks too; the podium ranks everyone by total.
- Results show points, your medal, QUALIFIED / NOT QUALIFIED, the running total and a flashing NEW RECORD! on a personal best.
- Practice: pick any event and CPU difficulty, personal best shown, retry or back.
- Pause (Esc/P): Resume, Restart event, Options, Quit to menu. Events pause themselves when the tab is hidden or the window loses focus.
- Saving (`src/core/storage.ts`): settings, top-10 championship scores and personal bests under `psg:v1` in localStorage, falling back to memory if storage is blocked.
- Your initials and team colour are used in every event; CPUs never wear your colour.
- Debug: `N` (overlay open) skips a championship event with exactly the qualifying mark.
- 138 unit tests (adds scoring, qualifying, championship rules, high-score table, personal bests, storage fallback, popTo, CPU colours).

**Known issues / notes**
- A race only ends when everyone finishes, so if you stop running you have to pause and quit.
- When `N` skips a race, CPUs have no time (0 points) because their race wasn't run.
- Versus and How to Play are placeholders until Phases 8 and 9.

## Phase 7 – Audio

**Done**
- Synthesiser (`src/audio/synth.ts`) on the Web Audio API imitating 4 classic channels: square (50%, 25%, 12.5% pulse), triangle and filtered noise, through music and effects volume buses. Nothing is created until the first key press, click or tap.
- Sound effects (`src/audio/sfx.ts`): menu move / select / back, starting pistol, false-start and foul buzzer, footsteps (faster and higher with speed), jump, javelin whoosh, sand landing, javelin thud, hurdle clank, crowd cheer, medal fanfare, new-record jingle.
- Crowd ambience: hushes for ON YOUR MARKS / SET, grows with your running speed, cheers on a finish or a qualifying mark.
- Music (`src/audio/music.ts`, `src/audio/songs.ts`): three original looping tunes written as note lists (title, menus/results, podium). Events play crowd noise only.
- Events send sound cues (`pistol`, `clank`, ...) to a sound output; logic stays separate from audio and tests check the cues.
- M mutes from anywhere (with a SOUND ON / OFF message). Options: master, music and effects volume (0–10) and mute, all saved.
- 157 unit tests (adds note maths, song validity, volume maths, no audio before first input, sound cues for every event).

**Known issues / notes**
- Sound balance is by ear: all levels are in `AUDIO` in tuning.ts and in `src/audio/sfx.ts`.
- Footsteps play for your athlete only.

## Phase 8a – Two players

**Done**
- SPEC updated: Phase 8 split into 8a / 8b; touch menus use on-screen buttons; online multiplayer added as Phase 11 (after v1), with its open decisions listed.
- Two players on one keyboard: P1 = A / D / W, P2 = ← / → / ↑ (a lone player still gets both sets) — `src/events/player-input.ts`.
- Races: P1 in lane 2, P2 in lane 3, CPUs fill the rest. Each player has their own false starts (two disqualify only that player). Camera follows the leading human; a "<NAME" marker shows a player left behind. Two speed meters on the scoreboard.
- Long jump and javelin: players take turns (P1, P2, P1, ...); the ready card and scoreboard say whose turn it is.
- 2-player championship: missing a qualifying mark knocks that player out (they sit out the rest); game over only when both are out.
- Versus: setup with both players and a choice of all four events or one; no qualifying; "P1 WINS!" screen with points per event.
- High scores: each player enters initials if their total makes the top 10; separate Championship and Versus tables (left/right to switch).
- CPUs never wear either player's colour.
- 170 unit tests (adds key separation, per-player false starts, turn order, 2-player elimination, versus winner, kit colours).

**Known issues / notes**
- Some keyboards can't register many keys at once ("ghosting"), which can drop presses when both players tap together.
- In a 2-player game, personal bests are shared (one per event per browser).

## Phase 8b – Touch and options

**Done**
- Touch controls (`src/ui/touch-controls.ts`), shown automatically on phones and tablets (and after any touch): in events, left and right run pads, a large ACTION button, pause and sound icons; in menus, arrow buttons plus OK and BACK. Each button presses a "Touch..." key, so the same input pipeline drives everything. Multi-touch; sliding a finger between pads works. Pressing a physical key hides them.
- After the buttons switch between event and menu layouts, new touches are ignored for 1 s, so a finger still tapping a run pad can't press the menu button that appears in its place (found in phone testing).
- "ROTATE YOUR PHONE" screen when a touch device is held upright (the game pauses). Browser scrolling, zooming and long-press menus are switched off on the game page.
- Key remapping (Options → Controls): P1/P2 Left, Right and Action. Clashing keys swap; menu keys (Enter, Esc, P, M, `) are reserved; reset to defaults; saved. Menus now use their own left/right keys, so remapping can't break them.
- Assist run (Options): hold a run key to build up to 80% of top speed; tapping still goes faster. Not while holding the angle, in the air, or stumbling.
- Reduce flashing (Options): all blinking text stays steady (the Phase 9 screen shake will respect it too).
- Arrow glyphs added to the font.
- 191 unit tests (adds touch hit-testing and coordinates, button layouts on screen with no overlaps, remap swaps/reserved keys/saving, assist run limits, steady blinking).
- Checked on an emulated iPhone held sideways: menus, a 100 m race, a long jump (hold and release) and pause, all by touch only.

**Known issues / notes**
- On touch devices only player 1 has on-screen controls (two players need a keyboard).
- Touch buttons are drawn as outlines over the game and can cover parts of the track or help text.
- Real-phone feel (button size and position) still needs checking on a real device: see `TOUCH` in tuning.ts.

## Phase 9 – Polish and launch

**Done**
- Game feel: dust puffs behind fast runners (`src/gfx/effects.ts`, fixed pool, no garbage), screen shake on hurdle hits and small bumps on landings (skipped with Reduce flashing), photo-finish freeze when the top two are within 0.05 s.
- Did not finish: a player standing still for 3 s after everyone else has finished gets DNF (fixes the "race never ends" issue). Recorded in SPEC section 5.
- How to Play: five pages (basics + one per event) with a small athlete picture.
- Attract mode: after 8 s idle on the title, four CPUs race the 100 m as a demo; any key returns.
- iPhone Safari: audio also unlocks on touch release and click.
- Performance: cached human/racer lists, no array spreads or sorting per frame while drawing.
- Playwright smoke test (`tests/e2e/smoke.spec.ts`, `npm run test:e2e`): title → menu → practice → 100 m → taps → results, no console errors. Passes in Chromium locally.
- GitHub Actions: `deploy.yml` builds and publishes to GitHub Pages on every push to main; `test.yml` runs unit tests and the smoke test in Chromium, Firefox and WebKit.
- README rewritten (play link, events, modes, controls, development, tuning, layout, deploying, originality).
- 200 unit tests (adds demo race, DNF, photo finish, dust timing, shake requests).

**Launch setup**
- Repository renamed to `pixel-summer-games` (no "Olympic" in the public address) and GitHub Pages switched to deploy from GitHub Actions.
- Live at https://luckyloneranger.github.io/pixel-summer-games/
- The claude.ai preview artifact is a separate single-file build (that host only allows inline scripts).

## v1 complete

All of Phases 0–9 are approved. The game is live at https://luckyloneranger.github.io/pixel-summer-games/ and redeploys automatically on every push to `main`.

## Phase 10 – High jump

**Done**
- High jump (`src/events/high-jump.ts`): 20 m run-up, take-off line, bar 1.0 m past it, landing mat, uprights and a height board. Same tap / hold / release controls. Clear or knock is decided from the exact flight path (`Projectile.heightAt`), so it doesn't depend on frame timing.
- Bar heights 1.85 → 2.40 m; up to 3 tries per height, three misses in a row ends it, best height counts (`src/events/height-attempts.ts`). Fouls count as misses.
- Shared field-event base now takes any attempt tracker (3 attempts or rising heights); long jump and javelin unchanged, all their tests pass.
- New athlete frames: the arched "flop" and lying on the mat. Knocked bar falls with a clank.
- Scoring 1.50 m = 0, 2.30 m = 1,000; qualifying 2.00 m on Normal (Easy 1.80, Hard 2.12). CPU bests Easy 1.85–2.05, Normal 2.00–2.20, Hard 2.15–2.35 m.
- Added everywhere: Practice, Versus "ALL" and the championship, now 5 events in decathlon order. High-score entries from 4-event runs are kept and marked "*".
- Results table for heights (POS, NAME, BEST, MISSES, PTS); How to Play page; SPEC sections 3, 5 and 6 updated.
- 216 unit tests (adds jump physics, height progression, misses, fouls, turns, CPU bests, scoring).

**Known issues / notes**
- Starting the hold is a real skill: at top speed you need to begin about 8 m before the line to reach 60° in time.
- The landing is detected at ground level rather than the mat's top, so the CLEARED banner appears about 0.1 s late.

## Phase 11a – Online: server, lobby and races

**Done**
- Decisions recorded in SPEC (Phase 11 section) and working rule 6 updated in SPEC and CLAUDE.md: network use is allowed in Online mode only.
- Room relay server (`server/index.ts`, `server/wrangler.jsonc`): a Cloudflare Worker with one Durable Object per 4-letter room; at most two players; relays well-formed messages only; tells each player when the other joins or leaves; stores nothing. Uses the hibernation WebSocket API so idle rooms cost nothing.
- Shared message format with no imports (`src/net/protocol.ts`), checked on both ends; connection class with an inbox the game reads each step (`src/net/connection.ts`). Server address from `VITE_ROOMS_URL` (set by the deploy workflow), `ws://127.0.0.1:8787` locally.
- Screens: Online menu (Create / Join), join by code (arcade letters), lobby (code shown big, both players' initials, host picks races and CPU level), ready-up on every intro card, online pause (Resume / Leave match; the race carries on), "YOUR FRIEND LEFT" / "CONNECTION LOST".
- Online races: each device runs its own runner and sends its state 20 times a second; the other runner is drawn from that and moved smoothly between messages. The host runs the start sequence and rules on false starts (the guest reports early presses). CPUs use a shared seed per event, so both screens agree. Hurdles also share jumps, knocked hurdles and stumbles. No photo-finish freeze online.
- Only your own score goes into your high-score table online; the connection closes when the match ends.
- Deploy workflow deploys the server (when the Cloudflare secrets exist) and builds the game pointing at it.
- 228 unit tests (adds two linked race games with simulated lag giving identical results, guest false starts and disqualification on both screens, hurdles sync, room codes, message checks, the connection).
- Checked with the real server locally (`wrangler dev`): two browsers completed a full online match (both races, winner screen identical on both), and a guest closing their tab mid-race shows "YOUR FRIEND LEFT" on the host.

**Known issues / notes**
- Online field events (long jump, high jump, javelin) come in 11b; the lobby offers races only.
- The room server is live at pixel-summer-games-rooms.pixel-summer.workers.dev; every push to main redeploys it with the game.
- Some phone networks may add lag; it only affects how smoothly the other runner moves, never anyone's time.

**Next:** Phase 11b – online field events and reconnect.


## Phase 11b – Online: field events and reconnect

**Done**
- Online long jump, high jump and javelin. Turn order is worked out the same way on both devices. The player who's up runs their attempt on their own device and sends the run-up 20 times a second, then the take-off (spot, speed, angle); the other screen replays the identical flight and lands it with the mark the jumper's device measured. A screen that's behind skips ahead.
- Lobby: ALL FIVE, BOTH RACES, or any single event.
- Reliable delivery: important messages are numbered, confirmed by the other side, kept until confirmed and resent after a reconnect; repeats are ignored. Position updates aren't numbered (a newer one is always coming). Message format version 2.
- Reconnect: after a drop the game reconnects to the same seat by itself (every second, for up to 10 s) and the match carries on meanwhile. Banners: "RECONNECTING… n" on the dropped screen, "WAITING FOR XXX TO RECONNECT n" on the other. After 10 s the match ends; choosing Leave match ends it at once for both.
- Server: a returning player reclaims their seat (replacing their old socket if the server hasn't noticed the drop yet); someone new joining resets message numbering.
- Fixed (from Phase 10): in a two-player high jump, once one player was out the turn order could keep picking them and the event never ended. Players who are out are now skipped.
- Housekeeping: GitHub Actions updated to their latest major versions; a new browser test (`tests/e2e/online.spec.ts`) starts the room server locally and plays a 100 m and a long jump between two browsers, cutting and restoring the guest's connection in each, and checks both screens show identical results. It runs locally and in CI.
- 247 unit tests (adds message numbering, confirmations, resending, repeats, reconnect within and past the window, the banners, a new friend joining; linked long jump, javelin and high jump games with 0, 100 and 680 ms of lag giving identical attempts; turn taking; the high-jump turn fix).

**Known issues / notes**
- If a whole attempt's run-up happens while you're disconnected, you'll see the jump replayed from the take-off when you're back, not the run-up.
- Reloading the page mid-match counts as leaving: the reconnect only covers network drops.

**Next:** Phase 12 – a more fun title screen.

## Phase 12 – A more fun title screen

**Done**
- New title screen (`src/scenes/title.ts`): a night-time stadium with floodlight towers and sweeping beams, twinkling stars, and a Mexican wave rolling along the crowd every few seconds.
- The logo sits on a scoreboard panel with chasing bulbs. It drops in and bounces, throws confetti when it lands, and a shine sweeps across the letters every few seconds.
- Four background acts take turns on the track: a three-way sprint, a long jump into the sand, a javelin throw that sticks in the ground, and a high jumper flopping over the bar onto the mat. All four play before the demo race starts.
- "PRESS START" cycles colours, with arrows nudging in. Enter fires the starting pistol with a quick white flash, then opens the menu.
- A ticker along the bottom shows the top championship score, your personal bests (or a nudge to set one) and tips.
- With "reduce flashing" on, the shine, flash, sweeping beams, bulb chase and twinkle all stay still, and Enter goes straight to the menu.
- The demo race now starts after 15 s of no input (was 8 s).
- Title logic is kept apart from drawing (`src/game/title-show.ts` for the logic, `src/gfx/title-art.ts` for the drawing). Every timing and speed is in `TITLE` in `tuning.ts`.
- 258 unit tests. The new ones cover the logo drop and bounce, the shine, the wave, the confetti, all four acts fitting before the demo, each act's motion (the javelin lands, the high jumper clears the bar), and the ticker text and scrolling.

**Known issues / notes**
- Title music is unchanged, as agreed.

**Next:** Phase 12b – hints that match the device.

## Phase 12b – Hints that match the device

**Done**
- One place for the words on screen for each control (`src/ui/prompts.ts`). With a keyboard: your keys, including any you changed in Options ("RUN A+D  HOLD W", "PRESS ENTER", "ESC: BACK"). On a phone: the buttons ("RUN ← →  HOLD ACTION", "TAP OK", "TAP TO START"). The hints switch the moment you go from touching the screen to typing, or back.
- Every screen uses them:
  - the four event hints and the race start line;
  - event intro cards;
  - the main, Practice, Online and Options menus;
  - results, podium, game over and the winner screen;
  - initials entry, join room and lobby;
  - all How to Play pages (rewritten for phones);
  - the title ticker tip.
- Title and demo on a phone: "TAP TO START", and a tap anywhere starts (the sound icon still works).
- The phone menu buttons now sit in one bar along the bottom edge (← ↑ ↓ → on the left, BACK and OK on the right). The old arrow cross covered list rows on Practice, Options, Player Setup, High Scores and Online. Notes that sat near the bottom move above the bar on a phone.
- "NEEDS A KEYBOARD" notes on a phone for Versus, two-player Championship and Options → Controls (which can't be opened without a keyboard).
- Fixed: the touch buttons ignored taps for 1 s after every screen change, which swallowed the first tap on the title. The pause now only follows an event, as intended.
- Fixed: two lines showed "?" because the font has no semicolon.
- Tests:
  - 265 unit tests. They check the keyboard and phone words, changed keys, the switch between devices, that no phone hint names a keyboard key, that every hint fits the screen, that every How to Play letter exists in the font, and the title's tap-anywhere area.
  - A new phone browser test (`tests/e2e/phone.spec.ts`) goes from the title to a 100 m race and its results by tapping only (Chromium and WebKit; Firefox can't emulate a phone).

**Known issues / notes**
- In the lobby on a phone, the "BACK: CLOSE ROOM" line is under the control bar; the BACK button still closes the room.
- The two-browser online test now runs in Chromium and Firefox only. Headless WebKit on GitHub's machines gives the second game window almost no animation frames, so the match couldn't finish in time (it passed there once, by luck). The game itself is the same in Safari; WebKit still runs the desktop and phone smoke tests. Each test player now also gets their own browser, like two real devices.

**Next:** Phase 13 – graphics quality.

## Phase 13 – Graphics quality (13a–13d together)

Built in one go at the user's request, instead of one sub-phase at a time.

**Done**
- **13a – Athletes.**
  - Every sprite now has a dark outline and lighter top edges (shoulders, hair). This is done when the sprite is built, so all poses and kits get it.
  - The run cycle has 6 frames instead of 4 (two new passing frames).
  - New hair styles: CPU athletes now have short hair, a bun or long hair.
  - A soft shadow sits on the ground under every athlete. It shrinks as they leave the ground, and takes the colour of what's under it (track, sand or mat).
  - The palette grows from 24 to 36 colours, with highlight shades and sky colours.
- **13b – Stadiums.**
  - A time of day for each event: day for the 100 m and long jump, sunset for the hurdles and javelin, night for the high jump.
  - Dithered sky gradients with a sun, drifting clouds or twinkling stars.
  - A roof with floodlight towers (lit at sunset and night), flags flapping on the front wall, mown grass stripes.
  - Camera flashes in the crowd on a winning run or a qualifying mark.
  - The stand now starts lower (row 40 instead of 24) so a strip of sky shows under the scoreboard. The crowd has 6 rows instead of 8.
- **13c – Effects.**
  - Speed lines behind you near top speed.
  - A javelin trail and its shadow on the grass.
  - A sand burst on long-jump landings and a mat squash in the high jump.
  - A blinds wipe between screens.
  - **Highlight:** when a jump or throw is heading past the qualifying mark, the game drops to slow motion and zooms in for about a second. This is offline only, because it would put online games out of step.
- **13d – Retro TV** (Options, off by default): scanlines and darker corners over the finished picture.
- **Reduce flashing** also turns off camera flashes and the highlight. The Options rows are packed a little closer to fit the new row.
- **Tests:** 279 unit tests. The new ones cover:
  - outlines and highlights staying in the palette;
  - sprite size and hair styles;
  - sky themes and dithered gradients;
  - speed lines, the wipe and the zoom curve;
  - the highlight coming on for a qualifying jump and not for a short one.

**Known issues / notes**
- Athletes stay 16×24 rather than the 24×32 first suggested. Four runners share 14-pixel lanes, so taller sprites would overlap the wall and each other, and every event would need re-laying out. The outlines, shading and extra frames give most of the gain.
- The highlight zoom isn't pixel-perfect (it's a 1.25× enlargement for about a second). That's deliberate: it reads as a camera move.

**Next:** Phases 14–16.

## Phases 14–16 – Planned and built in one go (user's request)

**Phase 14 – Reasons to come back**
- **Ghost runner:** your best 100 m, hurdles and 50 m swim race beside you as a see-through ghost (offline, one player; Options → Ghost runner).
- **Awards:** 17 of them, an AWARD! banner when you earn one, and an AWARDS screen on the main menu.
- **Weekly online leaderboard:** off until you turn it on in Options.
  - When it's on, new personal bests send your initials and mark to the game server.
  - The weekly top 10 for each event shows in High Scores.
  - The server checks marks against believable limits and allows 20 sends per hour from each address.
  - It's deployed and running on Cloudflare (the deploy log shows the new storage). Working rule 6 is updated in SPEC and CLAUDE.md.

**Phase 15 – Four new events**
- **Triple jump:** tap Action just before each landing. Good, weak or missed contacts decide whether the step and jump happen.
- **Pole vault:** bars from 4.60 to 6.20 m, with a pole that's carried, bent and dropped.
- **Hammer throw:** spin by tapping, then let go in the green sector on a dial.
- **50 m freestyle:** a race in a pool, with new swimming sprites.
- **Tuning against real-world levels:** a perfect triple jump reaches about 18 m and a perfect vault about 6.4 m.
- **Where they appear:** all nine events are in Practice, Versus, bests, the ticker, How to Play, awards and the leaderboard.
- **Championship and online:** the Championship stays at the classic five. Online offers every event except the hammer.

**Phase 16 – Controls and polish**
- **Gamepad support,** with hints that switch to pad buttons when you use one.
- **Music:** a new original title tune, and a fanfare on each event's intro card.
- **Fixes:**
  - the lobby's "close room" note was hidden under the phone control bar;
  - CLEARED appeared about 0.1 s late in the high jump (jumps now land on the mat top).

**Tests**
- 325 unit tests. The new ones cover:
  - ghost recording and replay;
  - awards;
  - leaderboard rules, ISO weeks, ranking and the client;
  - every event being wired up;
  - triple-jump contacts;
  - pole-vault heights and clearance;
  - hammer sector, fouls and three throws;
  - a believable swim time;
  - online sync for the triple jump, pole vault and swim;
  - gamepad input and hints;
  - landing on the mat.
- The browser tests pass.

**Known issues / notes**
- The hammer is offline only. Online needs its spin streamed like a run-up.
- The leaderboard's anti-cheat is basic: limits and a rate limit. A determined cheater could still post a believable fake mark.
- Reloading mid-match still counts as leaving an online match.
- A gamepad's Start button confirms. Pause with B or Select.

**Next:** Phase 17.

## Phase 17 – Improvements (planned and built in one go)

**Done**
- **17a Touch:**
  - In the hurdles, tap both run pads together to jump. Two thumbs are enough.
  - Field events give ACTION the whole middle of the lower screen.
  - Tap a row in the main, online, practice, options and pause menus.
- **17b Gamepad:** a second pad drives player 2, and Start pauses an event.
- **17c Online:**
  - The hammer works online.
  - "WATCHING ANN" shows during the other player's attempt.
  - **Rejoin after a reload:** the game reconnects to the same seat and gets the standings, and the event in progress restarts from its intro card. A browser test reloads the guest mid-race and finishes the race.
  - Message format 3; the reconnect window grows from 10 to 15 s.
- **17d Leaderboard:**
  - Race marks must include the run, which the server checks.
  - New all-time table, and your weekly and all-time rank on the results screen.
  - Checked against the local server: ranks come back, a worse mark never replaces a best, and a 100 m without its run is refused.
- **17e Gameplay:**
  - A flag marks your last take-off.
  - New CLASSIC 5 / ALL 9 championship choice, with its own high-score table.
  - Fixed a leftover "ALL FOUR" label in Versus.
  - **Balance from scripted tapping:** the hammer was a little hard, and its green sector lasted only about 44 ms at top spin. It's now about 57 ms, 7 taps/s qualifies and about 8.6 taps/s beats the CPUs. The swim award was too easy.
- **17f Housekeeping:**
  - The run-up events and the hammer share one message-sync file (`attempt-sync.ts`) instead of two copies.
  - The race's track painting moved to `track-markings.ts`.
  - One more attempt at the online browser test in WebKit (bringing each window to the front).
- **Tests:** 348 unit tests and 4 browser tests (desktop, phone, online, online rejoin).

**Known issues / notes**
- Feel-based tuning still needs your play-test notes from a real phone.
- **Rejoin:** a reload during an event restarts that event for both players.
- **Leaderboard runs:** only solo offline races record a run, so two-player and online race marks aren't sent.
- The hammer's green sector is still a tight timing window at full spin. Tune `HAMMER.MAX_TURN_RATE` and `HAMMER.SECTOR` after playing.
- **File sizes:** `race-event.ts` (about 790 lines) and `run-up-event.ts` (about 610) are still large. The cuts made were the safe ones; splitting further would mean opening up much of their private state.

**Next:** waiting for approval.
