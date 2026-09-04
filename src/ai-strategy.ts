import { evaluateDiscardChoices, evaluateHand, type DiscardEvaluation } from './ai-evaluation.js';
import { basicAiPolicy, type AiDecisionCandidate, type AiPolicy } from './ai.js';
import { isHonorTile, isSuitedTile, tileRank, tileSuit, type NormalTile } from './tiles.js';
import type { GameState, Seat } from './types.js';

export interface StrategicDiscardEvaluation extends DiscardEvaluation {
  strategicScore: number;
  heuristics: string[];
}

function tileCount(tiles: readonly NormalTile[], tile: NormalTile): number {
  return tiles.filter((candidate) => candidate === tile).length;
}

function suitedNeighborCount(tiles: readonly NormalTile[], tile: NormalTile): number {
  if (!isSuitedTile(tile)) return 0;
  const rank = tileRank(tile);
  const suit = tileSuit(tile);
  return tiles.filter((candidate) => {
    if (!isSuitedTile(candidate) || tileSuit(candidate) !== suit || candidate === tile) return false;
    return Math.abs(tileRank(candidate) - rank) <= 2;
  }).length;
}

function applyDiscardHeuristics(
  state: GameState,
  seat: Seat,
  evaluation: DiscardEvaluation,
): StrategicDiscardEvaluation {
  const player = state.players[seat]!;
  const count = tileCount(player.concealedTiles, evaluation.tile);
  const baseline = evaluateHand(state, seat);
  const heuristics: string[] = [];
  let adjustment = 0;

  if (isHonorTile(evaluation.tile) && count === 1) {
    adjustment += 14;
    heuristics.push('孤张字牌优先处理');
  }

  if (isSuitedTile(evaluation.tile) && count === 1 && suitedNeighborCount(player.concealedTiles, evaluation.tile) === 0) {
    adjustment += 10;
    heuristics.push('缺少相邻搭子的孤张');
  }

  if (isSuitedTile(evaluation.tile) && count === 1) {
    const rank = tileRank(evaluation.tile);
    if (rank === 1 || rank === 9) {
      adjustment += 3;
      heuristics.push('孤立幺九价值较低');
    }
  }

  if (count >= 2) {
    adjustment -= count >= 3 ? 14 : 9;
    heuristics.push(count >= 3 ? '保留刻子结构' : '保留对子结构');
  }

  if (baseline.pureSuitTarget !== null && baseline.pureSuitPotential >= 0.65) {
    if (tileSuit(evaluation.tile) !== baseline.pureSuitTarget) {
      adjustment += 11;
      heuristics.push(`清理非 ${baseline.pureSuitTarget} 门牌`);
    } else {
      adjustment -= 5;
      heuristics.push(`保留 ${baseline.pureSuitTarget} 门清一色材料`);
    }
  }

  return {
    ...evaluation,
    strategicScore: evaluation.score + adjustment,
    heuristics,
  };
}

export function rankStrategicDiscards(state: GameState, seat: Seat): StrategicDiscardEvaluation[] {
  return evaluateDiscardChoices(state, seat)
    .map((evaluation) => applyDiscardHeuristics(state, seat, evaluation))
    .sort((left, right) =>
      right.strategicScore - left.strategicScore || right.score - left.score,
    );
}

function asCandidates(evaluations: readonly StrategicDiscardEvaluation[]): AiDecisionCandidate[] {
  return evaluations.map((evaluation) => ({
    action: evaluation.action,
    score: evaluation.strategicScore,
    reasons: [...evaluation.reasons, ...evaluation.heuristics],
  }));
}

export const strategicDiscardPolicy: AiPolicy = {
  id: 'strategic-discard-v1',
  choose(input) {
    const basicChoice = basicAiPolicy.choose(input);
    if (basicChoice?.action.type !== 'discard') return basicChoice;

    const ranked = rankStrategicDiscards(input.state, input.seat);
    const best = ranked[0];
    if (best === undefined) return basicChoice;
    const reasons = [...best.reasons, ...best.heuristics];
    return {
      action: best.action,
      reason: `弃牌评分 ${best.strategicScore}：${reasons.join('；')}`,
      candidates: asCandidates(ranked),
    };
  },
};
