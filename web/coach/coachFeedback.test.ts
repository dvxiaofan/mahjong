import { describe, expect, it } from 'vitest';
import {
  COACH_FEEDBACK_KEY,
  appendCoachFeedback,
  createCoachFeedbackRecord,
  formatCoachFeedbackExport,
  loadCoachFeedback,
} from './coachFeedback';

const review = {
  reviewedDiscards: 12,
  same: 6,
  safer: 2,
  improvements: 3,
  losses: 1,
  averageRisk: 0.034,
  summary: 'summary',
  top: [],
};

describe('教练真人反馈样本', () => {
  it('反馈只保存整局统计，不包含手牌或牌山', () => {
    const record = createCoachFeedbackRecord('useful', {
      difficulty: 'advanced',
      review,
      now: new Date('2026-11-15T12:00:00.000Z'),
    });
    expect(record).toEqual({
      version: 1,
      createdAt: '2026-11-15T12:00:00.000Z',
      difficulty: 'advanced',
      verdict: 'useful',
      reviewedDiscards: 12,
      coachDisagreements: 3,
      losses: 1,
      averageRisk: 0.034,
    });
    expect(formatCoachFeedbackExport([record])).not.toContain('concealedTiles');
  });

  it('反馈追加和读取可持久化，损坏数据安全忽略', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    };
    const record = createCoachFeedbackRecord('unclear', {
      difficulty: 'standard',
      review,
      now: new Date('2026-11-15T12:00:00.000Z'),
    });
    expect(loadCoachFeedback(storage)).toEqual([]);
    expect(appendCoachFeedback(storage, record)).toBe(true);
    expect(loadCoachFeedback(storage)).toEqual([record]);
    data.set(COACH_FEEDBACK_KEY, JSON.stringify([{ bad: true }]));
    expect(loadCoachFeedback(storage)).toEqual([]);
  });
});
