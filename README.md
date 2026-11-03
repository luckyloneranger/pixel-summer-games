# Pixel Summer Games

A retro 8-bit track-and-field game for the browser. Alternate two keys to run, time a third to jump or throw. Built with TypeScript, Vite and plain HTML5 Canvas — no game engine, no image or sound files.

The full design is in [`SPEC.md`](SPEC.md); build progress is in [`PROGRESS.md`](PROGRESS.md).

## Run it

You need [Node.js](https://nodejs.org) (current LTS) installed.

```bash
npm install      # one-time: downloads the build tools into node_modules/
npm run dev      # starts a local server; open the http://localhost:5173 link it prints
```

Other commands:

```bash
npm test         # runs the unit tests
npm run build    # makes the deployable static site in dist/
npm run preview  # serves the built dist/ folder locally
```

## Controls (so far)

| Key | Does |
| --- | --- |
| Enter | Start / confirm |
| ↑ ↓ ← → | Menu: move, change difficulty |
| Esc or P | Back |
| A then D (or ← then →) | Run: alternate the two keys |
| ` (backtick) | Toggle the debug overlay (or add `?debug=1` to the URL) |
| [ and ] | Slow down / speed up the game (debug overlay open) |

Add `?seed=1234` to the URL to replay the same random sequence.

## Tuning

Every gameplay number lives in `src/game/tuning.ts`.
