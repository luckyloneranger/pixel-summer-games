import type { InputSnapshot } from './input';
import type { Renderer } from './renderer';

/** One screen of the game: title, menu, an event, the pause overlay... */
export interface Scene {
  /** Short name shown in the debug overlay. */
  readonly name: string;
  /** True for overlays (like Pause) that draw on top of the scene below. */
  readonly isOverlay?: boolean;
  enter?(): void;
  exit?(): void;
  update(dt: number, input: InputSnapshot): void;
  render(r: Renderer): void;
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
