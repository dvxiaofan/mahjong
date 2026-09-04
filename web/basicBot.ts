import { decideAiAction, type AiDecision } from '../src/ai.ts';
import { createDifficultyAiPolicy, type AiDifficulty } from '../src/ai-difficulty.ts';
import { seededRandom, type RandomSource } from '../src/random.ts';
import type { GameAction, GameState, Seat } from '../src/types.ts';

export const BOT_SEATS = [1, 2, 3] as const;

/**
 * A deliberately small, deterministic policy for the local UI milestone.
 * It never invents an action: every returned action comes from getLegalActions().
 */
export function chooseBasicBotAction(state: GameState, seat: Seat): GameAction | null {
  return (
    decideAiAction(state, seat, createDifficultyAiPolicy('advanced', seededRandom(1)))?.action ??
    null
  );
}

export function findNextBotDecision(
  state: GameState,
  difficulty: AiDifficulty = 'advanced',
  random: RandomSource = seededRandom(1),
): AiDecision | null {
  const policy = createDifficultyAiPolicy(difficulty, random);
  for (const seat of BOT_SEATS) {
    const decision = decideAiAction(state, seat, policy);
    if (decision !== null) return decision;
  }
  return null;
}

/** Find the next bot action that can be applied to the current state. */
export function findNextBotAction(
  state: GameState,
  difficulty: AiDifficulty = 'advanced',
  random: RandomSource = seededRandom(1),
): GameAction | null {
  return findNextBotDecision(state, difficulty, random)?.action ?? null;
}
