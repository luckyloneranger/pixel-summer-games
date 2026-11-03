# Pixel Summer Games

A retro 8-bit track-and-field game for the browser. Hammer two keys to sprint, then time a third to jump, throw or clear a hurdle. Five events, a championship with qualifying marks, practice, two-player Versus, chiptune sound and on-screen controls for phones.

**Play:** https://luckyloneranger.github.io/pixel-summer-games/ (once GitHub Pages is switched on, see [Deploying](#deploying)).

Everything (pixel art, font, music and sound effects) is original and generated in code. There are no image or audio files, no accounts, no tracking and no server.

## Events

| Event | How to play |
| --- | --- |
| 100 m dash | Wait for GO, then alternate A and D as fast as you can. Two false starts and you're out. |
| Long jump | Sprint, hold W to raise the angle, let go before the red line. About 45° is best; letting go on the white board is a perfect take-off. Three jumps, best counts. |
| High jump | Run up, hold W to set a steep angle (about 60–70°), let go just before the line. Clear the bar to raise it; three misses in a row and you're out. |
| Javelin | Same run-up and angle, but you throw. Three throws, best counts. |
| 110 m hurdles | Run with A and D, tap W to jump each hurdle (about 1 m before it at full speed). Hitting one costs speed. |

## Modes

- **Championship**, 1 or 2 players: all five events in order (100 m, long jump, high jump, javelin, hurdles). Miss a qualifying mark and you're out (Options → Casual mode lets you carry on with 0 points). Ends on the podium and the high-score table.
- **Practice**: any event, with your personal best shown.
- **Versus**, 2 players: all five events or just one; the higher total wins.
- **How to Play**: a short guide to each event.

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

**Phones and tablets** (held sideways): on-screen run pads, an ACTION button, pause and sound icons, and arrow / OK / BACK buttons in menus.

**Options:** Casual mode, Assist run (hold a run key to run at 80% speed), Reduce flashing (no blinking text and no screen shake), volumes and mute. Settings, high scores and personal bests are saved in your browser.

## Running it yourself

You need [Node.js](https://nodejs.org) (current LTS).

```bash
npm install      # one-time: downloads the build tools
npm run dev      # local server; open the http://localhost:5173 link it prints
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Browser smoke test (Playwright): title → 100 m → results |
| `npm run build` | Builds the static site into `dist/` |
| `npm run preview` | Serves the built `dist/` locally |

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

The game is a static site. GitHub Actions builds it and publishes it to GitHub Pages on every push to `main` (`.github/workflows/deploy.yml`). One-time setup: **Settings → Pages → Source: GitHub Actions**. A second workflow (`.github/workflows/test.yml`) runs the unit tests and the smoke test in Chromium, Firefox and WebKit.

## Originality

All characters, art, music, sounds and names are original. The game is inspired by 1980s arcade athletics games but copies nothing from them, and it is not affiliated with any sporting organisation.
