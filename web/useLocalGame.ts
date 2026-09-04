import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  projectStateForSeat,
  type GameAction,
  type GameState,
  type GameView,
} from '../src/index.ts';
import { findNextBotAction } from './basicBot';
import {
  appendRecordedAction,
  clearLocalGameSession,
  createLocalGameSession,
  getOnlyPassAction,
  loadLocalGameSession,
  replayRecordedActions,
  saveLocalGameSession,
  type LocalGameSession,
  type RecordedAction,
  type StorageLike,
} from './localSession';

export const LOCAL_VIEWER_SEAT = 0 as const;
export const BOT_TURN_DELAY_MS = 280;
export const AUTO_PASS_DELAY_MS = 120;

export interface LocalGameController {
  state: GameState;
  view: GameView;
  botThinking: boolean;
  restored: boolean;
  records: readonly RecordedAction[];
  replayStep: number | null;
  isReplaying: boolean;
  dispatch: (action: GameAction) => void;
  reset: () => void;
  showReplayStep: (step: number) => void;
  resumeLive: () => void;
}

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function initialSession(seed: number): { session: LocalGameSession; restored: boolean } {
  const storage = browserStorage();
  return storage === null
    ? { session: createLocalGameSession(seed), restored: false }
    : loadLocalGameSession(storage, seed);
}

/**
 * Local single-player controller. The React layer owns only the current state;
 * all legality and transitions remain inside the shared mahjong engine.
 */
export function useLocalGame(seed: number): LocalGameController {
  const [loaded] = useState(() => initialSession(seed));
  const [session, setSession] = useState<LocalGameSession>(loaded.session);
  const [restored, setRestored] = useState(loaded.restored);
  const [replayStep, setReplayStep] = useState<number | null>(null);
  const isReplaying = replayStep !== null;
  const botAction = useMemo(
    () => isReplaying ? null : findNextBotAction(session.state),
    [isReplaying, session.state],
  );
  const autoPassAction = useMemo(
    () => isReplaying ? null : getOnlyPassAction(session.state, LOCAL_VIEWER_SEAT),
    [isReplaying, session.state],
  );

  const displayedState = useMemo(
    () => replayStep === null
      ? session.state
      : replayRecordedActions(seed, session.records, replayStep),
    [replayStep, seed, session.records, session.state],
  );

  const view = useMemo(() => {
    const projected = projectStateForSeat(displayedState, LOCAL_VIEWER_SEAT);
    return isReplaying ? { ...projected, legalActions: [] } : projected;
  }, [displayedState, isReplaying]);

  const dispatch = useCallback((action: GameAction) => {
    if (action.seat !== LOCAL_VIEWER_SEAT || isReplaying) return;
    setSession((previous) => appendRecordedAction(previous, action, 'human'));
  }, [isReplaying]);

  const reset = useCallback(() => {
    const storage = browserStorage();
    if (storage !== null) clearLocalGameSession(storage);
    setSession(createLocalGameSession(seed));
    setReplayStep(null);
    setRestored(false);
  }, [seed]);

  const showReplayStep = useCallback((step: number) => {
    setReplayStep(Math.max(0, Math.min(step, session.records.length)));
  }, [session.records.length]);

  const resumeLive = useCallback(() => setReplayStep(null), []);

  useEffect(() => {
    const storage = browserStorage();
    if (storage !== null) saveLocalGameSession(storage, session);
  }, [session]);

  useEffect(() => {
    const automaticAction = autoPassAction ?? botAction;
    if (automaticAction === null || isReplaying) return undefined;

    const timer = window.setTimeout(() => {
      setSession((previous) => {
        const nextAutoPass = getOnlyPassAction(previous.state, LOCAL_VIEWER_SEAT);
        if (nextAutoPass !== null) {
          return appendRecordedAction(previous, nextAutoPass, 'auto-pass');
        }
        const nextBotAction = findNextBotAction(previous.state);
        return nextBotAction === null
          ? previous
          : appendRecordedAction(previous, nextBotAction, 'bot');
      });
    }, autoPassAction === null ? BOT_TURN_DELAY_MS : AUTO_PASS_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [autoPassAction, botAction, isReplaying]);

  return {
    state: session.state,
    view,
    botThinking: botAction !== null,
    restored,
    records: session.records,
    replayStep,
    isReplaying,
    dispatch,
    reset,
    showReplayStep,
    resumeLive,
  };
}
