import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  projectStateForSeat,
  seededRandom,
  type AiDifficulty,
  type GameAction,
  type GameState,
  type GameView,
} from '../src/index.ts';
import { findNextBotDecision } from './basicBot';
import {
  appendRecordedAction,
  clearLocalGameSession,
  createFreshLocalSeed,
  createLocalGameSession,
  createNextLocalRoundSession,
  getOnlyDrawAction,
  getOnlyPassAction,
  loadLocalGameSession,
  replayLocalGameSession,
  saveLocalGameSession,
  type LocalGameSession,
  type LocalDealerSource,
  type RecordedAction,
  type StorageLike,
} from './localSession';
import type { DealerSelection, WallOpening } from '../src/match.ts';

export const LOCAL_VIEWER_SEAT = 0 as const;
export const BOT_TURN_DELAY_MS = 280;
export const AUTO_VIEWER_ACTION_DELAY_MS = 120;

export interface LocalGameController {
  state: GameState;
  view: GameView;
  roundNumber: number;
  dealerSource: LocalDealerSource;
  dealerSelection: DealerSelection | null;
  opening: WallOpening;
  botThinking: boolean;
  restored: boolean;
  records: readonly RecordedAction[];
  replayStep: number | null;
  isReplaying: boolean;
  dispatch: (action: GameAction) => void;
  reset: () => void;
  startNextRound: () => void;
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

function decisionRandom(seed: number, actionCount: number) {
  return seededRandom((seed ^ Math.imul(actionCount + 1, 0x6d2b79f5)) >>> 0);
}

/**
 * Local single-player controller. The React layer owns only the current state;
 * all legality and transitions remain inside the shared mahjong engine.
 */
export function useLocalGame(
  seed: number,
  difficulty: AiDifficulty = 'standard',
): LocalGameController {
  const [loaded] = useState(() => initialSession(seed));
  const [session, setSession] = useState<LocalGameSession>(loaded.session);
  const [restored, setRestored] = useState(loaded.restored);
  const [replayStep, setReplayStep] = useState<number | null>(null);
  const isReplaying = replayStep !== null;
  const botDecision = useMemo(
    () =>
      isReplaying
        ? null
        : findNextBotDecision(
            session.state,
            difficulty,
            decisionRandom(session.seed, session.records.length),
          ),
    [difficulty, isReplaying, session.records.length, session.seed, session.state],
  );
  const autoPassAction = useMemo(
    () => (isReplaying ? null : getOnlyPassAction(session.state, LOCAL_VIEWER_SEAT)),
    [isReplaying, session.state],
  );
  const autoDrawAction = useMemo(
    () => (isReplaying ? null : getOnlyDrawAction(session.state, LOCAL_VIEWER_SEAT)),
    [isReplaying, session.state],
  );

  const displayedState = useMemo(
    () => (replayStep === null ? session.state : replayLocalGameSession(session, replayStep)),
    [replayStep, session],
  );

  const view = useMemo(() => {
    const projected = projectStateForSeat(displayedState, LOCAL_VIEWER_SEAT);
    return isReplaying ? { ...projected, legalActions: [] } : projected;
  }, [displayedState, isReplaying]);

  const dispatch = useCallback(
    (action: GameAction) => {
      if (action.seat !== LOCAL_VIEWER_SEAT || isReplaying) return;
      setSession((previous) =>
        appendRecordedAction(previous, action, 'human', {
          reason: '玩家手动选择',
        }),
      );
    },
    [isReplaying],
  );

  const reset = useCallback(() => {
    const storage = browserStorage();
    if (storage !== null) clearLocalGameSession(storage);
    setSession(createLocalGameSession(createFreshLocalSeed(session.seed)));
    setReplayStep(null);
    setRestored(false);
  }, [session.seed]);

  const startNextRound = useCallback(() => {
    if (session.state.result === null) return;
    setSession(createNextLocalRoundSession(session));
    setReplayStep(null);
    setRestored(false);
  }, [session]);

  const showReplayStep = useCallback(
    (step: number) => {
      setReplayStep(Math.max(0, Math.min(step, session.records.length)));
    },
    [session.records.length],
  );

  const resumeLive = useCallback(() => setReplayStep(null), []);

  useEffect(() => {
    const storage = browserStorage();
    if (storage !== null) saveLocalGameSession(storage, session);
  }, [session]);

  useEffect(() => {
    const viewerAutomaticAction = autoPassAction ?? autoDrawAction;
    const automaticAction = viewerAutomaticAction ?? botDecision?.action ?? null;
    if (automaticAction === null || isReplaying) return undefined;

    const timer = window.setTimeout(
      () => {
        setSession((previous) => {
          const nextViewerAction =
            getOnlyPassAction(previous.state, LOCAL_VIEWER_SEAT) ??
            getOnlyDrawAction(previous.state, LOCAL_VIEWER_SEAT);
          if (nextViewerAction !== null) {
            const isPass = nextViewerAction.type === 'pass';
            return appendRecordedAction(
              previous,
              nextViewerAction,
              isPass ? 'auto-pass' : 'auto-draw',
              {
                reason: isPass ? '唯一合法响应，自动过牌' : '唯一合法动作，自动摸牌',
              },
            );
          }
          const nextBotDecision = findNextBotDecision(
            previous.state,
            difficulty,
            decisionRandom(previous.seed, previous.records.length),
          );
          return nextBotDecision === null
            ? previous
            : appendRecordedAction(previous, nextBotDecision.action, 'bot', {
                reason: nextBotDecision.reason,
                candidates: nextBotDecision.candidates,
              });
        });
      },
      viewerAutomaticAction === null ? BOT_TURN_DELAY_MS : AUTO_VIEWER_ACTION_DELAY_MS,
    );

    return () => window.clearTimeout(timer);
  }, [autoDrawAction, autoPassAction, botDecision, difficulty, isReplaying]);

  return {
    state: session.state,
    view,
    roundNumber: session.roundNumber,
    dealerSource: session.dealerSource,
    dealerSelection: session.dealerSelection,
    opening: session.opening,
    botThinking: botDecision !== null,
    restored,
    records: session.records,
    replayStep,
    isReplaying,
    dispatch,
    reset,
    startNextRound,
    showReplayStep,
    resumeLive,
  };
}
