import { describe, expect, it } from 'vitest';
import { SceneManager, type Scene } from '../src/core/scene-manager';
import type { Renderer } from '../src/core/renderer';
import type { InputSnapshot } from '../src/core/input';

function fakeScene(name: string, log: string[], isOverlay = false): Scene {
  return {
    name,
    isOverlay,
    enter: () => log.push(`enter ${name}`),
    exit: () => log.push(`exit ${name}`),
    update: () => log.push(`update ${name}`),
    render: () => log.push(`render ${name}`),
  };
}

const r = {} as Renderer;
const input = {} as InputSnapshot;

describe('SceneManager', () => {
  it('push, pop and replace call enter and exit', () => {
    const log: string[] = [];
    const sm = new SceneManager();
    sm.push(fakeScene('A', log));
    sm.push(fakeScene('B', log));
    sm.replace(fakeScene('C', log));
    sm.pop();
    expect(log).toEqual(['enter A', 'enter B', 'exit B', 'enter C', 'exit C']);
    expect(sm.top?.name).toBe('A');
  });

  it('updates only the top scene', () => {
    const log: string[] = [];
    const sm = new SceneManager();
    sm.push(fakeScene('A', log));
    sm.push(fakeScene('B', log));
    log.length = 0;
    sm.update(1 / 60, input);
    expect(log).toEqual(['update B']);
  });

  it('draws the scene under an overlay first', () => {
    const log: string[] = [];
    const sm = new SceneManager();
    sm.push(fakeScene('Menu', log));
    sm.push(fakeScene('Event', log));
    sm.push(fakeScene('Pause', log, true));
    log.length = 0;
    sm.render(r);
    expect(log).toEqual(['render Event', 'render Pause']);
  });

  it('does nothing when empty', () => {
    const sm = new SceneManager();
    expect(sm.pop()).toBeUndefined();
    expect(() => sm.update(1 / 60, input)).not.toThrow();
    expect(() => sm.render(r)).not.toThrow();
  });
});
