import { describe, expect, it } from 'vitest';
import { noteFrequency, parseChannel } from '../src/audio/music';
import { playSfx } from '../src/audio/sfx';
import { SONGS } from '../src/audio/songs';
import { AudioEngine, effectiveGains } from '../src/audio/synth';
import { AUDIO } from '../src/game/tuning';

describe('notes', () => {
  it('A4 is 440 Hz and octaves double', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440);
    expect(noteFrequency('A5')).toBeCloseTo(880);
    expect(noteFrequency('C4')).toBeCloseTo(261.63, 1);
  });
  it('sharps and flats agree; rests and junk give null', () => {
    expect(noteFrequency('C#5')).toBeCloseTo(noteFrequency('Db5')!);
    expect(noteFrequency('-')).toBeNull();
    expect(noteFrequency('H2')).toBeNull();
  });
});

describe('songs', () => {
  for (const [name, song] of Object.entries(SONGS)) {
    it(`${name}: every note is valid and all channels loop together`, () => {
      const lengths = (['lead', 'harmony', 'bass', 'drums'] as const).map((ch) => {
        const { events, length } = parseChannel(song[ch]);
        for (const e of events) {
          if (ch === 'drums') expect(['k', 's', 'h', '-']).toContain(e.token);
          else if (e.token !== '-') expect(noteFrequency(e.token)).not.toBeNull();
        }
        return length;
      });
      expect(new Set(lengths).size).toBe(1);
    });
  }

  it('rejects a malformed token', () => {
    expect(() => parseChannel('C4:2 E4')).toThrow();
  });
});

describe('volume', () => {
  it('mute silences everything', () => {
    expect(effectiveGains({ master: 10, music: 10, sfx: 10, muted: true }).master).toBe(0);
  });
  it('scales each bus 0-10, master with headroom', () => {
    const g = effectiveGains({ master: 10, music: 5, sfx: 0, muted: false });
    expect(g.master).toBeCloseTo(AUDIO.HEADROOM);
    expect(g.music).toBeCloseTo(0.5);
    expect(g.sfx).toBe(0);
  });
});

describe('nothing plays before the first input', () => {
  it('does not create audio until unlock()', () => {
    let created = 0;
    const engine = new AudioEngine({ master: 8, music: 6, sfx: 8, muted: false }, () => {
      created++;
      return null; // pretend this browser has no Web Audio
    });
    playSfx(engine, 'pistol');
    engine.setCrowd(1);
    expect(created).toBe(0);
    expect(engine.unlocked).toBe(false);
    engine.unlock();
    expect(created).toBe(1);
    // No Web Audio available: everything stays silent without errors.
    expect(() => playSfx(engine, 'cheer', 1)).not.toThrow();
    expect(engine.tone({ wave: 'square', freq: 440, duration: 0.1, volume: 0.5 })).toBeNull();
  });
});
