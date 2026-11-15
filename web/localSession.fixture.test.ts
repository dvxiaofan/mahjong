import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/game.ts';
import {
  replayRecordedActions,
  type LocalDealerSource,
  type RecordedAction,
} from './localSession.ts';

interface CompletedSessionFixture {
  version: 2;
  seed: number;
  roundNumber: number;
  dealerSeat: 0 | 1 | 2 | 3;
  dealerSource: LocalDealerSource;
  records: RecordedAction[];
}

describe('E2E 终局存档', () => {
  it('每个动作都能按原顺序回放并形成终局', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL('../e2e/fixtures/completed-local-session.json', import.meta.url),
        'utf8',
      ),
    ) as CompletedSessionFixture;
    let state = replayRecordedActions(fixture.seed, fixture.records, 0, {
      roundNumber: fixture.roundNumber,
      ...(fixture.dealerSource === 'initial-dice'
        ? {}
        : { dealerSeat: fixture.dealerSeat, dealerSource: fixture.dealerSource }),
    });

    fixture.records.forEach((record, index) => {
      try {
        state = applyAction(state, record.action);
      } catch (error) {
        throw new Error(
          `第 ${index + 1} 步 ${record.action.type} 无法回放：${(error as Error).message}`,
        );
      }
    });

    expect(state.result).not.toBeNull();
    expect(state.result?.outcome).toBe('win');
  });
});
