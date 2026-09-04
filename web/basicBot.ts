import { decideAiAction } from '../src/ai.ts';
import type { GameAction, GameState, Seat } from '../src/types.ts';

export const BOT_SEATS = [1, 2, 3] as const;

/**
 * A deliberately small, deterministic policy for the local UI milestone.
 * It never invents an action: every returned action comes from getLegalActions().
 */
export function chooseBasicBotAction(state: GameState, seat: Seat): GameAction | null {
  return decideAiAction(state, seat)?.action ?? null;
}

/** Find the next bot action that can be applied to the current state. */
export function findNextBotAction(state: GameState): GameAction | null {
  for (const seat of BOT_SEATS) {
    const action = chooseBasicBotAction(state, seat);
    if (action !== null) return action;
  }
  return null;
}
