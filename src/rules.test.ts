import { describe, expect, it } from 'vitest';
import {
  calculateFan,
  canDeclareMouth,
  canWinOnDiscard,
  canWinOnSelfDraw,
  getWaitingTiles,
  isAllPungs,
  isPureSuit,
  isWinningHand,
} from './rules.js';

const pungsWithPair = [
  'm1', 'm1', 'm1',
  'm2', 'm2', 'm2',
  'm3', 'm3', 'm3',
  'p1', 'p1', 'p1',
  's1', 's1',
] as const;

describe('胡牌、番种与报嘴判定', () => {
  it('支持标准牌型、碰碰胡和红中/白板刻子', () => {
    expect(isWinningHand(pungsWithPair)).toBe(true);
    expect(isAllPungs(pungsWithPair)).toBe(true);
    expect(calculateFan({ concealedTiles: pungsWithPair, melds: [], fortuneCount: 2 })).toEqual({
      total: 3,
      items: [
        { name: '碰碰胡', fan: 1 },
        { name: '发财', fan: 2 },
      ],
    });

    const honorHand = [
      'm1', 'm1', 'm1',
      'm2', 'm2', 'm2',
      'm3', 'm3', 'm3',
      'red', 'red', 'red',
      'white', 'white',
    ] as const;
    expect(isWinningHand(honorHand)).toBe(true);
    expect(isAllPungs(honorHand)).toBe(true);
    expect(isPureSuit(honorHand)).toBe(false);
  });

  it('清一色只接受单一序数花色，不接受红中/白板', () => {
    const pure = [
      'm1', 'm2', 'm3',
      'm4', 'm5', 'm6',
      'm7', 'm8', 'm9',
      'm1', 'm1', 'm1',
      'm2', 'm2',
    ] as const;
    expect(isWinningHand(pure)).toBe(true);
    expect(isPureSuit(pure)).toBe(true);
    expect(calculateFan({ concealedTiles: pure, melds: [], fortuneCount: 0 }).total).toBe(1);

    const mixed = [...pure.slice(0, 12), 'red', 'red'] as const;
    expect(isWinningHand(mixed)).toBe(true);
    expect(isPureSuit(mixed)).toBe(false);
  });

  it('支持多面听，发财不作为胡牌张', () => {
    const waiting = [
      'm1', 'm2', 'm3',
      'm4', 'm5', 'm6',
      'm7', 'm8', 'm9',
      'p1', 'p1', 'p2', 'p2',
    ] as const;
    expect(getWaitingTiles(waiting)).toEqual(['p1', 'p2']);
    expect(getWaitingTiles(waiting)).not.toContain('fortune');
  });

  it('三张以上发财未报嘴可自摸，但不能点炮；报嘴后按固定听口', () => {
    const before = [...pungsWithPair.slice(0, 13)];
    const unreported = {
      fortuneCount: 3,
      mouthDeclared: false,
      lockedWaits: [],
      mouthRequired: true,
    } as const;
    expect(canWinOnSelfDraw(before, [], unreported, 's1')).toBe(true);
    expect(canWinOnDiscard(before, [], unreported, 's1')).toBe(false);
    expect(canDeclareMouth(before, [], 3, false)).toBe(true);

    const reported = {
      fortuneCount: 3,
      mouthDeclared: true,
      lockedWaits: ['s1'] as const,
      mouthRequired: false,
    } as const;
    expect(canWinOnSelfDraw(before, [], reported, 's1')).toBe(true);
    expect(canWinOnSelfDraw(before, [], reported, 'm1')).toBe(false);
    expect(canWinOnDiscard(before, [], reported, 's1')).toBe(true);
  });
});
