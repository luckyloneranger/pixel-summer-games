import type { InputSnapshot } from './input';
import type { Renderer } from './renderer';
import type { SongName } from '../audio/songs';

/** One screen of the game: title, menu, an event, the pause overlay... */
export interface Scene {
  /** Short name shown in the debug overlay. */
  readonly name: string;
  /** True for overlays (like Pause) that draw on top of the scene below. */
  readonly isOverlay?: boolean;
  /** Menu-style screens get blips for moving and confirming. */
  readonly isMenu?: boolean;
  /** Background music for this screen (null = none). Overlays keep the music below. */
  readonly music?: SongName | null;
  /** How loud the crowd should be (events only), 0-1. */
  crowdLevel?(): number;
  enter?(): void;
  exit?(): void;
  update(dt: number, input: InputSnapshot): void;
  render(r: Renderer): void;
  /** Extra lines for the debug overlay. */
  debugLines?(): string[];
  /** The tab was hidden or the window lost focus (events pause themselves). */
  onFocusLost?(): void;
}

/** A stack of scenes. Only the top one updates; overlays let the one below show. */
export class SceneManager {
  private readonly stack: Scene[] = [];

  get top(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  get size(): number {
    return this.stack.length;
  }

  push(scene: Scene): void {
    this.stack.push(scene);
    scene.enter?.();
  }

  pop(): Scene | undefined {
    const scene = this.stack.pop();
    scene?.exit?.();
    return scene;
  }

  replace(scene: Scene): void {
    this.pop();
    this.push(scene);
  }

  /** Pop scenes until the one named `name` is on top (e.g. back to the menu). */
  popTo(name: string): void {
    while (this.stack.length > 1 && this.top?.name !== name) this.pop();
  }

  /** The music wanted by the top scene that isn't an overlay. */
  get music(): SongName | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (!this.stack[i].isOverlay) return this.stack[i].music ?? null;
    }
    return null;
  }

  /** Is a scene with this name anywhere in the stack? */
  has(name: string): boolean {
    return this.stack.some((s) => s.name === name);
  }

  update(dt: number, input: InputSnapshot): void {
    this.top?.update(dt, input);
  }

  render(r: Renderer): void {
    // Start from the highest non-overlay scene, then draw upwards.
    let first = this.stack.length - 1;
    while (first > 0 && this.stack[first].isOverlay) first--;
    for (let i = Math.max(first, 0); i < this.stack.length; i++) this.stack[i].render(r);
  }
}
