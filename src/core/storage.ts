import type { Difficulty, EventId } from '../events/event';
import type { TeamKit } from '../gfx/sprites/athlete';
import type { HighScore, PersonalBests } from '../game/records';
import { AUDIO } from '../game/tuning';
import type { Controls } from './keymap';

/** Everything the game remembers between visits. */
export interface SaveData {
  version: 1;
  settings: {
    initials: string;
    team: TeamKit;
    players: number; // 1 or 2 for the championship
    p2Initials: string;
    p2Team: TeamKit;
    versusEvent: EventId | 'all';
    difficulty: Difficulty;
    casual: boolean;
    master: number; // 0-10
    music: number; // 0-10
    sfx: number; // 0-10
    muted: boolean;
    reduceFlashing: boolean;
    /** Retro TV look: scanlines and darker corners (off by default). */
    crt: boolean;
    /** Race your best run's ghost (offline, one player). */
    ghost: boolean;
    assist: boolean;
    /** Remapped gameplay keys, or null for the defaults. */
    controls: Controls | null;
  };
  highScores: { championship: HighScore[]; versus: HighScore[] };
  personalBests: PersonalBests;
  /** Each race's best run, for the ghost runner (positions, see game/ghost.ts). */
  ghosts: Partial<Record<EventId, number[]>>;
}

/** Versioned key, so a future format change can't misread old saves. */
export const STORAGE_KEY = 'psg:v1';

export function defaultSave(): SaveData {
  return {
    version: 1,
    settings: {
      initials: 'AAA',
      team: 'red',
      players: 1,
      p2Initials: 'BBB',
      p2Team: 'blue',
      versusEvent: 'all',
      difficulty: 'normal',
      casual: false,
      master: AUDIO.DEFAULT_MASTER,
      music: AUDIO.DEFAULT_MUSIC,
      sfx: AUDIO.DEFAULT_SFX,
      muted: false,
      reduceFlashing: false,
      crt: false,
      ghost: true,
      assist: false,
      controls: null,
    },
    highScores: { championship: [], versus: [] },
    personalBests: {},
    ghosts: {},
  };
}

/** The bits of window.localStorage we use (so tests can pass a fake). */
export type StorageBackend = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/**
 * Saves to the browser's localStorage. If storage is blocked (private mode,
 * disabled cookies) it quietly keeps everything in memory for this visit.
 */
export class SaveStore {
  data: SaveData;
  /** False when saving to the browser isn't possible. */
  persistent: boolean;

  constructor(private backend: StorageBackend | null = browserStorage()) {
    this.persistent = backend !== null;
    this.data = this.load();
  }

  private load(): SaveData {
    const fresh = defaultSave();
    if (!this.backend) return fresh;
    try {
      const raw = this.backend.getItem(STORAGE_KEY);
      if (!raw) return fresh;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.version !== 1) return fresh;
      // Merge over the defaults so a missing field can't break the game.
      return {
        version: 1,
        settings: { ...fresh.settings, ...parsed.settings },
        highScores: {
          championship: parsed.highScores?.championship ?? [],
          versus: parsed.highScores?.versus ?? [],
        },
        personalBests: { ...parsed.personalBests },
        ghosts: { ...parsed.ghosts },
      };
    } catch {
      this.fallBackToMemory();
      return fresh;
    }
  }

  save(): void {
    if (!this.backend) return;
    try {
      this.backend.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      this.fallBackToMemory();
    }
  }

  private fallBackToMemory(): void {
    this.backend = null;
    this.persistent = false;
  }
}

/** localStorage if the browser lets us use it, otherwise null. */
function browserStorage(): StorageBackend | null {
  try {
    const s = globalThis.localStorage;
    if (!s) return null;
    const probe = `${STORAGE_KEY}:probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
