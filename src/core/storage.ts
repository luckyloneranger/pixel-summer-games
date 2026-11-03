import type { Difficulty } from '../events/event';
import type { TeamKit } from '../gfx/sprites/athlete';
import type { HighScore, PersonalBests } from '../game/records';

/** Everything the game remembers between visits. */
export interface SaveData {
  version: 1;
  settings: {
    initials: string;
    team: TeamKit;
    difficulty: Difficulty;
    casual: boolean;
  };
  highScores: { championship: HighScore[] };
  personalBests: PersonalBests;
}

/** Versioned key, so a future format change can't misread old saves. */
export const STORAGE_KEY = 'psg:v1';

export function defaultSave(): SaveData {
  return {
    version: 1,
    settings: { initials: 'AAA', team: 'red', difficulty: 'normal', casual: false },
    highScores: { championship: [] },
    personalBests: {},
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
        highScores: { championship: parsed.highScores?.championship ?? [] },
        personalBests: { ...parsed.personalBests },
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
