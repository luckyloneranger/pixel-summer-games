import { AUDIO } from '../game/tuning';

/** Volume settings as saved: each 0-10, plus mute. */
export interface Volumes {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

/** The actual gain for each bus (pure, so it can be tested). */
export function effectiveGains(v: Volumes): { master: number; music: number; sfx: number } {
  const step = (n: number) => Math.min(1, Math.max(0, n / AUDIO.VOLUME_STEPS));
  return {
    master: v.muted ? 0 : step(v.master) * AUDIO.HEADROOM,
    music: step(v.music),
    sfx: step(v.sfx),
  };
}

export type Wave = 'square' | 'square25' | 'square12' | 'triangle';
export type Bus = 'sfx' | 'music';

export interface ToneOptions {
  wave: Wave;
  freq: number; // Hz
  to?: number; // Hz to slide to by the end
  duration: number; // s
  volume: number; // 0-1
  when?: number; // s from now
  bus?: Bus;
}

export interface NoiseOptions {
  duration: number; // s
  volume: number; // 0-1
  filter: BiquadFilterType;
  freq: number; // Hz, filter frequency
  to?: number; // Hz, filter sweep target
  attack?: number; // s, fade-in time (default: instant)
  when?: number; // s from now
  bus?: Bus;
}

/**
 * A tiny 8-bit style synthesiser on the Web Audio API: square and triangle
 * tones and filtered noise, routed through music and effects volume buses.
 * Nothing is created until unlock() is called from a key press or tap,
 * because browsers block sound before the player interacts.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<Bus, GainNode>;
  private noiseBuffer!: AudioBuffer;
  private readonly pulseWaves = new Map<number, PeriodicWave>();
  private crowdGain: GainNode | null = null;
  private crowdTarget = -1;
  private volumes: Volumes;

  constructor(
    volumes: Volumes,
    private readonly createContext: () => AudioContext | null = browserAudioContext,
  ) {
    this.volumes = { ...volumes };
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Current audio clock in seconds (0 before unlock). */
  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Call from a user gesture. Creates (or resumes) audio the first time. */
  unlock(): void {
    if (!this.ctx) {
      const ctx = this.createContext();
      if (!ctx) return; // no Web Audio in this browser: stay silent
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.buses = { sfx: ctx.createGain(), music: ctx.createGain() };
      this.buses.sfx.connect(this.master);
      this.buses.music.connect(this.master);
      this.noiseBuffer = makeNoise(ctx);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const g = effectiveGains(this.volumes);
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(g.master, t, 0.02);
    this.buses.music.gain.setTargetAtTime(g.music, t, 0.02);
    this.buses.sfx.gain.setTargetAtTime(g.sfx, t, 0.02);
  }

  /** Play a tone. Returns the oscillator (so music can stop it) or null if silent. */
  tone(o: ToneOptions): OscillatorNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const t = ctx.currentTime + (o.when ?? 0);
    const osc = ctx.createOscillator();
    if (o.wave === 'triangle') osc.type = 'triangle';
    else if (o.wave === 'square') osc.type = 'square';
    else osc.setPeriodicWave(this.pulse(o.wave === 'square25' ? 0.25 : 0.125));
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.duration);
    const gain = ctx.createGain();
    envelope(gain, t, o.volume, 0.004, o.duration);
    osc.connect(gain).connect(this.buses[o.bus ?? 'sfx']);
    osc.start(t);
    osc.stop(t + o.duration + 0.02);
    return osc;
  }

  /** Play a burst of filtered noise. Returns the source or null if silent. */
  noise(o: NoiseOptions): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const t = ctx.currentTime + (o.when ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter;
    filter.frequency.setValueAtTime(o.freq, t);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + o.duration);
    const gain = ctx.createGain();
    envelope(gain, t, o.volume, o.attack ?? 0.002, o.duration);
    src.connect(filter).connect(gain).connect(this.buses[o.bus ?? 'sfx']);
    src.start(t, Math.random()); // random offset so repeats don't sound identical
    src.stop(t + o.duration + 0.02);
    return src;
  }

  /** Set the background crowd noise level (0-1). It eases towards the target. */
  setCrowd(level: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.crowdGain) {
      // A looped band of noise sounds like a distant crowd.
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 900;
      band.Q.value = 0.7;
      this.crowdGain = ctx.createGain();
      this.crowdGain.gain.value = 0;
      src.connect(band).connect(this.crowdGain).connect(this.buses.sfx);
      src.start();
    }
    const target = Math.min(1, Math.max(0, level)) * AUDIO.CROWD_MAX_GAIN;
    // Only send a change when the level really moves, so automation doesn't pile up.
    if (Math.abs(target - this.crowdTarget) < 0.005) return;
    this.crowdTarget = target;
    this.crowdGain.gain.setTargetAtTime(target, ctx.currentTime, AUDIO.CROWD_RESPONSE);
  }

  /** Thin pulse waves (25%, 12.5%) give the classic 8-bit lead sound. */
  private pulse(duty: number): PeriodicWave {
    let wave = this.pulseWaves.get(duty);
    if (!wave) {
      const n = 32;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      wave = this.ctx!.createPeriodicWave(real, imag);
      this.pulseWaves.set(duty, wave);
    }
    return wave;
  }
}

/** Quick attack to `volume`, then fade to silence by the end. */
function envelope(gain: GainNode, t: number, volume: number, attack: number, duration: number): void {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(volume, t + Math.min(attack, duration * 0.9));
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
}

/** One second of white noise, looped by noise voices. */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function browserAudioContext(): AudioContext | null {
  try {
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
}
