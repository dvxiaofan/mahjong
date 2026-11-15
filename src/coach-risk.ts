import type { AiDifficulty } from './ai-difficulty.js';
import {
  COACH_RISK_MODELS,
  COACH_TENPAI_TABLES,
  type CoachRiskModel,
} from './coach-risk-coefficients.js';
import { isHonorTile, isSuitedTile, tileRank, tileSuit, type NormalTile } from './tiles.js';
import type { GameAudienceView, PlayerViewEntry, Seat } from './types.js';

export const COACH_FEATURE_NAMES = [
  'bias',
  'fortune_2',
  'fortune_3plus',
  'declared',
  'mouth_required',
  'melds_1',
  'melds_2',
  'melds_3plus',
  'progress',
  'progress_sq',
  'tile_honor',
  'tile_terminal',
  'tile_edge',
  'tile_37',
  'tile_middle',
  'genbutsu',
  'suit_discards_1',
  'suit_discards_2',
  'suit_discards_3plus',
  'seen_1',
  'seen_2',
  'seen_3',
  'genbutsu_declared',
  'progress_melds',
] as const;

export const COACH_FEATURE_COUNT = COACH_FEATURE_NAMES.length;

export interface CoachRiskReason {
  code: 'declared' | 'mouth-required' | 'melds' | 'genbutsu' | 'seen' | 'middle' | 'late-wall';
  text: string;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function relativeLabel(seat: Seat, viewerSeat: Seat): string {
  const delta = (seat - viewerSeat + 4) % 4;
  return delta === 1 ? '下家' : delta === 2 ? '对家' : '上家';
}

function meldTileCount(meld: PlayerViewEntry['melds'][number]): number {
  return meld.kind === 'pong' ? 3 : 4;
}

export function coachWallProgress(view: GameAudienceView): number {
  return clamp(1 - Math.min(view.wallRemaining, 66) / 66, 0, 1);
}

export function coachWallSegment(view: GameAudienceView): number {
  return Math.min(11, Math.floor((66 - Math.min(view.wallRemaining, 66)) / 6));
}

export function visibleCoachCopies(view: GameAudienceView, tile: NormalTile): number {
  return view.players.reduce((total, player) => {
    const own =
      player.visibility === 'self' || player.visibility === 'revealed'
        ? player.concealedTiles.filter((candidate) => candidate === tile).length
        : 0;
    const discards = player.discards.filter((candidate) => candidate === tile).length;
    const melds = player.melds.reduce(
      (meldTotal, meld) => meldTotal + (meld.tile === tile ? meldTileCount(meld) : 0),
      0,
    );
    return total + own + discards + melds;
  }, 0);
}

function sameSuitDiscardCount(player: PlayerViewEntry, tile: NormalTile): number {
  const suit = tileSuit(tile);
  if (suit === null) return 0;
  return player.discards.filter(
    (candidate) => isSuitedTile(candidate) && tileSuit(candidate) === suit,
  ).length;
}

/**
 * Features are derived exclusively from a privacy-projected audience view.
 * Training imports this same function so fitted inference cannot drift.
 */
export function extractCoachFeatures(
  view: GameAudienceView,
  player: PlayerViewEntry,
  tile: NormalTile,
): Float64Array {
  if (view.viewerSeat === null || player.seat === view.viewerSeat) {
    throw new Error('教练风险只估计其他座位');
  }

  const fortune = player.fortuneCount;
  const declared = player.mouthDeclared;
  const melds = Math.min(player.melds.length, 3);
  const progress = coachWallProgress(view);
  const seen = Math.min(visibleCoachCopies(view, tile), 3);
  const sameSuit = Math.min(sameSuitDiscardCount(player, tile), 3);
  const genbutsu = player.discards.includes(tile);
  const rank = isSuitedTile(tile) ? Number(tileRank(tile)) : 0;
  const terminal = rank === 1 || rank === 9;
  const edge = rank === 2 || rank === 8;
  const thirtySeven = rank === 3 || rank === 7;
  const middle = rank >= 4 && rank <= 6;

  return Float64Array.from([
    1,
    Number(fortune === 2),
    Number(fortune >= 3 && !declared),
    Number(declared),
    Number(fortune >= 3 && !declared),
    Number(melds === 1),
    Number(melds === 2),
    Number(melds >= 3),
    progress,
    progress * progress,
    Number(isHonorTile(tile)),
    Number(terminal),
    Number(edge),
    Number(thirtySeven),
    Number(middle),
    Number(genbutsu),
    Number(sameSuit === 1),
    Number(sameSuit === 2),
    Number(sameSuit >= 3),
    Number(seen === 1),
    Number(seen === 2),
    Number(seen === 3),
    Number(genbutsu && declared),
    progress * (melds / 3),
  ]);
}

export function coachRiskModel(difficulty: AiDifficulty): CoachRiskModel {
  return COACH_RISK_MODELS[difficulty];
}

export function sigmoid(value: number): number {
  if (value >= 35) return 1;
  if (value <= -35) return 0;
  return 1 / (1 + Math.exp(-value));
}

export function predictCoachFeatures(features: ArrayLike<number>, model: CoachRiskModel): number {
  if (features.length !== model.weights.length) {
    throw new Error(`教练特征维度不一致：${features.length} / ${model.weights.length}`);
  }
  let score = 0;
  for (let index = 0; index < features.length; index += 1) {
    score += features[index]! * model.weights[index]!;
  }
  if (model.calibration.method === 'isotonic' && model.calibration.knots.length > 0) {
    const knots = model.calibration.knots;
    const first = knots[0]!;
    const last = knots[knots.length - 1]!;
    if (score <= first.score) return first.probability;
    if (score >= last.score) return last.probability;
    let low = 0;
    let high = knots.length - 1;
    while (high - low > 1) {
      const middle = Math.floor((low + high) / 2);
      if (knots[middle]!.score <= score) low = middle;
      else high = middle;
    }
    const left = knots[low]!;
    const right = knots[high]!;
    const span = right.score - left.score;
    const ratio = span <= 0 ? 0 : (score - left.score) / span;
    return clamp(left.probability + (right.probability - left.probability) * ratio, 0, 1);
  }
  return sigmoid(score * model.calibration.slope + model.calibration.intercept);
}

export function estimateOpponentRonRisk(
  view: GameAudienceView,
  player: PlayerViewEntry,
  tile: NormalTile,
  difficulty: AiDifficulty,
): number {
  if (player.fortuneCount < 1) return 0;
  if (visibleCoachCopies(view, tile) >= 4) return 0;
  return clamp(
    predictCoachFeatures(extractCoachFeatures(view, player, tile), COACH_RISK_MODELS[difficulty]),
    0,
    0.99,
  );
}

function fortuneBucket(player: PlayerViewEntry): number {
  return Math.min(player.fortuneCount, 3);
}

function meldBucket(player: PlayerViewEntry): number {
  return Math.min(player.melds.length, 3);
}

export function estimateOpponentTenpai(
  view: GameAudienceView,
  player: PlayerViewEntry,
  difficulty: AiDifficulty,
): number {
  if (player.mouthDeclared) return 1;
  const table = COACH_TENPAI_TABLES[difficulty].probabilities;
  return clamp(
    table[fortuneBucket(player)]?.[meldBucket(player)]?.[coachWallSegment(view)] ?? 0.08,
    0,
    0.99,
  );
}

export function coachRiskReasons(
  view: GameAudienceView,
  player: PlayerViewEntry,
  tile: NormalTile,
): CoachRiskReason[] {
  const reasons: CoachRiskReason[] = [];
  const opponentLabel = relativeLabel(player.seat, view.viewerSeat ?? 0);
  if (player.mouthDeclared) {
    reasons.push({ code: 'declared', text: `${opponentLabel}已报嘴，听牌中` });
  } else if (player.fortuneCount >= 3) {
    reasons.push({ code: 'mouth-required', text: `${opponentLabel}三财以上，可先报嘴再胡` });
  }
  if (player.melds.length > 0) {
    reasons.push({
      code: 'melds',
      text: `${opponentLabel}已有 ${player.melds.length} 组副露`,
    });
  }
  if (player.discards.includes(tile)) {
    reasons.push({ code: 'genbutsu', text: `${opponentLabel}打过这张，但本规则没有振听` });
  }
  const seen = visibleCoachCopies(view, tile);
  if (seen >= 2) {
    reasons.push({ code: 'seen', text: `这张已见 ${seen} 张` });
  }
  if (isSuitedTile(tile) && tileRank(tile) >= 3 && tileRank(tile) <= 7) {
    reasons.push({ code: 'middle', text: '中张比幺九更容易被听' });
  }
  if (view.wallRemaining <= 24) {
    reasons.push({ code: 'late-wall', text: `牌墙只剩 ${view.wallRemaining} 张` });
  }
  return reasons;
}
