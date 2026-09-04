import { describe, expect, it } from 'vitest';
import { decideAiAction } from './ai.js';
import { createDifficultyAiPolicy } from './ai-difficulty.js';
import { createGame } from './game.js';
import { seededRandom } from './random.js';

describe('AI 难度策略', () => {
  it('相同难度和随机种子生成可复现决策', () => {
    const state = createGame({ seed: 99 });
    const first = decideAiAction(state, 0, createDifficultyAiPolicy('standard', seededRandom(7)));
    const second = decideAiAction(state, 0, createDifficultyAiPolicy('standard', seededRandom(7)));
    expect(first).toEqual(second);
  });

  it('进阶难度始终选择最高评分弃牌', () => {
    const state = createGame({ seed: 100 });
    const decision = decideAiAction(
      state,
      0,
      createDifficultyAiPolicy('advanced', seededRandom(1)),
    );
    expect(decision?.action).toEqual(decision?.candidates[0]?.action);
  });

  it('休闲难度可稳定选择非最优候选形成差异', () => {
    const state = createGame({ seed: 100 });
    const decision = decideAiAction(
      state,
      0,
      createDifficultyAiPolicy('casual', () => 0.99),
    );
    expect(decision?.candidates.length).toBeGreaterThan(1);
    expect(decision?.action).not.toEqual(decision?.candidates[0]?.action);
  });
});
