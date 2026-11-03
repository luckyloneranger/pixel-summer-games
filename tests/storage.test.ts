import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, SaveStore, type StorageBackend } from '../src/core/storage';
import { SceneManager, type Scene } from '../src/core/scene-manager';
import { cpuLineup } from '../src/events/cpu';
import { TEAM_KITS } from '../src/gfx/sprites/athlete';

function fakeStorage(): StorageBackend & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return { items, getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v) };
}

describe('SaveStore', () => {
  it('saves under the versioned key and loads it back (like a page reload)', () => {
    const backend = fakeStorage();
    const a = new SaveStore(backend);
    a.data.highScores.championship.push({ initials: 'ZED', score: 4321, difficulty: 'hard' });
    a.data.settings.casual = true;
    a.save();
    expect(backend.items.has(STORAGE_KEY)).toBe(true);
    const b = new SaveStore(backend);
    expect(b.data.highScores.championship[0].score).toBe(4321);
    expect(b.data.settings.casual).toBe(true);
  });

  it('falls back to memory when storage is blocked', () => {
    const blocked: StorageBackend = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const s = new SaveStore(blocked);
    expect(s.persistent).toBe(false);
    s.data.settings.initials = 'MEM';
    expect(() => s.save()).not.toThrow();
    expect(s.data.settings.initials).toBe('MEM');
  });

  it('works with no storage at all', () => {
    const s = new SaveStore(null);
    expect(s.persistent).toBe(false);
    expect(s.data.settings.difficulty).toBe('normal');
  });

  it('ignores broken or old-format saves', () => {
    const backend = fakeStorage();
    backend.items.set(STORAGE_KEY, '{not json');
    expect(new SaveStore(backend).data.highScores.championship).toEqual([]);
    backend.items.set(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(new SaveStore(backend).data.settings.initials).toBe('AAA');
  });
});

describe('SceneManager.popTo', () => {
  const scene = (name: string): Scene => ({ name, update: () => {}, render: () => {} });
  it('drops back to the named scene', () => {
    const sm = new SceneManager();
    for (const n of ['TITLE', 'MENU', 'INTRO', 'EVENT', 'PAUSE']) sm.push(scene(n));
    sm.popTo('MENU');
    expect(sm.top?.name).toBe('MENU');
    sm.popTo('TITLE');
    expect(sm.size).toBe(1);
  });
});

describe('CPU line-up', () => {
  it('never wears the player team colour', () => {
    for (const team of Object.keys(TEAM_KITS) as (keyof typeof TEAM_KITS)[]) {
      for (const cpu of cpuLineup(team)) expect(cpu.look.shirt).not.toBe(TEAM_KITS[team].shirt);
    }
  });
});
