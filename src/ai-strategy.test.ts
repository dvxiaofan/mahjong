import { describe, expect, it } from 'vitest';
import { decideAiAction } from './ai.js';
import { createGame } from './game.js';
import { rankStrategicDiscards, strategicDiscardPolicy } from './ai-strategy.js';

describe('AI 出牌策略', () => {
  it('选择评分最高的合法弃牌并给出候选解释', () => {
    const state = createGame({ seed: 20260905 });
    const ranked = rankStrategicDiscards(state, 0);
    const decision = decideAiAction(state, 0, strategicDiscardPolicy);
    expect(decision?.action).toEqual(ranked[0]?.action);
    expect(decision?.reason).toContain('弃牌评分');
    expect(decision?.candidates).toHaveLength(ranked.length);
  });

  it('优先处理孤张字牌，保留对子', () => {
    const state = createGame({ seed: 1 });
    state.currentSeat = 0;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 'white';
    state.players[0]!.concealedTiles = [
      'm1', 'm2', 'm3', 'm4', 'm5', 'm6',
      'p1', 'p2', 'p3', 's1', 's2',
      'red', 'red', 'white',
    ];

    const ranked = rankStrategicDiscards(state, 0);
    expect(ranked[0]?.tile).toBe('white');
    expect(ranked.find((choice) => choice.tile === 'red')?.heuristics).toContain('保留对子结构');
  });

  it('清一色倾向明显时优先清理异色牌', () => {
    const state = createGame({ seed: 2 });
    state.currentSeat = 0;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 'p9';
    state.players[0]!.concealedTiles = [
      'm1', 'm1', 'm2', 'm2', 'm3', 'm3', 'm4',
      'm5', 'm6', 'm7', 'm7', 'm8', 'm9', 'p9',
    ];

    const ranked = rankStrategicDiscards(state, 0);
    expect(ranked[0]?.tile).toBe('p9');
    expect(ranked[0]?.heuristics.some((reason) => reason.includes('清理非'))).toBe(true);
  });

  it('报嘴锁定后遵守规则引擎给出的唯一摸打动作', () => {
    const state = createGame({ seed: 3 });
    state.currentSeat = 0;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 'p9';
    state.players[0]!.mouthDeclared = true;
    state.players[0]!.lockedWaits = ['m1'];
    state.players[0]!.concealedTiles = [
      'm1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3',
      'm3', 'm3', 'p1', 'p1', 'p1', 's1', 'p9',
    ];

    const decision = decideAiAction(state, 0, strategicDiscardPolicy);
    expect(decision?.action).toEqual({ type: 'discard', seat: 0, tile: 'p9' });
  });
});
