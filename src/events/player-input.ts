import type { InputSnapshot } from '../core/input';

/** One player's run and action keys for this step. */
export interface PlayerKeys {
  left: boolean; // run key pressed this step
  right: boolean;
  action: boolean; // action pressed this step
  actionHeld: boolean;
  runHeld: boolean; // either run key held down (assist run)
}

/**
 * Read a player's keys. With one human in the event (`solo`), both key sets
 * work for them; with two, P1 uses A/D/W and P2 uses the arrow keys.
 */
export function keysFor(input: InputSnapshot, playerIndex: number, solo: boolean): PlayerKeys {
  const p1 = solo || playerIndex === 0;
  const p2 = solo || playerIndex === 1;
  return {
    left: (p1 && input.justPressed('P1_LEFT')) || (p2 && input.justPressed('P2_LEFT')),
    right: (p1 && input.justPressed('P1_RIGHT')) || (p2 && input.justPressed('P2_RIGHT')),
    action: (p1 && input.justPressed('P1_ACTION')) || (p2 && input.justPressed('P2_ACTION')),
    actionHeld: (p1 && input.isDown('P1_ACTION')) || (p2 && input.isDown('P2_ACTION')),
    runHeld:
      (p1 && (input.isDown('P1_LEFT') || input.isDown('P1_RIGHT'))) ||
      (p2 && (input.isDown('P2_LEFT') || input.isDown('P2_RIGHT'))),
  };
}
