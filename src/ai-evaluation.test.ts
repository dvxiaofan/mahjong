import { describe, expect, it } from 'vitest';
import { createGame } from './game.js';
import {
  calculateShanten,
  evaluateDiscardChoices,
  evaluateHand,
} from './ai-evaluation.js';

const completeHand = [
  'm1', 'm1', 'm1',
  'm2', 'm2', 'm2',
  'm3', 'm3', 'm3',
  'p1', 'p1', 'p1',
  's1', 's1',
] as const;

describe('AI 手牌评估', () => {
  it('计算标准牌型向听数：成胡为 -1，听牌为 0', () => {
    expect(calculateShanten(completeHand)).toBe(-1);
    expect(calculateShanten(completeHand.slice(0, 13))).toBe(0);
  });

  it('列出有效进张及可见剩余张数', () => {
    const state = createGame({ seed: 1 });
    state.players[0]!.concealedTiles = [...completeHand.slice(0, 13)];
    state.players[0]!.fortuneCount = 2;
    state.players[1]!.discards = ['s1'];

    const hand = evaluateHand(state, 0);
    expect(hand.shanten).toBe(0);
    expect(hand.waitingTiles).toEqual(['s1']);
    expect(hand.effectiveTiles).toContainEqual({ tile: 's1', remaining: 2, nextShanten: -1 });
    expect(hand.fortuneFan).toBe(2);
  });

  it('评估不读取对手暗手', () => {
    const state = createGame({ seed: 2 });
    const before = evaluateHand(state, 0);
    state.players[1]!.concealedTiles = Array.from({ length: 13 }, () => 'm1' as const);
    state.players[2]!.concealedTiles = Array.from({ length: 13 }, () => 'p9' as const);
    const after = evaluateHand(state, 0);
    expect(after).toEqual(before);
  });

  it('为每个合法弃牌生成排序后的解释性评分', () => {
    const state = createGame({ seed: 20260905 });
    const choices = evaluateDiscardChoices(state, 0);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((choice) => choice.reasons.length >= 2)).toBe(true);
    expect(choices.every((choice, index) => index === 0 || choices[index - 1]!.score >= choice.score))
      .toBe(true);
  });
});
