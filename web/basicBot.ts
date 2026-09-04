import { decideAiAction, type AiDecision } from '../src/ai.ts';
import { strategicAiPolicy } from '../src/ai-strategy.ts';
import type { GameAction, GameState, Seat } from '../src/types.ts';

export const BOT_SEATS = [1, 2, 3] as const;

/**
 * A deliberately small, deterministic policy for the local UI milestone.
 * It never invents an action: every returned action comes from getLegalActions().
 */
export function chooseBasicBotAction(state: GameState, seat: Seat): GameAction | null {
  return decideAiAction(state, seat, strategicAiPolicy)?.action ?? null;
}

export function findNextBotDecision(state: GameState): AiDecision | null {
  for (const seat of BOT_SEATS) {
    const decision = decideAiAction(state, seat, strategicAiPolicy);
    if (decision !== null) return decision;
  }
  return null;
}

/** Find the next bot action that can be applied to the current state. */
export function findNextBotAction(state: GameState): GameAction | null {
  return findNextBotDecision(state)?.action ?? null;
}
