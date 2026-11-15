import { describe, expect, it } from 'vitest';
import {
  analyzeCoach,
  createCoachReview,
  formatCoachPercent,
  needsCoachRiskConfirmation,
  showsCoachRisk,
  type CoachAnalysis,
} from './coach.js';
import { createGame } from './game.js';
import { rankStrategicDiscards } from './ai-strategy.js';
import type { GameState } from './types.js';

function riskyState(seed = 5): GameState {
  const state = createGame({ seed, dealerSeat: 0 });
  state.players[1]!.fortuneCount = 1;
  return state;
}

function opponent(analysis: CoachAnalysis, seat: 1 | 2 | 3) {
  const entry = analysis.opponents.find((candidate) => candidate.seat === seat);
  if (entry === undefined) throw new Error(`missing opponent ${seat}`);
  return entry;
}

describe('教练公开信息风险', () => {
  it('只有具备接炮资格的对手会贡献风险，三家无资格时归零', () => {
    const noFortune = createGame({ seed: 7, dealerSeat: 0 });
    for (const player of noFortune.players) player.fortuneCount = 0;
    const zero = analyzeCoach(noFortune, 0);
    expect(zero.maxRisk).toBe(0);
    expect(zero.handRisks).toEqual([]);

    const state = riskyState();
    const analysis = analyzeCoach(state, 0);
    expect(opponent(analysis, 1).canRon).toBe(true);
    expect(opponent(analysis, 1).status).toBe('can-ron');
    expect(opponent(analysis, 2).canRon).toBe(false);
    expect(opponent(analysis, 3).canRon).toBe(false);
    expect(analysis.maxRisk).toBeGreaterThan(0);
  });

  it('副露不降低风险，对手现物和已见张数不增加风险', () => {
    const base = riskyState(9);
    const baseAnalysis = analyzeCoach(base, 0);
    const target =
      baseAnalysis.handRisks.find((entry) => entry.tile !== 'm1')?.tile ??
      baseAnalysis.handRisks[0]!.tile;
    const baseRisk = baseAnalysis.handRisks.find((entry) => entry.tile === target)!;

    const melded = structuredClone(base);
    melded.players[1]!.melds.push({ kind: 'pong', tile: 'm1', fromSeat: 0 });
    const meldRisk = analyzeCoach(melded, 0).handRisks.find((entry) => entry.tile === target)!;
    expect(meldRisk.probability).toBeGreaterThanOrEqual(baseRisk.probability);

    const genbutsu = structuredClone(base);
    genbutsu.players[1]!.discards.push(target);
    const genbutsuRisk = analyzeCoach(genbutsu, 0).handRisks.find(
      (entry) => entry.tile === target,
    )!;
    expect(genbutsuRisk.probability).toBeLessThanOrEqual(baseRisk.probability);

    const seen = structuredClone(base);
    seen.players[2]!.discards.push(target, target);
    const seenRisk = analyzeCoach(seen, 0).handRisks.find((entry) => entry.tile === target)!;
    expect(seenRisk.probability).toBeLessThanOrEqual(baseRisk.probability);
  });

  it('已报嘴显示听牌中，三财未报嘴仍可先报嘴再接炮', () => {
    const state = riskyState(11);
    state.players[1]!.mouthDeclared = true;
    state.players[2]!.fortuneCount = 3;
    const analysis = analyzeCoach(state, 0);
    expect(opponent(analysis, 1)).toMatchObject({
      status: 'declared',
      canRon: true,
      tenpaiProbability: 1,
    });
    expect(opponent(analysis, 2)).toMatchObject({
      status: 'mouth-required',
      canRon: true,
    });
  });

  it('只改对手暗手和未公开牌山顺序，分析结果完全不变', () => {
    const state = riskyState(13);
    const before = analyzeCoach(state, 0);
    const shuffled = structuredClone(state);
    shuffled.players[1]!.concealedTiles.reverse();
    shuffled.players[2]!.concealedTiles.reverse();
    shuffled.players[3]!.concealedTiles.reverse();
    shuffled.wall.tiles.reverse();
    expect(analyzeCoach(shuffled, 0)).toEqual(before);
  });
});

describe('教练点评与显示', () => {
  it('点评给出实际牌与教练候选的向听、进张和风险', () => {
    const state = createGame({ seed: 3, dealerSeat: 0 });
    state.players[1]!.fortuneCount = 1;
    const ranked = rankStrategicDiscards(state, 0);
    expect(ranked.length).toBeGreaterThan(1);

    const same = createCoachReview(state, 0, ranked[0]!.tile);
    expect(same).not.toBeNull();
    expect(same!.actual.tile).toBe(same!.coach.tile);
    expect(same!.summary).toContain('和教练一致');

    const other = createCoachReview(state, 0, ranked[1]!.tile);
    expect(other).not.toBeNull();
    expect(other!.summary.length).toBeGreaterThan(5);
    expect(other!.actual.shanten).toBeGreaterThanOrEqual(-1);
    expect(other!.coach.risk).toBeGreaterThanOrEqual(0);
  });

  it('百分比不到 1 显示 <1%，其余取整', () => {
    expect(formatCoachPercent(0)).toBe('0%');
    expect(formatCoachPercent(0.004)).toBe('<1%');
    expect(formatCoachPercent(0.01)).toBe('1%');
    expect(formatCoachPercent(0.126)).toBe('13%');
  });

  it('角标从 5% 开始，10% 起需要二次确认', () => {
    expect(showsCoachRisk(0.049)).toBe(false);
    expect(showsCoachRisk(0.05)).toBe(true);
    expect(needsCoachRiskConfirmation(0.099)).toBe(false);
    expect(needsCoachRiskConfirmation(0.1)).toBe(true);
  });
});
