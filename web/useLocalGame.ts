import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyAction,
  createGame,
  getLegalActions,
  projectStateForSeat,
  type GameAction,
  type GameState,
  type GameView,
} from '../src/index.ts';
import { findNextBotAction } from './basicBot';

export const LOCAL_VIEWER_SEAT = 0 as const;
export const BOT_TURN_DELAY_MS = 280;

export interface LocalGameController {
  state: GameState;
  view: GameView;
  botThinking: boolean;
  dispatch: (action: GameAction) => void;
  reset: () => void;
}

function sameAction(left: GameAction, right: GameAction): boolean {
  if (left.type !== right.type || left.seat !== right.seat) return false;
  if ('tile' in left || 'tile' in right) {
    return 'tile' in left && 'tile' in right && left.tile === right.tile;
  }
  return true;
}

function applyIfStillLegal(state: GameState, action: GameAction): GameState {
  const isLegal = getLegalActions(state, action.seat)
    .some((candidate) => sameAction(candidate, action));
  return isLegal ? applyAction(state, action) : state;
}

/**
 * Local single-player controller. The React layer owns only the current state;
 * all legality and transitions remain inside the shared mahjong engine.
 */
export function useLocalGame(seed: number): LocalGameController {
  const [state, setState] = useState<GameState>(() => createGame({ seed }));
  const botAction = useMemo(() => findNextBotAction(state), [state]);

  const dispatch = useCallback((action: GameAction) => {
    if (action.seat !== LOCAL_VIEWER_SEAT) return;
    setState((previous) => applyIfStillLegal(previous, action));
  }, []);

  const reset = useCallback(() => {
    setState(createGame({ seed }));
  }, [seed]);

  useEffect(() => {
    if (botAction === null) return undefined;

    const timer = window.setTimeout(() => {
      setState((previous) => {
        const nextAction = findNextBotAction(previous);
        return nextAction === null ? previous : applyIfStillLegal(previous, nextAction);
      });
    }, BOT_TURN_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [botAction]);

  return {
    state,
    view: projectStateForSeat(state, LOCAL_VIEWER_SEAT),
    botThinking: botAction !== null,
    dispatch,
    reset,
  };
}
