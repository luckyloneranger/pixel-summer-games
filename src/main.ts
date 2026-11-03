import { Game } from './core/game';

const canvas = document.getElementById('screen');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing <canvas id="screen">');
new Game(canvas).start();
