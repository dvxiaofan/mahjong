import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeCoach,
  createCoachReview,
  type CoachAnalysis,
  type CoachReview,
} from '../../src/coach.ts';
import type { AiDifficulty } from '../../src/ai-difficulty.ts';
import type { GameState, GameView } from '../../src/types.ts';
import {
  DEFAULT_COACH_SETTINGS,
  loadCoachSettings,
  saveCoachSettings,
  type CoachSettings,
  type CoachStorage,
} from './coachSettings';

export type CoachPanelMode = 'situation' | 'risk' | 'review';

export interface CoachModel {
  analysis: CoachAnalysis;
  review: CoachReview | null;
  mode: CoachPanelMode;
  canDiscard: boolean;
  notice: string | null;
}

export interface CoachController {
  settings: CoachSettings;
  saved: boolean;
  update: (patch: Partial<CoachSettings>) => void;
  model: CoachModel | null;
}

function browserStorage(): CoachStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function phaseNotice(view: GameView): string | null {
  if (view.phase === 'claiming') {
    return view.legalActions.length > 0
      ? '本次只标风险，不点评碰、杠、胡或过牌。'
      : '其他玩家正在响应，先看三家风险。';
  }
  return null;
}

export function useCoach(
  state: GameState,
  view: GameView,
  isReplaying: boolean,
  roundKey: string,
  difficulty: AiDifficulty = 'standard',
): CoachController {
  const [storage] = useState(browserStorage);
  const [settings, setSettings] = useState(() => loadCoachSettings(storage));
  const [saved, setSaved] = useState(storage !== null);
  const [review, setReview] = useState<CoachReview | null>(null);
  const previous = useRef<{ state: GameState; eventCount: number } | null>(null);

  const analysis = useMemo(
    () =>
      settings.enabled && !isReplaying ? analyzeCoach(state, view.viewerSeat, difficulty) : null,
    [difficulty, isReplaying, settings.enabled, state, view.viewerSeat],
  );

  useEffect(() => {
    setReview(null);
    previous.current = null;
  }, [roundKey]);

  useEffect(() => {
    if (!settings.enabled || isReplaying) {
      setReview(null);
      previous.current = { state, eventCount: state.events.length };
      return;
    }

    const prior = previous.current;
    const lastEvent = state.events.at(-1);
    const newViewerDiscard =
      prior !== null &&
      state.events.length > prior.eventCount &&
      lastEvent?.type === 'discard' &&
      lastEvent.seat === view.viewerSeat &&
      lastEvent.tile !== null &&
      prior.state.currentSeat === view.viewerSeat &&
      prior.state.phase === 'awaiting-discard';

    if (newViewerDiscard && lastEvent.tile !== null) {
      const nextReview = createCoachReview(
        prior.state,
        view.viewerSeat,
        lastEvent.tile,
        state.result,
        difficulty,
      );
      if (nextReview !== null) setReview(nextReview);
    }

    previous.current = { state, eventCount: state.events.length };
  }, [difficulty, isReplaying, settings.enabled, state, view.viewerSeat]);

  function update(patch: Partial<CoachSettings>) {
    const next = {
      ...DEFAULT_COACH_SETTINGS,
      ...settings,
      ...patch,
    };
    setSettings(next);
    setSaved(saveCoachSettings(storage, next));
  }

  let model: CoachModel | null = null;
  if (analysis !== null && view.result !== null && review !== null) {
    model = {
      analysis,
      review,
      mode: 'review',
      canDiscard: false,
      notice: null,
    };
  } else if (analysis !== null && view.result === null) {
    const canDiscard = view.legalActions.some((action) => action.type === 'discard');
    model = {
      analysis,
      review,
      mode: review !== null ? 'review' : canDiscard ? 'risk' : 'situation',
      canDiscard,
      notice: phaseNotice(view),
    };
  }

  return { settings, saved, update, model };
}
