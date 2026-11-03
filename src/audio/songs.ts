// Three original chiptune loops, written as note lists.
// Each token is NOTE:LENGTH, with LENGTH in 16th notes. "-" is a rest.
// Drums: k = kick, s = snare, h = hi-hat. Every channel of a song must add
// up to the same length so they loop together (a test checks this).

export interface Song {
  tempo: number; // beats per minute (a beat = 4 sixteenths)
  lead: string; // square, 25% pulse
  harmony: string; // square, 12.5% pulse, quieter
  bass: string; // triangle
  drums: string; // noise
}

export type SongName = 'title' | 'menu' | 'podium';

export const SONGS: Record<SongName, Song> = {
  // Bright and bouncy: "PRESS START".
  title: {
    tempo: 140,
    lead:
      'C5:2 E5:2 G5:2 C6:2 B5:2 G5:2 E5:4 ' +
      'F5:2 A5:2 C6:2 A5:2 G5:4 -:2 E5:2 ' +
      'D5:2 F5:2 A5:2 D6:2 C6:2 A5:2 F5:4 ' +
      'G5:2 F5:2 E5:2 D5:2 C5:6 -:2',
    harmony: 'E4:8 G4:8 F4:8 A4:8 F4:8 A4:8 D4:8 G4:8',
    bass:
      'C3:4 G3:4 C3:4 G3:4 F3:4 C4:4 F3:4 C4:4 ' +
      'D3:4 A3:4 D3:4 A3:4 G3:4 D3:4 G3:4 B2:4',
    drums: 'k:2 h:2 s:2 h:2 k:2 k:2 s:2 h:2 '.repeat(4).trim(),
  },
  // Relaxed: menus, setup, intro cards and results.
  menu: {
    tempo: 112,
    lead:
      'E5:4 G5:2 A5:2 G5:4 E5:4 ' +
      'D5:4 E5:2 G5:2 E5:8 ' +
      'C5:4 D5:2 E5:2 G5:4 A5:4 ' +
      'G5:4 E5:2 D5:2 C5:8',
    harmony: 'C4:16 B3:16 A3:16 G3:16',
    bass: 'A2:8 E3:8 G2:8 D3:8 F2:8 C3:8 G2:8 G2:8',
    drums: 'k:4 h:4 s:4 h:4 '.repeat(4).trim(),
  },
  // Triumphant: the podium ceremony.
  podium: {
    tempo: 110,
    lead:
      'G4:2 C5:2 E5:2 G5:6 E5:2 G5:2 ' +
      'A5:4 G5:2 F5:2 E5:4 D5:4 ' +
      'C5:2 E5:2 G5:2 C6:6 B5:2 A5:2 ' +
      'G5:4 E5:2 D5:2 C5:8',
    harmony: 'E4:8 G4:8 F4:8 D4:8 E4:8 A4:8 D4:8 E4:8',
    bass: 'C3:4 G2:4 C3:4 G2:4 F2:4 C3:4 G2:4 G2:4 C3:4 E3:4 F3:4 F#3:4 G3:4 G2:4 C3:8',
    drums: 'k:4 s:4 k:4 s:4 k:4 s:4 k:4 s:4 k:4 s:4 k:4 s:4 k:4 s:2 s:2 k:2 s:2 s:2 s:2',
  },
};
