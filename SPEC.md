# Pixel Summer Games — Build Spec for Claude Code

Nov 3, 2026 · @Harendra Prasad

## 1. How to use this spec

Claude Code builds the game in 10 short phases. Each phase ends with something you can play, and you check it before the next one starts.

**Before you start (one-time setup)**

- Install a current Node.js LTS release and Git.
- Install Claude Code and create an empty project folder, for example `pixel-summer-games/`.
- Export this doc as Markdown and save it in that folder as `SPEC.md`.
- Optional: copy section 11 into a file called `CLAUDE.md` in the same folder. Claude Code reads `CLAUDE.md` at the start of every session, so the rules stay in force.

**Each phase**

1. Paste the starter prompt from section 12 for Phase 0. For later phases, say "Plan Phase N".
2. Read Claude Code's short plan, then approve or adjust it.
3. When it says the phase is done, run `npm run dev` and play the game in your browser.
4. Give feedback in plain words, for example "the runner is too slow to get going". All gameplay numbers live in one file, `src/game/tuning.ts`, so most tweaks are one-line changes.
5. Say "Phase N approved" to move on.

**For Claude Code:** this file is the source of truth. When the user changes a decision, update this file to match.

## 2. Game overview and design pillars

**Pixel Summer Games** (working title) is a retro 8-bit track-and-field game for the browser. You alternate two keys as fast as you can to run, then time a third key to jump or throw. It takes after the 1980s console athletics games.

**Design pillars**

1. **Learn it in 10 seconds, master it over weeks.** Two run keys and one action key. Skill comes from tap rhythm and timing.
2. **The running has to feel physical.** Your tap rate shows up straight away in the runner's speed, the stride animation, the footstep sounds and the crowd noise.
3. **Short sessions.** One event takes under 60 seconds. A full championship takes 5 to 8 minutes.
4. **Authentic retro look and sound.** Low-resolution pixel art, a limited colour palette and chiptune audio. All of it is original.
5. **Runs anywhere.** It works in any modern desktop browser and on phones and tablets with on-screen buttons. No install, no login, no server. (Optional online play is planned for Phase 11, after v1; it would add a small server just for connecting players.)

**Original work only.** All characters, art, music, sound effects and names are new. Nothing is copied from existing games such as Konami's *Track & Field* or Nintendo titles. Don't use the words "Olympic" or "Olympics" or the five-ring symbol, because they are protected trademarks. Use "Summer Games" and "Championship" instead.

## 3. Scope

Version 1 has four events, three modes, keyboard and touch controls, and high scores saved in the browser. Everything else waits for later phases.

| Area | In v1 | Later (backlog, rough priority order) |
| --- | --- | --- |
| Events | 100 m dash, long jump, javelin throw, 110 m hurdles (high jump added in Phase 10) | Triple jump, 100 m freestyle swim, archery, weightlifting, skeet shooting, hammer throw, pole vault |
| Modes | Championship (arcade), Practice (any single event), Versus (2 players on one keyboard) | Online multiplayer (Phase 11), ghost runner of your best run, achievements |
| Controls | Keyboard on desktop, on-screen touch buttons on mobile | Gamepad (browser Gamepad API) |
| Saving | High scores, personal bests and settings in the browser (localStorage) | Online leaderboard (would need a server) |
| Customisation | Player initials and team colour | Athlete looks, kit designs |

**Not in v1:** online multiplayer (added from Phase 11, after v1, with a small relay server), accounts, a backend server, payments or ads, 3D graphics, real athletes, licensed music.

## 4. Controls and core mechanics

Every event uses the same two systems: alternate-tap running and a hold-and-release angle meter.

### Controls

| Action | Player 1 | Player 2 | Touch (mobile, landscape) |
| --- | --- | --- | --- |
| Run (alternate the two keys) | A then D | ← then → | Left and right run pads |
| Action (jump, throw, set angle) | W or Space | ↑ | Large action button |
| Menus | Arrow keys or W/S, Enter to confirm | – | On-screen arrow, OK and BACK buttons (decided in Phase 8, instead of tapping items) |
| Back / pause | Esc or P | – | Pause icon |
| Mute | M | – | Speaker icon |

In 1-player games, both key sets work. Map keys to logical actions (P1\_LEFT, P1\_RIGHT, P1\_ACTION and so on) so they can be remapped in Options. Only the six gameplay keys can be remapped; Enter, Esc, P, M and the backtick key stay reserved for menus, pause, mute and debug (decided in Phase 8b). Touch buttons stay visible on touch devices, hide when a physical key is pressed, and ignore new touches for a moment after leaving an event's buttons, so a finger still tapping a run pad can't hit a menu button. On menu screens the buttons sit in one bar along the bottom edge (← ↑ ↓ → on the left, BACK and OK on the right) so they never cover the menu. On the title and demo, a tap anywhere starts.

**Hints match the device in use** (decided in Phase 12b). Every on-screen hint is built from one place (`src/ui/prompts.ts`). With a keyboard it names the keys, following any keys changed in Options ("RUN A+D  HOLD W", "PRESS ENTER", "ESC: BACK"). On a phone it names the buttons ("RUN ← →  HOLD ACTION", "TAP OK", "TAP TO START"). Hints switch the moment the player changes device. Screens that continue use the OK button on a phone, not a tap anywhere, so fingers still mashing ← → can't skip the results. Versus, two-player Championship and changing keys show "NEEDS A KEYBOARD" on a phone.

### Alternate-tap running

- A **valid tap** is a press of the run key opposite to the last valid one. Pressing the same key twice gives nothing, which stops one-key spamming.
- Holding a key does nothing. Ignore keyboard auto-repeat (`event.repeat`).
- Each valid tap adds speed, with smaller gains near top speed. Speed drains every frame, so you must keep tapping.
- Target feel: about 7 taps a second reaches about 85% of top speed. 10 or more taps a second reaches top speed.
- Target times: an average player runs 100 m in 11 to 12 s. A strong player gets under 10 s.
- Show a speed meter. Tie the run-cycle frame rate and footstep sound to speed.

```
on valid tap:  speed += TAP_IMPULSE * (1 - speed / AIM_SPEED)
               speed = min(speed, MAX_SPEED)
every tick:    speed = max(0, speed - DRAG * dt)
               speed = min(speed, MAX_SPEED)
               position += speed * dt        // metres
```

- `AIM_SPEED` is set above `MAX_SPEED` so that 10 taps a second actually reaches the cap. (With `MAX_SPEED` in the formula, speed only creeps towards the top and 10 taps a second would give about 90%.) Decided in Phase 1.
- If both run keys are pressed in the same instant, only one tap counts, so pressing both together isn't a shortcut.

### Hold-and-release angle (long jump, javelin)

- Press and hold Action to start the angle meter. The athlete keeps moving at their current speed but can't speed up.
- The angle rises from 0° at `ANGLE_RATE` degrees a second while held, up to a cap of 80°.
- Release to take off or throw. The angle locks and an arc indicator shows it.
- Flight uses simple projectile physics: launch speed = run speed × `LAUNCH_EFFICIENCY`, at the locked angle, with a per-event `GRAVITY`. Releasing near 45° at top speed gives the best result.

### Fouls and false starts

- **Foul (field events):** releasing past the foul line. Show "FOUL" with a buzzer. The attempt counts, with no mark.
- **False start (races):** pressing a run key before GO. Show "FALSE START" and restart the race. A second false start by the same player disqualifies them from that race (0 points). This is gentler than the real one-strike rule, to suit an arcade game.

## 5. Event specs

Each event shows an intro card first: event name, qualifying mark and a one-line controls hint. All marks below are for Normal difficulty and are starting values in `tuning.ts`.

| Event | Attempts | Input | Result measured | Qualifying mark | Great result |
| --- | --- | --- | --- | --- | --- |
| 100 m dash | 1 race | Alternate taps | Time, to 0.01 s | 12.00 s or faster | Under 10.00 s |
| Long jump | 3 jumps, best counts | Taps, then hold and release Action | Distance, to 0.01 m | 7.00 m or more | Over 8.50 m |
| High jump (Phase 10) | Up to 3 tries per bar height; 3 misses in a row ends it | Taps, then hold and release Action | Best height cleared, to 0.01 m | 2.00 m or more | Over 2.30 m |
| Javelin throw | 3 throws, best counts | Taps, then hold and release Action | Distance, to 0.01 m | 70.00 m or more | Over 90.00 m |
| 110 m hurdles | 1 race | Alternate taps, tap Action to clear each hurdle | Time, to 0.01 s | 15.50 s or faster | Under 13.50 s |

### 100 m dash

- Up to 4 lanes: the player(s) plus CPU runners to fill the rest.
- Start sequence: "ON YOUR MARKS", then "SET", then a random wait of 1.0 to 2.5 s, then GO with a starting-pistol sound.
- The camera follows the human player, looking slightly ahead.
- The race ends when every runner crosses the line. Show each lane's time and the player's reaction time.
- Nice to have: a photo-finish freeze frame when the top two are within 0.05 s. (Built in Phase 9.)
- If a player stops running after everyone else has finished, they get "DID NOT FINISH" (no mark) after 3 s, so the race can't hang. Decided in Phase 9.

### Long jump

- 40 m runway, a take-off board with a foul line at its front edge, then a sand pit.
- Tap to build speed, then hold and release Action (section 4). The take-off point is where you release.
- Release within 0.20 m before the foul line for "PERFECT TAKE-OFF" and a 5% distance bonus.
- Distance is measured from the foul line to the landing mark. Show a sand puff and a tape-measure animation.

### High jump (added in Phase 10)

- 20 m run-up to a take-off line, with the bar 1.0 m past the line and a landing mat behind it. Same tap, hold and release input as the long jump.
- The jump is real projectile flight from a 1.0 m take-off height: you clear the bar if your height as you pass it is above the bar. Too flat isn't high enough, too steep lands on the bar, and taking off far too early falls short. About 60–70° at speed, released just before the line, works best.
- The bar goes up through 1.85, 1.95, 2.05, 2.15, 2.20, 2.25, 2.30, 2.35 and 2.40 m. Up to 3 tries per height; clearing moves the bar up, three misses in a row ends your event. Releasing past the line is a foul and counts as a miss. Your mark is the highest height cleared.
- Two players alternate jumps. CPU marks are one best height per CPU, drawn from a range per difficulty and snapped to the bar heights.
- A knocked bar falls onto the mat with a clank; a clearance gets a cheer.

### Javelin throw

- 30 m runway and a foul line. Same tap, hold and release input as the long jump.
- The javelin tilts to follow its flight path. The camera follows it to the landing, where it sticks in the ground and wobbles.
- Distance is measured from the foul line. Ignore landing angle and sector lines in v1.

### 110 m hurdles

- 10 hurdles at the real spacing: first hurdle at 13.72 m, then one every 9.14 m, last hurdle 14.02 m from the finish.
- Tap Action to jump. The jump arc lasts about 0.45 s.
- Run-key presses in the air (or while stumbling after running into a hurdle) add no speed, but they still count for left/right alternation, so you don't lose your rhythm on landing. Decided in Phase 5.
- Hitting a hurdle (jumping too early, too late, or not at all) knocks it over, plays a clank and cuts speed by 40%. Running straight into one cuts more. A knocked hurdle never disqualifies you.
- Same start sequence, false-start rule and CPU runners as the 100 m.

## 6. Game modes, scoring and screen flow

Championship mode chains the four events. You must hit each qualifying mark to continue, and your points total decides the final podium.

### Modes

- **Championship (1 or 2 players).** Events run in this order: 100 m, long jump, high jump, javelin, 110 m hurdles (decathlon order; the high jump joined in Phase 10). Missing a qualifying mark ends the run, as in classic arcade games. A "Casual" setting in Options lets you carry on with 0 points instead. With 2 players, they share races side by side and take turns on field-event attempts. A player who misses a qualifying mark is out and sits out the remaining events; the run ends only when both players are out. Each player can enter a high score.
- **Practice.** Pick any event. No qualifying marks, unlimited retries, and your personal best is shown.
- **Versus (2 players).** A single head-to-head event, or all five. Highest points total wins. No qualifying marks. CPU runners still fill the empty lanes but don't count towards the winner. Versus has its own top-10 table.

### Difficulty and CPU opponents

- Easy, Normal and Hard. Difficulty changes the qualifying marks (Easy: times 8% slower and distances 10% shorter; Hard: times 4% faster and distances 6% longer) and the CPU strength.
- CPU runners use the same tap-running code as the player, at a set tap rate: Easy 6.5, Normal 8.5, Hard 10.5 taps a second, varied by ±10% each race. Reaction to GO is 0.15 to 0.35 s.
- CPU field-event marks are drawn from a range per difficulty, without simulating the run-up.
- All randomness uses a seeded random-number generator, so any run can be replayed exactly for debugging.

### Scoring

Each event awards points on a straight-line scale between a "0 points" mark and a "1,000 points" mark. Beating the 1,000 mark earns more, capped at 1,200. A foul, disqualification or no mark scores 0.

```
races:   points = 1000 * (zeroMark - time) / (zeroMark - parMark)
field:   points = 1000 * (distance - zeroMark) / (parMark - zeroMark)
then:    points = clamp(round(points), 0, 1200)
```

| Event | 0 points at | 1,000 points at |
| --- | --- | --- |
| 100 m dash | 14.00 s | 9.80 s |
| Long jump | 4.00 m | 8.50 m |
| High jump | 1.50 m | 2.30 m |
| Javelin throw | 30.00 m | 90.00 m |
| 110 m hurdles | 20.00 s | 13.00 s |

- **Medals:** each event ranks the player against the CPU field for gold, silver or bronze. The championship podium ranks everyone by total points.
- **High scores:** top 10 per mode, with 3-letter initials entered arcade-style. Personal bests are kept per event. All saved in the browser.

### Screen flow

&#91;embedded content: Championship screen flow · 9 screens, 1 decision\]

A qualified event loops back to the next intro card. A missed mark goes straight to Game over.

1. **Title**: a night-time stadium with floodlights, twinkling stars and a Mexican wave in the crowd; the logo drops in on a scoreboard panel with a bounce and confetti, and a shine crosses it now and then; athletes show off each event in turn on the track (sprint, long jump, javelin, high jump); a ticker along the bottom shows the top score, your personal bests and tips. "PRESS START" cycles colours; Enter fires the starting pistol with a quick white flash, then opens the menu. With "reduce flashing" on, the shine, flash, sweeping lights and twinkle stay still. After 15 s with no input the attract-mode demo race starts.
2. **Main menu:** Championship, Practice, Versus, High Scores, How to Play, Options.
3. **Player setup:** initials, team colour, difficulty.
4. **Event intro card:** event name, qualifying mark, controls hint.
5. **Event** (play).
6. **Event results:** marks, points, medal, qualified or not.
7. Qualified and events remain: back to step 4 for the next event. Not qualified: **Game over**, then step 9.
8. After the last event: **Podium** ceremony with medals and a fanfare.
9. **High-score entry** if the score makes the top 10, then back to the Title.

Practice goes Menu → Event select → Event → Results → Retry or Back. **Pause** (Esc/P) opens an overlay with Resume, Restart event, Options and Quit to menu. The game pauses itself when the browser tab is hidden or loses focus.

## 7. Art and audio direction

All graphics and sound are generated in code, so v1 needs no image or audio files.

### Visuals

- **Resolution:** draw everything at 320 × 180 pixels (16:9) on an offscreen canvas. Scale it up by the largest whole number that fits the window, centred with black bars. Turn image smoothing off (`imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`) so pixels stay sharp.
- **Palette:** one fixed palette of 24 original colours in `palette.ts`, in the spirit of 8-bit consoles. Use no colours outside it.
- **Sprites:** define them in code as pixel maps (arrays of strings, one character per palette colour). Turn them into small canvases at load time.
- **Athlete:** 16 × 24 pixels. Frames: 4-frame run cycle, crouch, set, jump, throw, celebrate, stumble. Team colours come from swapping palette entries.
- **Stadium:** crowd stand that scrolls slower than the track (parallax), with a 2-frame wave on big results. Track with lane lines and distance markers. Scoreboard panel at the top showing event, attempt, time or distance, and the speed meter.
- **Font:** an 8 × 8 pixel bitmap font defined in code (preferred, no extra files). Alternative: "Press Start 2P", which is under the SIL Open Font License, bundled locally.
- **Game feel:** dust puffs at high speed, sand splash, small screen shake on a hurdle hit, flashing "NEW RECORD!", camera that leads in the running direction. Shake and flashes can be turned off in Options.

### Audio

- Synthesise all sound at runtime with the Web Audio API. Imitate the four classic 8-bit channels: two square-wave, one triangle-wave and one noise.
- **Sound effects:** menu move and select, starting pistol, footsteps (pitch rises with speed), jump, javelin whoosh, sand landing, hurdle clank, foul buzzer, crowd cheer (filtered noise that swells), medal fanfare, new-record jingle.
- **Music:** three short original loops written as note lists: title, menu/results, podium fanfare. During events, play crowd ambience only.
- Browsers block sound until the player interacts, so create or resume the audio on the first key press or tap.
- Options: master, music and effects volume, plus mute. Saved between visits.

## 8. Technical architecture

The stack is TypeScript, Vite and plain HTML5 Canvas 2D, with no game engine. The output is a static site that any free host can serve.

### Stack

- **Language and build:** TypeScript (strict mode), Vite, npm.
- **Rendering:** HTML5 Canvas 2D. No game engine. The game is 2D side-view, so the code stays small and easy to follow. Phaser 3 is the fallback if needed.
- **Tests:** Vitest for game logic, Playwright for one end-to-end smoke test.
- **Dependencies:** none at runtime beyond the above. Ask the user before adding any package.

### Game loop

- Update game logic at a fixed 60 steps a second using an accumulator. Draw once per `requestAnimationFrame`.
- Cap the time step at 250 ms so the game doesn't race ahead after a tab switch.
- Game logic works in metres and seconds. Convert to pixels only when drawing (`PIXELS_PER_METER` per event).

### Modules

- **Game:** owns the loop, the canvas, the scene stack and shared services.
- **SceneManager:** push, pop and replace scenes. Scenes: Title, Menu, PlayerSetup, EventIntro, EventPlay, Results, Podium, HighScoreEntry, Options, HowToPlay, Pause (overlay).
- **Input:** turns key, touch and later gamepad events into a per-frame snapshot of logical actions with `isDown`, `justPressed` and `justReleased`. Ignores auto-repeat. Stops arrow keys and Space from scrolling the page. Key mapping lives in `keymap.ts`.
- **TapRunner:** the shared alternate-tap speed model. Used by every event and by CPU runners.
- **Projectile:** the shared flight maths for jumps and throws.
- **Renderer:** wraps the low-resolution canvas: sprites, rectangles, text, camera and scaling.
- **Audio:** synthesiser, sound-effect list and music player.
- **Storage:** localStorage wrapper with a versioned key (`psg:v1`). Falls back to memory if storage is blocked.
- **tuning.ts:** every gameplay number, grouped by event, with units in comments: tap impulse, drag, top speed, angle rate, gravity, qualifying marks, scoring marks, CPU tap rates, timings.
- **rng.ts:** seeded random-number generator (for example mulberry32). A `?seed=` URL parameter replays a run exactly.

Every event implements one interface, so the championship code treats them all the same:

```ts
interface AthleticsEvent {
  id: 'dash100' | 'longJump' | 'javelin' | 'hurdles110';
  name: string;
  kind: 'race' | 'field';
  attempts: number;                        // 1 for races, 3 for field events
  init(ctx: EventContext): void;           // players, difficulty, rng
  update(dt: number, input: InputSnapshot): void;  // logic only, no drawing
  render(r: Renderer): void;               // drawing only, no logic
  isFinished(): boolean;
  getResults(): EventResult[];             // per player: mark, foul, points
}
```

### Debug tools

- `?debug=1` in the URL, or the backtick key, shows an overlay: FPS, current state, speed, tap rate, angle and positions.
- Debug-only keys: `[` and `]` for slow motion and fast forward, `N` to skip to the next event.

### Folder structure

```
pixel-summer-games/
  SPEC.md            this document
  CLAUDE.md          working rules (copy of section 11)
  PROGRESS.md        phase checklist, kept up to date by Claude Code
  README.md
  index.html
  package.json  tsconfig.json  vite.config.ts
  src/
    main.ts
    core/    game.ts loop.ts scene-manager.ts input.ts keymap.ts
             renderer.ts camera.ts rng.ts storage.ts
    audio/   synth.ts sfx.ts music.ts
    gfx/     palette.ts font.ts backgrounds.ts
             sprites/athlete.ts sprites/props.ts
    events/  event.ts tap-runner.ts projectile.ts cpu.ts
             dash100.ts long-jump.ts javelin.ts hurdles110.ts
    scenes/  title.ts menu.ts player-setup.ts event-intro.ts event-play.ts
             results.ts podium.ts high-scores.ts options.ts how-to-play.ts pause.ts
    game/    championship.ts scoring.ts tuning.ts
    ui/      hud.ts touch-controls.ts widgets.ts
  tests/
    *.test.ts
    e2e/smoke.spec.ts
```

### Deployment

`npm run build` produces a static `dist/` folder. Host it on GitHub Pages, Netlify or Vercel, all of which have free tiers. No server is needed.

## 9. Build phases

Build in this order. Get the feel of the running right with plain boxes before any art, then add one event at a time, then the menus, sound and polish. Every phase ends with the definition of done in section 10, then a stop for the user to play-test.

**Phase 0 – Setup and skeleton**

- Build: Vite + TypeScript project, Git repo, 320 × 180 canvas scaled sharply to the window, fixed-step game loop, scene manager, input module, debug overlay, placeholder "PRESS START" title, `PROGRESS.md`.
- Done when: `npm run dev` shows a crisp title screen that rescales with the window, the debug overlay shows FPS, and Enter moves to an empty menu.

**Phase 1 – 100 m with plain boxes**

- Build: TapRunner, start sequence, false starts, timer, finish line, result text. Coloured rectangles only.
- Done when: alternating A/D runs 100 m; the same key twice adds nothing; holding adds nothing; the time shows to 0.01 s; TapRunner unit tests pass.
- User step: tune the running feel here, before any art.

**Phase 2 – 100 m art and CPU runners**

- Build: palette, bitmap font, athlete sprites and run cycle, track, crowd, scoreboard and speed meter, 3 CPU runners, results screen with lane times.
- Done when: it looks like a retro game, CPU strength changes with difficulty, and false starts work.

**Phase 3 – Long jump**

- Build: hold-and-release angle meter, projectile flight, runway, board, sand pit, 3 attempts, fouls, perfect take-off bonus, best mark, tape measure.
- Done when: a release near 45° at top speed lands about 8.5 m; releasing past the line is a foul; projectile and foul unit tests pass.

**Phase 4 – Javelin**

- Build: reuse the run-up and angle meter; javelin flight and tilt; camera that follows it; 3 attempts.
- Done when: good throws land 85 to 95 m, fouls work, and the camera never loses the javelin.

**Phase 5 – 110 m hurdles**

- Build: 10 hurdles at real spacing, jump timing, knock-down slowdown, CPU hurdlers.
- Done when: a clean run of about 13 s is possible and hitting hurdles visibly costs time.

**Phase 6 – Game flow**

- Build: main menu, player setup, championship sequence, qualifying, scoring, results, game over, podium, high-score entry and saving, practice mode, pause.
- Done when: a full championship plays from title to podium, and high scores survive a page reload.

**Phase 7 – Audio**

- Build: synthesiser, all sound effects, 3 music loops, volume and mute options.
- Done when: every action has a sound, nothing plays before the first input, and mute is remembered.

**Phase 8 – Two players, touch and options** (built in two halves, each play-tested)

- **8a – Two players.** Build: Versus mode, 2-player championship (side-by-side races, turns on field events, per-player false starts and qualifying). Done when: two people can play on one keyboard.
- **8b – Touch and options.** Build: touch controls (shown automatically on touch devices; on-screen arrow/OK/BACK buttons in menus), key remapping, "assist run" option (hold a key to run at 80% speed, for players who can't tap fast), reduce shake and flashing option. Done when: the full game plays on a phone held sideways.

**Phase 9 – Polish and launch**

- Build: game-feel effects, How to Play screen, performance and browser checks, Playwright smoke test, README, deployment.
- Done when: a public link works in desktop Chrome, Firefox and Safari and on a phone.

**Phase 10 and on – More events**

- Add backlog events from section 3, one per phase, each following the same shape as Phases 3 to 5.

**Phase 11 – Online multiplayer (after v1)** (built in two halves, like Phase 8)

- Goal: two players on different devices play Versus together over the internet. Local play stays fully offline and unchanged.
- Decisions (made with the user when Phase 11 was planned):
  - **A small relay server on Cloudflare** (Workers + one Durable Object per room, in `server/`), chosen over peer-to-peer WebRTC (which fails on some networks without a paid relay) and over Vercel (whose WebSocket functions don't keep both players of a room on one instance and cut connections after about 5 minutes). Free tier; the server stores nothing and only relays messages between the two players in a room.
  - **Rooms by 4-letter code** (no I or O); no accounts; only initials and team colour are shared during a match.
  - **Each device runs its own player's athlete** and sends its state about 20 times a second; the other screen draws it. The host runs the race start (marks, set, the random wait, GO) and rules on false starts; CPU runners use a shared seed, so they're identical on both screens. Each player is timed on their own device, so lag never changes a result; both devices end with the same results table.
  - Online is **Versus only** for now. No auto-pause or debug skip online; the pause menu offers Resume or Leave match while the race carries on.
  - Working rule 6 allows network use in Online mode only. The claude.ai preview can't play online (its security rules block connections); the GitHub Pages site can.
- **11a:** the relay server, the Online menu, create/join by code, the lobby, a ready-up on each event card, online 100 m and hurdles, the winner screen, and "your friend left" handling.
- **11b:** online long jump, high jump and javelin (taking turns, watching the other player's attempt live), all five events, reconnect after a short drop.
  - Field events: players take turns in the same order on both devices. The device whose player is up runs the attempt and sends the run-up about 20 times a second, then the release point, speed and angle; the other screen replays the same flight and shows the mark the jumper's device measured. A screen that falls behind skips ahead to the next attempt.
  - Lobby choices: ALL FIVE (decathlon order), BOTH RACES, or any single event.
  - Reliable messages: everything except position updates is numbered, confirmed and resent after a reconnect; repeats are ignored.
  - Reconnect: a dropped player reconnects to the same seat by themselves for up to 10 seconds (`NET.RECONNECT_WINDOW`) while the match carries on. Their screen shows "RECONNECTING… n"; the other shows "WAITING FOR XXX TO RECONNECT n". After that the match ends ("CONNECTION LOST" / "YOUR FRIEND LEFT"). Leaving on purpose ends it at once.
  - An automated test (`tests/e2e/online.spec.ts`) runs the room server locally and plays a race and a long jump between two browsers, cutting and restoring one connection in each.
- Done when: two people on two devices can finish a Versus match together, and a dropped connection is handled cleanly.

## 10. Testing, quality and definition of done

A phase is done only when it builds cleanly, its tests pass and the user has a short list of things to try.

### Definition of done (every phase)

- [ ] `npm run build` finishes with no TypeScript errors.
- [ ] `npm test` passes.
- [ ] No errors in the browser console during normal play.
- [ ] Any new gameplay numbers live in `tuning.ts`.
- [ ] `PROGRESS.md` updated: what's done, known issues, what's next.
- [ ] 3 to 5 things for the user to play-test, plus the tuning values most likely to need adjusting.
- [ ] Committed to Git as "Phase N: short summary".

### Tests

- **Unit tests (Vitest)** for pure logic: tap alternation, speed limits, projectile distance, fouls, false starts, scoring, qualifying checks, high-score sorting, storage fallback. Keep game logic separate from drawing so these can run without a browser.
- **Smoke test (Playwright):** load the page, see the title, press Enter, start a 100 m practice race, simulate taps, reach the results screen, with no console errors.

### Performance and compatibility

- Steady 60 frames a second on a mid-range laptop and a recent phone. Avoid creating new objects every frame in the game loop.
- Total download under 500 KB compressed. With no image or audio files this should be easy.
- Works in current Chrome, Edge, Firefox and Safari on desktop, and Safari on iPhone and Chrome on Android in landscape.
- Handles window resize and phone rotation. Pauses when the tab is hidden.

### Accessibility

- Remappable keys.
- "Assist run" mode for players who can't tap fast.
- Option to reduce screen shake and flashing.
- Text readable at 1× scale (8 × 8 font minimum).
- Fouls and results shown with words and sound, not colour alone.

## 11. Working rules for Claude Code

Work one phase at a time, plan before coding, and stop for the user after every phase.

1. Read `SPEC.md` in full before starting. Re-read the relevant sections at the start of each phase.
2. Before coding a phase, give a short plan (files to add or change, open questions, risks) and wait for the user's OK.
3. Build the smallest playable version first. Plain boxes before art.
4. Put every tunable number in `src/game/tuning.ts`, with units in a comment. No unexplained numbers in event code.
5. Keep game logic (`update`) separate from drawing (`render`) so the logic can be unit-tested.
6. Ask before adding any npm package. No network requests while the game runs, except in Online mode after the player chooses it (Phase 11, approved by the user); offline modes stay fully offline. No analytics or tracking.
7. Original assets only. Don't copy sprites, music, sounds or names from existing games. Don't use "Olympic" or "Olympics" or the ring symbol. Fonts only under open licences such as the SIL Open Font License.
8. At the end of each phase, meet the definition of done in section 10, then stop and wait.
9. When the user reports a feel problem ("running feels sluggish"), suggest specific tuning changes with before and after values before rewriting any system.
10. If the spec is unclear or contradicts itself, ask. When the user changes a decision, update `SPEC.md` so it stays the source of truth.
11. Assume the user is not a professional game developer. Keep files small, names clear and comments short, explaining why rather than what. Explain any command the user needs to run.

## 12. Open decisions and starter prompt

Every decision below has a default, so Claude Code can start right away. Change any of them here before Phase 0, or later as you play.

| Decision | Default in this spec | Alternatives |
| --- | --- | --- |
| Game name | Pixel Summer Games | Any original name |
| Screen shape | 320 × 180, widescreen | 256 × 240, the squarer 8-bit console look |
| Engine | None (Canvas 2D + TypeScript) | Phaser 3 |
| v1 events | 100 m, long jump, javelin, 110 m hurdles | Swap any for high jump or swimming |
| Missing a qualifying mark | Game over, with a Casual option | Always continue with 0 points |
| Mobile | Supported from Phase 8 | Desktop only for v1 |
| Online play | Phase 11, after v1 (approach decided then) | Peer-to-peer (WebRTC) or relay server (WebSocket) |
| Hosting | GitHub Pages | Netlify, Vercel |

### Starter prompt

Paste this into Claude Code from inside your project folder:

```
Read SPEC.md in full. It is the source of truth for the game we are building.
Follow section 11, "Working rules for Claude Code".
Start with Phase 0 only. First give me a short plan: files, commands,
and anything you need from me. Wait for my OK, then build it.
When Phase 0 is done, meet the definition of done in section 10,
tell me what to check in the browser, and stop.
```

### Useful follow-up prompts

- "Phase N approved. Plan Phase N+1."
- "Running feels too easy. Suggest tuning changes with before and after values."
- "The long jump is hard to read. Suggest 3 ways to make the angle clearer, then wait."
- "Something is broken: \[what you did, what you expected, what happened\]. Find the cause before fixing it."
- "Update SPEC.md: we're switching hurdles for high jump in v1."
