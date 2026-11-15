import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGame, getLegalActions } from '../../src/game.ts';
import { replayRecordedActions, type RecordedAction } from '../localSession';
import { buildCoachGameReview } from './gameReview';

describe('教练整局点评', () => {
  it('只分析本家人类出牌，并给出分类统计与最值得复盘的出牌', () => {
    const initial = createGame({ seed: 63, dealerSeat: 0 });
    const discard = getLegalActions(initial, 0).find((action) => action.type === 'discard');
    if (discard === undefined) throw new Error('missing discard');
    const records: RecordedAction[] = [
      { action: discard, source: 'human' },
      { action: { type: 'pass', seat: 1 }, source: 'bot' },
      { action: { type: 'pass', seat: 2 }, source: 'bot' },
      { action: { type: 'pass', seat: 3 }, source: 'bot' },
      { action: { type: 'draw', seat: 1 }, source: 'bot' },
    ];
    const review = buildCoachGameReview({
      initialState: initial,
      records,
      viewerSeat: 0,
      difficulty: 'standard',
    });
    expect(review).not.toBeNull();
    expect(review!.reviewedDiscards).toBe(1);
    expect(review!.same + review!.safer + review!.improvements + review!.losses).toBe(
      review!.reviewedDiscards,
    );
    expect(review!.summary).toContain('整局 1 次出牌');
    expect(review!.averageRisk).toBeGreaterThanOrEqual(0);
  });

  it('记录和初始局面不一致时安全返回空结果', () => {
    const initial = createGame({ seed: 3, dealerSeat: 0 });
    expect(
      buildCoachGameReview({
        initialState: initial,
        records: [{ action: { type: 'win', seat: 2 }, source: 'bot' }],
        viewerSeat: 0,
        difficulty: 'standard',
      }),
    ).toBeNull();
  });

  it('终局牌谱中别家点炮不会误记为本家放炮', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL('../../e2e/fixtures/completed-local-session.json', import.meta.url),
        'utf8',
      ),
    ) as {
      seed: number;
      roundNumber: number;
      dealerSource: 'initial-dice';
      records: RecordedAction[];
    };
    const initialState = replayRecordedActions(fixture.seed, fixture.records, 0, {
      roundNumber: fixture.roundNumber,
    });
    const result = replayRecordedActions(fixture.seed, fixture.records, fixture.records.length, {
      roundNumber: fixture.roundNumber,
    }).result;
    if (result === null) throw new Error('fixture missing result');

    const review = buildCoachGameReview({
      initialState,
      records: fixture.records,
      viewerSeat: 0,
      difficulty: 'standard',
      result,
    });
    expect(review).not.toBeNull();
    expect(review!.reviewedDiscards).toBe(15);
    expect(review!.losses).toBe(0);
    expect(review!.top[0]?.step).toBe(255);
  });
});
