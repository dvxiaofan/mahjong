import type { AiDifficulty } from '../../src/ai-difficulty.ts';
import { applyAction } from '../../src/game.ts';
import { createCoachReview, type CoachReview } from '../../src/coach.ts';
import type { GameState, RoundResult, Seat } from '../../src/types.ts';
import type { RecordedAction } from '../localSession';

export type CoachReviewTone = CoachReview['tone'];

export interface CoachGameReviewItem {
  step: number;
  review: CoachReview;
  severity: number;
}

export interface CoachGameReview {
  reviewedDiscards: number;
  same: number;
  safer: number;
  improvements: number;
  losses: number;
  averageRisk: number;
  summary: string;
  top: readonly CoachGameReviewItem[];
}

interface PendingReview {
  step: number;
  stateBeforeDiscard: GameState;
  tile: Extract<RecordedAction['action'], { type: 'discard' }>['tile'];
}

export interface CoachGameReviewOptions {
  initialState: GameState;
  records: readonly RecordedAction[];
  viewerSeat: Seat;
  difficulty: AiDifficulty;
  result?: RoundResult | null;
}

function severityFor(review: CoachReview): number {
  const riskGap = Math.max(0, review.actual.risk - review.coach.risk);
  const shantenGap = Math.max(0, review.actual.shanten - review.coach.shanten);
  const tileGap = Math.max(0, review.coach.effectiveTiles - review.actual.effectiveTiles);
  if (review.tone === 'loss') return 10_000 + review.actual.risk * 1000;
  if (review.tone === 'coach') {
    return 1000 + riskGap * 1000 + shantenGap * 200 + Math.min(60, tileGap) * 2;
  }
  if (review.tone === 'safe') return 100 + riskGap * 1000;
  return Math.max(0, riskGap * 1000);
}

export function buildCoachGameReview(options: CoachGameReviewOptions): CoachGameReview | null {
  const pending: PendingReview[] = [];
  const lastViewerDiscardByTile = new Map<PendingReview['tile'], number>();
  let losingStep: number | null = null;
  let state = options.initialState;
  try {
    options.records.forEach((record, index) => {
      if (
        record.action.type === 'discard' &&
        record.action.seat === options.viewerSeat &&
        record.source === 'human'
      ) {
        pending.push({
          step: index + 1,
          stateBeforeDiscard: state,
          tile: record.action.tile,
        });
        lastViewerDiscardByTile.set(record.action.tile, index + 1);
      }
      const claimedViewerDiscard =
        state.phase === 'claiming' &&
        state.pendingDiscard?.discarder === options.viewerSeat &&
        state.pendingDiscard.tile !== null
          ? state.pendingDiscard.tile
          : null;
      state = applyAction(state, record.action);
      if (
        losingStep === null &&
        state.result?.outcome === 'win' &&
        state.result.winType === 'discard' &&
        state.result.winner !== options.viewerSeat &&
        claimedViewerDiscard !== null &&
        claimedViewerDiscard === state.result.winningTile
      ) {
        losingStep = lastViewerDiscardByTile.get(claimedViewerDiscard) ?? null;
      }
    });
  } catch {
    return null;
  }
  if (pending.length === 0) return null;

  const reviews = pending.flatMap((entry) => {
    const review = createCoachReview(
      entry.stateBeforeDiscard,
      options.viewerSeat,
      entry.tile,
      entry.step === losingStep ? (options.result ?? null) : null,
      options.difficulty,
    );
    return review === null ? [] : [{ step: entry.step, review, severity: severityFor(review) }];
  });
  if (reviews.length === 0) return null;

  const same = reviews.filter((entry) => entry.review.tone === 'same').length;
  const safer = reviews.filter((entry) => entry.review.tone === 'safe').length;
  const improvements = reviews.filter((entry) => entry.review.tone === 'coach').length;
  const losses = reviews.filter((entry) => entry.review.tone === 'loss').length;
  const averageRisk =
    reviews.reduce((total, entry) => total + entry.review.actual.risk, 0) / reviews.length;
  const top = reviews
    .filter((entry) => entry.review.tone !== 'same')
    .sort((left, right) => right.severity - left.severity || left.step - right.step)
    .slice(0, 3);
  const summary =
    `整局 ${reviews.length} 次出牌：${same} 次和教练一致，${safer} 次更稳，` +
    `${improvements} 次可改进${losses > 0 ? `，${losses} 次放炮` : ''}。`;

  return {
    reviewedDiscards: reviews.length,
    same,
    safer,
    improvements,
    losses,
    averageRisk,
    summary,
    top,
  };
}
