import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Rng } from '../core/rng';
import type { TeamKit } from '../gfx/sprites/athlete';
import type { GameMessage } from '../net/protocol';
import type { Prompts } from '../ui/prompts';

export type EventId = 'dash100' | 'longJump' | 'highJump' | 'javelin' | 'hurdles110' | 'tripleJump' | 'poleVault' | 'hammer' | 'swim50';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface PlayerInfo {
  initials: string;
  team?: TeamKit; // kit colour, red if not given
  /** 0 for player 1, 1 for player 2 (defaults to the position in the list). */
  index?: number;
}

/** Sounds an event can ask for. The event only names them; audio plays them. */
export type SoundCue = 'pistol' | 'buzzer' | 'footstep' | 'jump' | 'whoosh' | 'sand' | 'thud' | 'clank' | 'cheer';

/** Where events send sound cues. `param` is 0-1 (footstep: speed, cheer: size). */
export interface SoundSink {
  play(cue: SoundCue, param?: number): void;
}

/** A sink that ignores everything (tests, and before audio is ready). */
export const SILENT: SoundSink = { play: () => {} };

/**
 * Online play: the link to the other player's game (see src/net). The host
 * runs anything that must be decided once (like the race start); the guest
 * follows. Each device runs its own player's athlete.
 */
export interface NetLink {
  /** Player index of the human on this device. */
  localIndex: number;
  isHost: boolean;
  send(m: GameMessage): void;
  take<K extends GameMessage['k']>(...kinds: K[]): Extract<GameMessage, { k: K }>[];
}

/** Screen effects an event can ask for (the game may skip them, e.g. reduce shake). */
export interface EffectsSink {
  shake(pixels: number): void;
  /** A big jump or throw: a moment of slow motion and zoom (the game decides if it can). */
  highlight(): void;
  /** Reduce flashing is on: skip camera flashes and the like. */
  readonly calm: boolean;
}

export const NO_EFFECTS: EffectsSink = { shake: () => {}, highlight: () => {}, calm: true };

/** What an event needs to start. */
export interface EventContext {
  players: PlayerInfo[];
  difficulty: Difficulty;
  rng: Rng;
  /** Practice or Versus: no qualifying mark is shown. */
  practice?: boolean;
  /** Assist run: holding a run key builds speed up to 80%. */
  assist?: boolean;
  /** Where sound cues go (silent if not given). */
  sound?: SoundSink;
  /** Where screen effects go (none if not given). */
  effects?: EffectsSink;
  /** Online play: the link to the other player (local play if not given). */
  net?: NetLink;
  /** Races: positions of your best run to race against (see game/ghost.ts). */
  ghost?: readonly number[];
  /** Words for the controls (keyboard words if not given). */
  prompts?: Prompts;
}

/** One player's outcome of an event. */
export interface EventResult {
  /** 0 or 1 for humans, -1 for CPU athletes. */
  playerIndex: number;
  name: string;
  /** Races only: lane number, 1 = top lane. */
  lane?: number;
  /** Time in s (races) or distance in m (field events); null = no mark. */
  mark: number | null;
  foul: boolean;
  disqualified: boolean;
  /** Filled in by scoring in Phase 6; 0 until then. */
  points: number;
  /** Field events only: each attempt's mark in m, null = foul. */
  attempts?: (number | null)[];
  /** Races only: seconds from GO to the first valid tap. */
  reactionTime?: number;
  /** Races only: stopped before the line (no mark). */
  dnf?: boolean;
}

/** Every event implements this, so the championship code treats them all the same. */
export interface AthleticsEvent {
  id: EventId;
  name: string;
  kind: 'race' | 'field';
  attempts: number; // 1 for races, 3 for field events
  init(ctx: EventContext): void;
  update(dt: number, input: InputSnapshot): void; // logic only, no drawing
  render(r: Renderer): void; // drawing only, no logic
  isFinished(): boolean;
  getResults(): EventResult[];
  /** Extra lines for the debug overlay. */
  debugLines?(): string[];
  /** Races: this run as a ghost to save, if the one human finished it (else null). */
  ghostRun?(): number[] | null;
  /** Field events: is there a best attempt worth an instant replay? */
  hasReplay?(): boolean;
  /** Draw the replay `t` s in (slow motion); false once it has finished. */
  renderReplay?(r: Renderer, t: number): boolean;
  /** How loud the crowd should be right now, 0-1. */
  crowdLevel?(): number;
}
