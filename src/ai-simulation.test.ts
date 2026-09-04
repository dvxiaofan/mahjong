import { describe, expect, it } from 'vitest';
import { runAiSimulation } from './ai-simulation.js';

describe('AI 批量整局模拟', () => {
  it('多种难度均可完成整局并保持零和计分', () => {
    for (const difficulty of ['casual', 'standard', 'advanced'] as const) {
      const summary = runAiSimulation({ games: 1, seed: 20260905, difficulty });
      expect(summary.completedGames).toBe(1);
      expect(summary.wins + summary.draws).toBe(1);
      expect(summary.scoreSum).toBe(0);
      expect(summary.averageActions).toBeGreaterThan(0);
    }
  }, 30_000);

  it('相同输入的批量结果可复现', () => {
    const options = { games: 1, seed: 77, difficulty: 'standard' as const };
    expect(runAiSimulation(options)).toEqual(runAiSimulation(options));
  }, 30_000);

  it('进阶难度的最优弃牌选择率高于休闲难度', () => {
    const casual = runAiSimulation({ games: 1, seed: 310, difficulty: 'casual' });
    const advanced = runAiSimulation({ games: 1, seed: 310, difficulty: 'advanced' });
    expect(advanced.optimalDiscardRate).toBe(1);
    expect(casual.optimalDiscardRate).toBeLessThan(advanced.optimalDiscardRate);
  }, 30_000);
});
