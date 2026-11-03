import { AUDIO } from '../game/tuning';
import { SONGS, type Song, type SongName } from './songs';
import type { AudioEngine } from './synth';

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "A4" -> 440 Hz, "C#5" / "Db5" both work. Returns null for rests and bad names. */
export function noteFrequency(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const semitone = NOTE_INDEX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface NoteEvent {
  start: number; // in 16ths from the start of the loop
  length: number; // in 16ths
  token: string; // note name, drum letter or "-"
}

/** Parse a channel string into timed events (throws on a malformed token). */
export function parseChannel(text: string): { events: NoteEvent[]; length: number } {
  const events: NoteEvent[] = [];
  let at = 0;
  for (const token of text.trim().split(/\s+/)) {
    const [name, len] = token.split(':');
    const length = Number(len);
    if (!name || !Number.isInteger(length) || length <= 0) throw new Error(`Bad note "${token}"`);
    events.push({ start: at, length, token: name });
    at += length;
  }
  return { events, length: at };
}

type Channel = 'lead' | 'harmony' | 'bass' | 'drums';
const CHANNELS: Channel[] = ['lead', 'harmony', 'bass', 'drums'];

/** Loops one song at a time, scheduling a whole loop just before it's needed. */
export class MusicPlayer {
  private current: SongName | null = null;
  private loopStart = 0; // audio time the scheduled loop starts
  private loopSeconds = 0;
  // Notes of the previous and current loop, so a song change can stop them all.
  private previousLoop: AudioScheduledSourceNode[] = [];
  private scheduled: AudioScheduledSourceNode[] = [];

  constructor(private readonly audio: AudioEngine) {}

  /** Switch to a song (or null for silence). Calling again with the same song does nothing. */
  play(name: SongName | null): void {
    if (name === this.current) return;
    this.stopAll();
    this.current = name;
    this.loopSeconds = 0;
  }

  /** Call every frame: queues the next loop shortly before the current one ends. */
  tick(): void {
    if (!this.current || !this.audio.unlocked) return;
    const now = this.audio.now;
    if (this.loopSeconds === 0) {
      this.loopStart = now + 0.05;
      this.schedule(SONGS[this.current], this.loopStart);
    } else if (now + AUDIO.LOOKAHEAD >= this.loopStart + this.loopSeconds) {
      this.loopStart += this.loopSeconds;
      this.previousLoop = this.scheduled; // older loops have finished playing
      this.scheduled = [];
      this.schedule(SONGS[this.current], this.loopStart);
    }
  }

  private schedule(song: Song, start: number): void {
    const sixteenth = 60 / song.tempo / 4;
    const offset = start - this.audio.now;
    for (const channel of CHANNELS) {
      const { events, length } = parseChannel(song[channel]);
      this.loopSeconds = length * sixteenth;
      for (const e of events) {
        const when = offset + e.start * sixteenth;
        const duration = e.length * sixteenth;
        const node = playNote(this.audio, channel, e.token, when, duration);
        if (node) this.scheduled.push(node);
      }
    }
  }

  private stopAll(): void {
    for (const n of [...this.previousLoop, ...this.scheduled]) {
      try {
        n.stop();
      } catch {
        // already stopped
      }
    }
    this.previousLoop = [];
    this.scheduled = [];
  }
}

function playNote(a: AudioEngine, channel: Channel, token: string, when: number, duration: number): AudioScheduledSourceNode | null {
  if (token === '-') return null;
  if (channel === 'drums') {
    if (token === 'k') return a.tone({ wave: 'triangle', freq: 120, to: 40, duration: 0.12, volume: 0.6, when, bus: 'music' });
    if (token === 's') return a.noise({ duration: 0.1, volume: 0.25, filter: 'bandpass', freq: 1800, when, bus: 'music' });
    return a.noise({ duration: 0.03, volume: 0.12, filter: 'highpass', freq: 7000, when, bus: 'music' });
  }
  const freq = noteFrequency(token);
  if (freq === null) return null;
  const gap = Math.min(0.03, duration * 0.2); // short gap so repeated notes are distinct
  const settings = {
    lead: { wave: 'square25' as const, volume: 0.22 },
    harmony: { wave: 'square12' as const, volume: 0.1 },
    bass: { wave: 'triangle' as const, volume: 0.45 },
  }[channel];
  return a.tone({ ...settings, freq, duration: duration - gap, when, bus: 'music' });
}
