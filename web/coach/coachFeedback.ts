import type { AiDifficulty } from '../../src/ai-difficulty.ts';
import type { CoachGameReview } from './gameReview';

export const COACH_FEEDBACK_KEY = 'play-mahjong.coach-feedback.v1';

export type CoachFeedbackVerdict = 'useful' | 'unclear';

export interface CoachFeedbackRecord {
  version: 1;
  createdAt: string;
  difficulty: AiDifficulty;
  verdict: CoachFeedbackVerdict;
  reviewedDiscards: number;
  coachDisagreements: number;
  losses: number;
  averageRisk: number;
}

export interface CoachFeedbackStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CoachFeedbackContext {
  difficulty: AiDifficulty;
  review: CoachGameReview;
  now?: Date;
}

function isRecord(value: unknown): value is CoachFeedbackRecord {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.createdAt === 'string' &&
    (record.difficulty === 'casual' ||
      record.difficulty === 'standard' ||
      record.difficulty === 'advanced') &&
    (record.verdict === 'useful' || record.verdict === 'unclear') &&
    typeof record.reviewedDiscards === 'number' &&
    typeof record.coachDisagreements === 'number' &&
    typeof record.losses === 'number' &&
    typeof record.averageRisk === 'number'
  );
}

export function loadCoachFeedback(storage: CoachFeedbackStorage | null): CoachFeedbackRecord[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(COACH_FEEDBACK_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

export function createCoachFeedbackRecord(
  verdict: CoachFeedbackVerdict,
  context: CoachFeedbackContext,
): CoachFeedbackRecord {
  return {
    version: 1,
    createdAt: (context.now ?? new Date()).toISOString(),
    difficulty: context.difficulty,
    verdict,
    reviewedDiscards: context.review.reviewedDiscards,
    coachDisagreements: context.review.improvements,
    losses: context.review.losses,
    averageRisk: Number(context.review.averageRisk.toFixed(6)),
  };
}

export function appendCoachFeedback(
  storage: CoachFeedbackStorage | null,
  record: CoachFeedbackRecord,
): boolean {
  if (storage === null) return false;
  try {
    const records = [...loadCoachFeedback(storage), record];
    storage.setItem(COACH_FEEDBACK_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function formatCoachFeedbackExport(records: readonly CoachFeedbackRecord[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      note: '本地教练反馈，仅含整局统计，不含手牌、牌山或恢复令牌。',
      records,
    },
    null,
    2,
  );
}
