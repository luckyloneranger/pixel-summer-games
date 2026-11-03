import { AUDIO } from '../game/tuning';
import type { AudioEngine } from './synth';

/** Every sound effect in the game. */
export type SoundName =
  | 'menuMove'
  | 'menuSelect'
  | 'menuBack'
  | 'pistol'
  | 'buzzer'
  | 'footstep'
  | 'jump'
  | 'whoosh'
  | 'sand'
  | 'thud'
  | 'clank'
  | 'cheer'
  | 'medal'
  | 'newRecord';

/**
 * Play a sound effect. `param` is 0-1 where a sound uses it
 * (footstep: speed, cheer: how big).
 */
export function playSfx(a: AudioEngine, name: SoundName, param = 0): void {
  switch (name) {
    case 'menuMove':
      a.tone({ wave: 'square25', freq: 660, duration: 0.05, volume: 0.25 });
      return;
    case 'menuSelect':
      a.tone({ wave: 'square25', freq: 660, duration: 0.06, volume: 0.25 });
      a.tone({ wave: 'square25', freq: 990, duration: 0.09, volume: 0.25, when: 0.06 });
      return;
    case 'menuBack':
      a.tone({ wave: 'square25', freq: 520, to: 330, duration: 0.1, volume: 0.22 });
      return;
    case 'pistol':
      // Sharp crack plus a short boom.
      a.noise({ duration: 0.25, volume: 0.9, filter: 'highpass', freq: 1200 });
      a.noise({ duration: 0.4, volume: 0.6, filter: 'lowpass', freq: 600, to: 120 });
      return;
    case 'buzzer':
      a.tone({ wave: 'square', freq: 110, duration: 0.6, volume: 0.35 });
      a.tone({ wave: 'square', freq: 116, duration: 0.6, volume: 0.25 });
      return;
    case 'footstep': {
      const pitch = AUDIO.FOOTSTEP_PITCH_LOW + (AUDIO.FOOTSTEP_PITCH_HIGH - AUDIO.FOOTSTEP_PITCH_LOW) * param;
      a.tone({ wave: 'triangle', freq: pitch, to: pitch * 0.6, duration: 0.06, volume: 0.5 });
      a.noise({ duration: 0.04, volume: 0.15, filter: 'highpass', freq: 3000 });
      return;
    }
    case 'jump':
      a.tone({ wave: 'square25', freq: 300, to: 900, duration: 0.18, volume: 0.3 });
      return;
    case 'whoosh':
      a.noise({ duration: 0.5, volume: 0.45, filter: 'bandpass', freq: 400, to: 3000, attack: 0.08 });
      return;
    case 'sand':
      a.noise({ duration: 0.35, volume: 0.6, filter: 'lowpass', freq: 1500, to: 300 });
      return;
    case 'thud':
      a.tone({ wave: 'triangle', freq: 140, to: 60, duration: 0.15, volume: 0.6 });
      a.noise({ duration: 0.1, volume: 0.3, filter: 'lowpass', freq: 800 });
      return;
    case 'clank':
      // Two clashing metallic tones plus a rattle.
      a.tone({ wave: 'square12', freq: 1400, to: 900, duration: 0.2, volume: 0.3 });
      a.tone({ wave: 'square12', freq: 1950, to: 1300, duration: 0.15, volume: 0.2 });
      a.noise({ duration: 0.2, volume: 0.35, filter: 'bandpass', freq: 2500 });
      return;
    case 'cheer':
      // A swelling roar on top of the crowd.
      a.noise({ duration: 1.6 + param, volume: 0.25 + 0.35 * param, filter: 'bandpass', freq: 1100, attack: 0.4 });
      return;
    case 'medal':
      arpeggio(a, [523, 659, 784, 1047], 0.1, 0.35);
      a.tone({ wave: 'triangle', freq: 262, duration: 0.6, volume: 0.4 });
      return;
    case 'newRecord':
      for (let r = 0; r < 2; r++) arpeggio(a, [784, 988, 1175, 1568], 0.06, 0.25, r * 0.28);
      return;
  }
}

function arpeggio(a: AudioEngine, notes: number[], step: number, last: number, start = 0): void {
  notes.forEach((freq, i) => {
    const isLast = i === notes.length - 1;
    a.tone({ wave: 'square25', freq, duration: isLast ? last : step, volume: 0.28, when: start + i * step });
  });
}
