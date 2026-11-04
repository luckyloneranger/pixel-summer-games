// Three original chiptune loops, written as note lists (the title tune was
// rewritten in Phase 16).
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
  // Upbeat and a little cheeky: "PRESS START" (A minor, landing on C major).
  title: {
    tempo: 150,
    lead:
      'A4:2 C5:2 E5:2 A5:3 G5:1 E5:2 C5:2 D5:2 ' +
      'E5:3 D5:1 C5:2 B4:2 C5:4 -:2 E5:2 ' +
      'F5:2 A5:2 C6:2 B5:2 A5:2 G5:2 F5:2 E5:2 ' +
      'D5:2 E5:2 G5:2 B5:2 C6:6 -:2',
    harmony: 'C4:8 E4:8 E4:8 C4:8 F4:8 A4:8 G4:8 G4:8',
    bass:
      'A2:2 A3:2 A2:2 A3:2 A2:2 A3:2 G2:2 G3:2 ' +
      'A2:2 A3:2 A2:2 A3:2 E2:2 E3:2 E2:2 E3:2 ' +
      'F2:2 F3:2 F2:2 F3:2 F2:2 F3:2 A2:2 A3:2 ' +
      'G2:2 G3:2 G2:2 G3:2 C3:4 G2:4',
    drums: 'k:2 h:2 s:2 h:1 k:1 k:2 h:2 s:2 h:2 '.repeat(4).trim(),
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
