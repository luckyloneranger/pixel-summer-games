import { Game } from './core/game';

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing <canvas id="screen">');
const game = new Game(canvas);
game.start();

// Read-only status for the automated browser test (tests/e2e/smoke.spec.ts).
(window as unknown as { __psg: object }).__psg = {
  get scene() {
    return game.scenes.top?.name ?? '';
  },
  get state() {
    return game.scenes.top?.debugLines?.()[0] ?? '';
  },
};
