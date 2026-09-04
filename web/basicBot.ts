import { getLegalActions } from '../src/game.ts';
import type { GameAction, GamePhase, GameState, Seat } from '../src/types.ts';

export const BOT_SEATS = [1, 2, 3] as const;

function firstAction(actions: readonly GameAction[], type: GameAction['type']): GameAction | null {
  return actions.find((action) => action.type === type) ?? null;
}

function firstActionOf(
  actions: readonly GameAction[],
  types: readonly GameAction['type'][],
): GameAction | null {
  for (const type of types) {
    const action = firstAction(actions, type);
    if (action !== null) return action;
  }
  return null;
}

/**
 * A deliberately small, deterministic policy for the local UI milestone.
 * It never invents an action: every returned action comes from getLegalActions().
 */
export function chooseBasicBotAction(state: GameState, seat: Seat): GameAction | null {
  if (state.phase === 'finished' || state.phase === 'drawn') return null;

  const actions = getLegalActions(state, seat);
  if (actions.length === 0) return null;

  const phasePriority: Record<GamePhase, readonly GameAction['type'][]> = {
    'awaiting-draw': ['declare-mouth', 'concealed-kong', 'draw'],
    'awaiting-discard': ['win', 'declare-mouth', 'supplement-kong', 'concealed-kong', 'discard'],
    claiming: ['win', 'declare-mouth', 'exposed-kong', 'pong', 'pass'],
    finished: [],
    drawn: [],
  };

  return firstActionOf(actions, phasePriority[state.phase]) ?? actions[0] ?? null;
}

/** Find the next bot action that can be applied to the current state. */
export function findNextBotAction(state: GameState): GameAction | null {
  for (const seat of BOT_SEATS) {
    const action = chooseBasicBotAction(state, seat);
    if (action !== null) return action;
  }
  return null;
}
