import { describe, expect, it } from 'vitest';
import { createGame, getLegalActions } from './game.js';
import {
  classifyAiTurn,
  decideAiAction,
  type AiPolicy,
} from './ai.js';

describe('AI 合法动作代理', () => {
  it('基础策略返回带原因的合法动作', () => {
    const state = createGame({ seed: 20260905 });
    const decision = decideAiAction(state, 0);
    expect(decision).not.toBeNull();
    expect(decision?.source).toBe('policy');
    expect(decision?.reason.length).toBeGreaterThan(0);
    expect(getLegalActions(state, 0)).toContainEqual(decision?.action);
    expect(decision?.turnKind).toBe('self-action');
  });

  it('策略返回非法动作时在响应阶段安全过牌', () => {
    const state = createGame({ seed: 1 });
    state.phase = 'claiming';
    state.pendingDiscard = { tile: 'm1', discarder: 0, responses: {} };
    const invalidPolicy: AiPolicy = {
      id: 'invalid-test',
      choose: () => ({ action: { type: 'win', seat: 1 }, reason: '故意非法' }),
    };

    const decision = decideAiAction(state, 1, invalidPolicy);
    expect(decision).toMatchObject({
      action: { type: 'pass', seat: 1 },
      source: 'fallback',
      policyId: 'invalid-test',
    });
    expect(getLegalActions(state, 1)).toContainEqual(decision?.action);
  });

  it('策略抛错时仍返回合法动作', () => {
    const state = createGame({ seed: 2 });
    const throwingPolicy: AiPolicy = {
      id: 'throw-test',
      choose: () => { throw new Error('测试异常'); },
    };
    const decision = decideAiAction(state, 0, throwingPolicy);
    expect(decision?.source).toBe('fallback');
    expect(getLegalActions(state, 0)).toContainEqual(decision?.action);
  });

  it('无合法动作和终局状态不会捏造动作', () => {
    const state = createGame({ seed: 3 });
    expect(decideAiAction(state, 1)).toBeNull();
    state.phase = 'finished';
    expect(classifyAiTurn(state)).toBe('terminal');
    expect(decideAiAction(state, 0)).toBeNull();
  });
});
