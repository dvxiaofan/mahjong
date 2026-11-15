import { describe, expect, it } from 'vitest';
import { createGame, getLegalActions } from './game.js';
import {
  COACH_FEATURE_COUNT,
  COACH_FEATURE_NAMES,
  coachRiskModel,
  estimateOpponentRonRisk,
  estimateOpponentTenpai,
  extractCoachFeatures,
  predictCoachFeatures,
} from './coach-risk.js';
import { COACH_RISK_MODELS, COACH_TENPAI_TABLES } from './coach-risk-coefficients.js';
import { projectStateForSeat } from './view.js';
import type { AiDifficulty } from './ai-difficulty.js';
import { tileLabel } from './tiles.js';
import type { PublicPlayerView } from './types.js';

const difficulties: readonly AiDifficulty[] = ['casual', 'standard', 'advanced'];

function publicOpponent(state = createGame({ seed: 41, dealerSeat: 0 })) {
  const view = projectStateForSeat(state, 0);
  return { state, view, opponent: view.players[1] as PublicPlayerView };
}

describe('教练拟合风险模型', () => {
  it('三档模型的特征数量、名称和策略编号一致', () => {
    for (const difficulty of difficulties) {
      const model = COACH_RISK_MODELS[difficulty];
      expect(model.weights).toHaveLength(COACH_FEATURE_COUNT);
      expect(model.featureNames).toEqual(COACH_FEATURE_NAMES);
      expect(model.strategyId).toBe(`difficulty-${difficulty}-v1`);
      expect(model.calibration.knots.length).toBeGreaterThan(0);
      expect(
        model.calibration.knots.every(
          (knot, index, knots) =>
            knot.probability >= 0 &&
            knot.probability <= 1 &&
            (index === 0 || knot.score >= knots[index - 1]!.score) &&
            (index === 0 || knot.probability >= knots[index - 1]!.probability),
        ),
      ).toBe(true);
    }
  });

  it('特征只使用公开信息，并覆盖现物、同门弃牌和已见张数', () => {
    const { state, view, opponent } = publicOpponent();
    const tile = getLegalActions(state, 0).find((action) => action.type === 'discard')!.tile;
    const marked = { ...opponent, discards: [...opponent.discards, tile, tile] };
    const features = extractCoachFeatures(view, marked, tile);
    expect(features).toHaveLength(COACH_FEATURE_COUNT);
    expect(features[COACH_FEATURE_NAMES.indexOf('genbutsu')]).toBe(1);
    expect(() => extractCoachFeatures(view, view.players[0]!, tile)).toThrow('只估计其他座位');
  });

  it('零财对手风险为零，模型输出始终在合法概率范围内', () => {
    const { state, view, opponent } = publicOpponent();
    opponent.fortuneCount = 0;
    const tile = getLegalActions(state, 0).find((action) => action.type === 'discard')!.tile;
    expect(estimateOpponentRonRisk(view, opponent, tile, 'standard')).toBe(0);

    opponent.fortuneCount = 2;
    for (const difficulty of difficulties) {
      const probability = estimateOpponentRonRisk(view, opponent, tile, difficulty);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(0.99);
      const tenpai = estimateOpponentTenpai(view, opponent, difficulty);
      expect(tenpai).toBeGreaterThanOrEqual(0);
      expect(tenpai).toBeLessThanOrEqual(0.99);
    }
  });

  it('校准后的预测对同一特征向量保持确定', () => {
    const { state, view, opponent } = publicOpponent();
    const tile = getLegalActions(state, 0).find((action) => action.type === 'discard')!.tile;
    opponent.fortuneCount = 2;
    const features = extractCoachFeatures(view, opponent, tile);
    const model = coachRiskModel('advanced');
    const first = predictCoachFeatures(features, model);
    const second = predictCoachFeatures(features, model);
    expect(second).toBe(first);
    expect(COACH_TENPAI_TABLES.advanced.probabilities.flat(2).every((p) => p >= 0 && p <= 1)).toBe(
      true,
    );
    expect(tileLabel(tile).length).toBeGreaterThan(1);
  });
});
