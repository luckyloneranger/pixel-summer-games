# Pixel Summer Games

A retro 8-bit track-and-field game for the browser. Hammer two keys to sprint, then time a third to jump, throw or clear a hurdle. Five events, a championship with qualifying marks, practice, two-player Versus, chiptune sound and on-screen controls for phones.

**Play:** https://luckyloneranger.github.io/pixel-summer-games/ (once GitHub Pages is switched on, see [Deploying](#deploying)).

Everything (pixel art, font, music and sound effects) is original and generated in code. There are no image or audio files, no accounts and no tracking. Only Online mode and the opt-in weekly leaderboard use the network: a small server (in `server/`) that passes messages between the two players in a room, and keeps each week's top marks (initials and marks only).

## Events

| Event | How to play |
| --- | --- |
| 100 m dash | Wait for GO, then alternate A and D as fast as you can. Two false starts and you're out. |
| Long jump | Sprint, hold W to raise the angle, let go before the red line. About 45° is best; letting go on the white board is a perfect take-off. Three jumps, best counts. |
| High jump | Run up, hold W to set a steep angle (about 60–70°), let go just before the line. Clear the bar to raise it; three misses in a row and you're out. |
| Javelin | Same run-up and angle, but you throw. Three throws, best counts. |
| 110 m hurdles | Run with A and D, tap W to jump each hurdle (about 1 m before it at full speed). Hitting one costs speed. |
| Triple jump | Take off like the long jump, then tap W just before each landing: hop, step, jump. On time keeps your speed; miss it and the jump ends there. |
| Pole vault | Like the high jump with a pole and much higher bars (4.60 to 6.20 m). Go steep, about 70–75°. |
| Hammer throw | Tap A and D in turn to spin faster; press W as the hammer passes the green sector on the dial. More than five turns is a foul. Not online yet. |
| 50 m freestyle | The sprint's rules in a pool: wait for GO, then tap A and D. About 22 s at best. |

## Modes

- **Championship**, 1 or 2 players: all five events in order (100 m, long jump, high jump, javelin, hurdles). Miss a qualifying mark and you're out (Options → Casual mode lets you carry on with 0 points). Ends on the podium and the high-score table.
- **Practice**: any of the nine events, with your personal best shown. In the 100 m, hurdles and swim you race a see-through **ghost** of your best run (Options → Ghost runner).
- **Versus**, 2 players: the five championship events or any single event; the higher total wins.
- **Online**, 2 players on different devices: one creates a room and shares its 4-letter code, the other joins. Any event or all five; field events take turns and you watch your friend's attempts live. A short drop (up to 10 s) reconnects by itself.
- **How to Play**: a short guide to each event.
- **Awards**: 17 awards for things like a sub-10 second 100 m or finishing a championship on Hard. An "AWARD!" banner appears when you earn one.
- **High Scores**: your top 10s and bests, plus (if you turn it on) the **weekly online top 10** for each event.

## Controls

| Key | Player 1 | Player 2 |
| --- | --- | --- |
| Run (alternate) | A then D | ← then → |
| Action (jump, throw, angle) | W or Space | ↑ |

| Key | Does |
| --- | --- |
| Enter | Confirm / start |
| ↑ ↓ ← → (or W S A D) | Move in menus, change options, change initials |
| Esc or P | Back; pause during an event |
| M | Sound on / off |

In a one-player game, both key sets work. Keys can be remapped in **Options → Controls**.

**Gamepads**: LB and RB (or X and Y) to run, A for Action and OK, B to go back, the d-pad or left stick in menus. Hints switch to pad buttons as soon as you press one.

**Phones and tablets** (held sideways): on-screen run pads, an ACTION button, pause and sound icons, and arrow / OK / BACK buttons in menus.

**Options:** Casual mode, Assist run (hold a run key to run at 80% speed), Reduce flashing (no blinking text, flashes, shake or slow-motion zoom), Retro TV, Ghost runner, Leaderboard (off by default: when on, your initials and new personal bests go to the weekly online top 10), volumes and mute. Settings, high scores, personal bests, ghosts and awards are saved in your browser.

## Running it yourself

You need [Node.js](https://nodejs.org) (current LTS).

```bash
npm install      # one-time: downloads the build tools
npm run dev      # local server; open the http://localhost:5173 link it prints
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser tests (Playwright): title → 100 m → results, and an online match between two browsers through a local room server (with a dropped connection) |
| `npm run build` | Builds the static site into `dist/` |
| `npm run preview` | Serves the built `dist/` locally |

### Online play locally

```bash
npm run server:dev   # starts the room server on http://127.0.0.1:8787 (Cloudflare's local runtime)
npm run dev          # in a second terminal; open the game in two browser windows
```

In one window choose ONLINE → CREATE ROOM, in the other ONLINE → JOIN ROOM and type the code.

### Debug tools

- `?debug=1` in the URL, or the ` (backtick) key: overlay with FPS, state, speed, tap rate and positions.
- With the overlay open: `[` and `]` slow down or speed up the game, and `N` skips a championship event at the qualifying mark.
- `?seed=1234` replays the same random sequence.

## Tuning

Every gameplay number lives in [`src/game/tuning.ts`](src/game/tuning.ts), grouped by area with units in the comments: running speed, angle meter, each event, CPU strength, scoring and qualifying marks, sound levels, touch button sizes and effects.

## Project layout

```
src/
  core/    game loop, scenes, input and key maps, renderer, storage
  events/  the four events, shared race and field-event rules, CPU runners
  game/    tuning, scoring, championship, session, records
  gfx/     palette, font, sprites, stadium, effects
  audio/   synthesiser, sound effects, music
  scenes/  title, menus, setup, results, podium, high scores, options...
  ui/      scoreboard, menu widgets, touch controls
tests/     unit tests, and e2e/ for the browser smoke test
```

The design and rules are in [`SPEC.md`](SPEC.md); progress per phase is in [`PROGRESS.md`](PROGRESS.md).

## Deploying

The game is a static site. GitHub Actions builds it and publishes it to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`). One-time setup: **Settings → Pages → Source: GitHub Actions**.

For online play the same workflow first deploys the room server to Cloudflare, once two repository secrets exist (**Settings → Secrets and variables → Actions**):

- `CLOUDFLARE_API_TOKEN`: a Cloudflare API token made from the "Edit Cloudflare Workers" template.
- `CLOUDFLARE_ACCOUNT_ID`: your Cloudflare account ID (shown on the Workers & Pages overview).

The built game is pointed at the deployed server automatically. Without the secrets the server step is skipped and Online shows "could not reach the game server". A second workflow (`.github/workflows/test.yml`) runs the unit tests and the browser tests in Chromium, Firefox and WebKit.

## Originality

All characters, art, music, sounds and names are original. The game is inspired by 1980s arcade athletics games but copies nothing from them, and it is not affiliated with any sporting organisation.
