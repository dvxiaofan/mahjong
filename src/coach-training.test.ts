import { describe, expect, it } from 'vitest';
import { COACH_FEATURE_COUNT } from './coach-risk.js';
import { buildCoachDataset } from './coach-training.js';

describe('教练拟合数据', () => {
  it('完整对局会产生公开特征样本和听牌表计数', () => {
    const dataset = buildCoachDataset({
      difficulty: 'advanced',
      games: 2,
      seed: 91,
      sampleLimit: 8000,
    });
    expect(dataset.completedGames).toBe(2);
    expect(dataset.candidates).toBeGreaterThan(0);
    expect(dataset.samples).toBeGreaterThan(0);
    expect(dataset.rows).toHaveLength(dataset.samples * COACH_FEATURE_COUNT);
    expect(dataset.labels).toHaveLength(dataset.samples);
    expect(dataset.labels.every((label) => label === 0 || label === 1)).toBe(true);
    expect(dataset.tenpaiCounts.some((count) => count > 0)).toBe(true);
  }, 30_000);
});
