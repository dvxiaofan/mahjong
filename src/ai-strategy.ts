import {
  evaluateDiscardChoices,
  evaluateHand,
  scoreHandEvaluation,
  type DiscardEvaluation,
  type HandEvaluation,
} from './ai-evaluation.js';
import {
  basicAiPolicy,
  type AiDecisionCandidate,
  type AiPolicy,
  type AiPolicyChoice,
  type AiPolicyInput,
} from './ai.js';
import { isHonorTile, isSuitedTile, tileRank, tileSuit, type NormalTile } from './tiles.js';
import { applyAction } from './game.js';
import type { GameAction, GameState, Meld, Seat } from './types.js';

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
  baseline: HandEvaluation,
): StrategicDiscardEvaluation {
  const player = state.players[seat]!;
  const count = tileCount(player.concealedTiles, evaluation.tile);
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
  const baseline = evaluateHand(state, seat);
  return evaluateDiscardChoices(state, seat)
    .map((evaluation) => applyDiscardHeuristics(state, seat, evaluation, baseline))
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

function actionOf(
  actions: readonly GameAction[],
  type: GameAction['type'],
): GameAction | null {
  return actions.find((action) => action.type === type) ?? null;
}

function removeTiles(tiles: readonly NormalTile[], tile: NormalTile, amount: number): NormalTile[] {
  const result = [...tiles];
  for (let index = 0; index < amount; index += 1) {
    const tileIndex = result.indexOf(tile);
    if (tileIndex >= 0) result.splice(tileIndex, 1);
  }
  return result;
}

function cloneForClaim(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      concealedTiles: [...player.concealedTiles],
      melds: player.melds.map((meld) => ({ ...meld } as Meld)),
      discards: [...player.discards],
      lockedWaits: [...player.lockedWaits],
      gangs: player.gangs.map((gang) => ({ ...gang })),
    })),
  };
}

function simulateClaimMeld(
  state: GameState,
  seat: Seat,
  kind: 'pong' | 'exposed-kong',
): { state: GameState; concealed: NormalTile[]; melds: Meld[] } | null {
  const pending = state.pendingDiscard;
  const player = state.players[seat];
  if (pending === null || player === undefined) return null;
  const simulated = cloneForClaim(state);
  const simulatedPlayer = simulated.players[seat]!;
  const amount = kind === 'pong' ? 2 : 3;
  simulatedPlayer.concealedTiles = removeTiles(simulatedPlayer.concealedTiles, pending.tile, amount);
  simulatedPlayer.melds.push({ kind, tile: pending.tile, fromSeat: pending.discarder });
  const discarder = simulated.players[pending.discarder]!;
  const discardIndex = discarder.discards.lastIndexOf(pending.tile);
  if (discardIndex >= 0) discarder.discards.splice(discardIndex, 1);
  return {
    state: simulated,
    concealed: simulatedPlayer.concealedTiles,
    melds: simulatedPlayer.melds,
  };
}

export interface ClaimEvaluation {
  accept: boolean;
  scoreDelta: number;
  before: HandEvaluation;
  after: HandEvaluation;
  reason: string;
}

export function evaluatePongClaim(state: GameState, seat: Seat): ClaimEvaluation | null {
  const simulation = simulateClaimMeld(state, seat, 'pong');
  if (simulation === null) return null;
  const before = evaluateHand(state, seat);
  const uniqueDiscards = [...new Set(simulation.concealed)];
  const afterOptions = uniqueDiscards.map((tile) =>
    evaluateHand(
      simulation.state,
      seat,
      removeTiles(simulation.concealed, tile, 1),
      simulation.melds,
    ),
  );
  const after = afterOptions.sort((left, right) =>
    scoreHandEvaluation(right) - scoreHandEvaluation(left),
  )[0] ?? evaluateHand(simulation.state, seat, simulation.concealed, simulation.melds);
  const scoreDelta = scoreHandEvaluation(after) - scoreHandEvaluation(before);
  const structureGain = (after.allPungsPotential - before.allPungsPotential) * 20;
  const adjustedDelta = Math.round(scoreDelta + structureGain);
  const accept = after.shanten <= before.shanten && adjustedDelta >= -6;
  return {
    accept,
    scoreDelta: adjustedDelta,
    before,
    after,
    reason: accept
      ? `碰后不增加向听，综合收益 ${adjustedDelta}`
      : `碰后效率下降，综合收益 ${adjustedDelta}，选择过牌`,
  };
}

export function evaluateExposedKongClaim(state: GameState, seat: Seat): ClaimEvaluation | null {
  const simulation = simulateClaimMeld(state, seat, 'exposed-kong');
  if (simulation === null) return null;
  const before = evaluateHand(state, seat);
  const after = evaluateHand(simulation.state, seat, simulation.concealed, simulation.melds);
  const scoreDelta = scoreHandEvaluation(after) - scoreHandEvaluation(before) + 8;
  const accept = state.wall.drawIndex <= state.wall.replacementIndex && after.shanten <= before.shanten;
  return {
    accept,
    scoreDelta,
    before,
    after,
    reason: accept
      ? `明杠保留手牌效率并获得杠分，综合收益 ${scoreDelta}`
      : `明杠会降低牌型效率或已无补牌，选择过牌`,
  };
}

function chooseSelfKong(input: AiPolicyInput): AiPolicyChoice | null {
  const kongActions = input.legalActions.filter(
    (action) => action.type === 'concealed-kong' || action.type === 'supplement-kong',
  ).sort((left, right) =>
    Number(right.type === 'supplement-kong') - Number(left.type === 'supplement-kong'),
  );
  if (kongActions.length === 0) return null;
  const bestDiscard = rankStrategicDiscards(input.state, input.seat)[0];
  const baselineShanten = bestDiscard?.hand.shanten ?? evaluateHand(input.state, input.seat).shanten;

  for (const action of kongActions) {
    if (action.type === 'supplement-kong') {
      return {
        action,
        reason: '补杠即时获得 1 分且可从墙尾补牌',
      };
    }
    const afterState = applyAction(input.state, action);
    const afterHand = evaluateHand(afterState, input.seat);
    if (afterHand.shanten <= baselineShanten) {
      return {
        action,
        reason: `暗杠不增加向听（${afterHand.shanten} 向听）并保留补牌机会`,
      };
    }
  }
  return null;
}

export const strategicAiPolicy: AiPolicy = {
  id: 'strategic-v1',
  choose(input) {
    const win = actionOf(input.legalActions, 'win');
    if (win !== null) {
      return { action: win, reason: input.turnKind === 'claim' ? '接受合法点炮胡' : '接受合法自摸胡' };
    }

    const mouth = actionOf(input.legalActions, 'declare-mouth');
    if (mouth !== null) {
      return { action: mouth, reason: '三财以上且已经听牌，报嘴以解锁点炮并固定听口' };
    }

    const selfKong = chooseSelfKong(input);
    if (selfKong !== null) return selfKong;

    if (input.turnKind === 'claim') {
      const exposedKong = actionOf(input.legalActions, 'exposed-kong');
      if (exposedKong !== null) {
        const evaluation = evaluateExposedKongClaim(input.state, input.seat);
        if (evaluation?.accept) return { action: exposedKong, reason: evaluation.reason };
      }

      const pong = actionOf(input.legalActions, 'pong');
      if (pong !== null) {
        const evaluation = evaluatePongClaim(input.state, input.seat);
        if (evaluation?.accept) return { action: pong, reason: evaluation.reason };
      }

      const pass = actionOf(input.legalActions, 'pass');
      if (pass !== null) return { action: pass, reason: '鸣牌收益不足，保留当前手牌并过牌' };
    }

    const discardChoice = strategicDiscardPolicy.choose(input);
    if (discardChoice !== null) return discardChoice;
    return basicAiPolicy.choose(input);
  },
};
