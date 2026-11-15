import { calculateShanten } from './ai-evaluation.js';
import { rankStrategicDiscards } from './ai-strategy.js';
import type { AiDifficulty } from './ai-difficulty.js';
import {
  coachRiskReasons,
  estimateOpponentRonRisk,
  estimateOpponentTenpai,
  visibleCoachCopies,
} from './coach-risk.js';
import { tileLabel, tileSortKey, type NormalTile } from './tiles.js';
import type { GameAudienceView, GameState, PlayerViewEntry, RoundResult, Seat } from './types.js';
import { projectStateForSeat } from './view.js';

export const COACH_RISK_BADGE_THRESHOLD = 0.05;
export const COACH_RISK_CONFIRM_THRESHOLD = 0.1;

export function showsCoachRisk(probability: number): boolean {
  return probability >= COACH_RISK_BADGE_THRESHOLD;
}

export function needsCoachRiskConfirmation(probability: number): boolean {
  return probability >= COACH_RISK_CONFIRM_THRESHOLD;
}

export type CoachOpponentStatus = 'no-fortune' | 'can-ron' | 'mouth-required' | 'declared';

export interface CoachOpponent {
  seat: Seat;
  label: string;
  status: CoachOpponentStatus;
  statusText: string;
  tenpaiProbability: number;
  canRon: boolean;
  fortuneCount: number;
  meldCount: number;
}

export interface CoachTileRisk {
  tile: NormalTile;
  probability: number;
  reasons: readonly string[];
}

export interface CoachAnalysis {
  viewerSeat: Seat;
  opponents: readonly CoachOpponent[];
  handRisks: readonly CoachTileRisk[];
  risksByTile: Readonly<Partial<Record<NormalTile, number>>>;
  maxRisk: number;
}

export interface CoachReviewMetric {
  tile: NormalTile;
  shanten: number;
  effectiveTiles: number;
  risk: number;
}

export type CoachReviewTone = 'same' | 'coach' | 'safe' | 'loss';

export interface CoachReview {
  actual: CoachReviewMetric;
  coach: CoachReviewMetric;
  summary: string;
  tone: CoachReviewTone;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function formatCoachPercent(probability: number): string {
  if (probability <= 0) return '0%';
  const percent = Math.round(probability * 100);
  return percent < 1 ? '<1%' : `${percent}%`;
}

function relativeLabel(seat: Seat, viewerSeat: Seat): string {
  const delta = (seat - viewerSeat + 4) % 4;
  return delta === 1 ? '下家' : delta === 2 ? '对家' : '上家';
}

function opponentStatus(
  player: PlayerViewEntry,
): Pick<CoachOpponent, 'status' | 'statusText' | 'canRon'> {
  if (player.mouthDeclared) {
    return { status: 'declared', statusText: '已报嘴，听牌中', canRon: true };
  }
  if (player.fortuneCount === 0) {
    return { status: 'no-fortune', statusText: '没有发财，不能接炮', canRon: false };
  }
  if (player.fortuneCount >= 3) {
    return { status: 'mouth-required', statusText: '要先报嘴才能接炮', canRon: true };
  }
  return { status: 'can-ron', statusText: '能接炮', canRon: true };
}

function riskFromView(
  view: GameAudienceView,
  tile: NormalTile,
  difficulty: AiDifficulty,
): CoachTileRisk {
  const risks = view.players
    .filter((player) => player.seat !== view.viewerSeat)
    .map((player) => ({
      probability: estimateOpponentRonRisk(view, player, tile, difficulty),
      reasons: coachRiskReasons(view, player, tile).map((reason) => reason.text),
    }))
    .filter((entry) => entry.probability > 0);
  const probability =
    risks.length === 0
      ? 0
      : 1 - risks.reduce((survival, entry) => survival * (1 - entry.probability), 1);
  const reasons = [...new Set(risks.flatMap((entry) => entry.reasons))].slice(0, 3);
  return { tile, probability: clamp(probability, 0, 0.99), reasons };
}

export function estimateCoachTileRisk(
  view: GameAudienceView,
  tile: NormalTile,
  difficulty: AiDifficulty = 'standard',
): CoachTileRisk {
  if (visibleCoachCopies(view, tile) >= 4) {
    return { tile, probability: 0, reasons: ['这张已经见四张'] };
  }
  return riskFromView(view, tile, difficulty);
}

function combinedRiskForTile(
  state: GameState,
  viewerSeat: Seat,
  tile: NormalTile,
  difficulty: AiDifficulty,
): number {
  return estimateCoachTileRisk(projectStateForSeat(state, viewerSeat), tile, difficulty)
    .probability;
}

export function analyzeCoach(
  state: GameState,
  viewerSeat: Seat,
  difficulty: AiDifficulty = 'standard',
): CoachAnalysis {
  const view = projectStateForSeat(state, viewerSeat);
  const opponents = view.players
    .filter((player) => player.seat !== viewerSeat)
    .sort((left, right) => ((left.seat - viewerSeat + 4) % 4) - ((right.seat - viewerSeat + 4) % 4))
    .map((player): CoachOpponent => {
      const status = opponentStatus(player);
      return {
        seat: player.seat,
        label: relativeLabel(player.seat, viewerSeat),
        ...status,
        tenpaiProbability: estimateOpponentTenpai(view, player, difficulty),
        fortuneCount: player.fortuneCount,
        meldCount: player.melds.length,
      };
    });

  const own = view.players.find((player) => player.seat === viewerSeat);
  if (own === undefined || own.visibility !== 'self') {
    return {
      viewerSeat,
      opponents,
      handRisks: [],
      risksByTile: {},
      maxRisk: 0,
    };
  }

  const uniqueTiles = [...new Set(own.concealedTiles)].sort(
    (left, right) => tileSortKey(left) - tileSortKey(right),
  );
  const risks = uniqueTiles.map((tile) => riskFromView(view, tile, difficulty));
  const handRisks = risks
    .filter((entry) => entry.probability > 0)
    .sort(
      (left, right) =>
        right.probability - left.probability || tileSortKey(left.tile) - tileSortKey(right.tile),
    );
  const risksByTile = Object.fromEntries(
    risks.map((entry) => [entry.tile, entry.probability]),
  ) as Partial<Record<NormalTile, number>>;

  return {
    viewerSeat,
    opponents,
    handRisks,
    risksByTile,
    maxRisk: handRisks[0]?.probability ?? 0,
  };
}

function metricFor(
  tile: NormalTile,
  evaluation: ReturnType<typeof rankStrategicDiscards>[number],
  risk: number,
): CoachReviewMetric {
  return {
    tile,
    shanten: evaluation.hand.shanten,
    effectiveTiles: evaluation.hand.effectiveTileCount,
    risk,
  };
}

function missedRiskSummary(actual: CoachReviewMetric, coach: CoachReviewMetric): string {
  const parts: string[] = [];
  if (actual.shanten > coach.shanten) {
    parts.push(`向听落后 ${actual.shanten - coach.shanten}`);
  } else if (actual.effectiveTiles < coach.effectiveTiles) {
    parts.push(`可见进张少 ${coach.effectiveTiles - actual.effectiveTiles} 张`);
  } else if (actual.effectiveTiles > coach.effectiveTiles) {
    parts.push(`可见进张多 ${actual.effectiveTiles - coach.effectiveTiles} 张`);
  }
  if (actual.risk > coach.risk + 0.005) {
    parts.push(
      `放炮风险从 ${formatCoachPercent(actual.risk)} 降到 ${formatCoachPercent(coach.risk)}`,
    );
  } else if (actual.risk + 0.005 < coach.risk) {
    parts.push(`放炮风险比教练低 ${formatCoachPercent(coach.risk - actual.risk)}`);
  }
  return parts.join('，');
}

export function createCoachReview(
  stateBeforeDiscard: GameState,
  viewerSeat: Seat,
  actualTile: NormalTile,
  resultAfterDiscard: RoundResult | null = null,
  difficulty: AiDifficulty = 'standard',
): CoachReview | null {
  const ranked = rankStrategicDiscards(stateBeforeDiscard, viewerSeat);
  const actualEvaluation = ranked.find((entry) => entry.tile === actualTile);
  if (actualEvaluation === undefined || ranked.length === 0) return null;

  const riskByTile = new Map(
    ranked.map((entry) => [
      entry.tile,
      combinedRiskForTile(stateBeforeDiscard, viewerSeat, entry.tile, difficulty),
    ]),
  );
  const actual = metricFor(actualTile, actualEvaluation, riskByTile.get(actualTile) ?? 0);
  const best = ranked[0]!;
  const bestShanten = best.hand.shanten;
  const maxEffective = Math.max(
    ...ranked
      .filter((entry) => entry.hand.shanten === bestShanten)
      .map((entry) => entry.hand.effectiveTileCount),
  );
  const nearBest = ranked.filter(
    (entry) =>
      entry.hand.shanten === bestShanten && entry.hand.effectiveTileCount >= maxEffective - 2,
  );
  const safestNearBest = [...nearBest].sort(
    (left, right) => (riskByTile.get(left.tile) ?? 0) - (riskByTile.get(right.tile) ?? 0),
  )[0]!;
  const bestRisk = riskByTile.get(best.tile) ?? 0;
  const safeRisk = riskByTile.get(safestNearBest.tile) ?? 0;
  const coachEvaluation = safeRisk <= bestRisk - 0.02 ? safestNearBest : best;
  const coach = metricFor(
    coachEvaluation.tile,
    coachEvaluation,
    riskByTile.get(coachEvaluation.tile) ?? 0,
  );

  if (
    resultAfterDiscard?.outcome === 'win' &&
    resultAfterDiscard.winType === 'discard' &&
    resultAfterDiscard.winner !== viewerSeat &&
    resultAfterDiscard.winner !== null
  ) {
    return {
      actual,
      coach,
      summary: `这张放炮了，当时估计风险 ${formatCoachPercent(actual.risk)}。`,
      tone: 'loss',
    };
  }

  if (actual.tile === coach.tile) {
    return { actual, coach, summary: '和教练一致。', tone: 'same' };
  }

  const actualSafer = actual.risk + 0.005 < coach.risk;
  if (actualSafer && actual.effectiveTiles < coach.effectiveTiles) {
    return {
      actual,
      coach,
      summary: `你选了更稳的${tileLabel(actual.tile)}：进张少 ${coach.effectiveTiles - actual.effectiveTiles} 张，放炮风险低 ${formatCoachPercent(coach.risk - actual.risk)}。`,
      tone: 'safe',
    };
  }

  const difference = missedRiskSummary(actual, coach);
  return {
    actual,
    coach,
    summary:
      difference.length === 0
        ? `教练会打${tileLabel(coach.tile)}，这手与教练接近。`
        : `教练会打${tileLabel(coach.tile)}：${difference}。`,
    tone: 'coach',
  };
}

/** A compact, visual-only estimate used by tests and the panel header. */
export function highestRiskTile(analysis: CoachAnalysis): NormalTile | null {
  return analysis.handRisks[0]?.tile ?? null;
}

/** Compute shanten for a tile after a hypothetical discard. */
export function shantenAfterDiscard(
  concealedTiles: readonly NormalTile[],
  melds: PlayerViewEntry['melds'],
  tile: NormalTile,
): number {
  const next = [...concealedTiles];
  const index = next.indexOf(tile);
  if (index >= 0) next.splice(index, 1);
  return calculateShanten(next, melds);
}
