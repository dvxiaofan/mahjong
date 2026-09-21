import { describe, expect, it } from 'vitest';
import { NORMAL_TILE_TYPES, SUITS, type NormalTile } from './tiles.js';
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
  'm1',
  'm1',
  'm1',
  'm2',
  'm2',
  'm2',
  'm3',
  'm3',
  'm3',
  'p1',
  'p1',
  'p1',
  's1',
  's1',
] as const;

function sequencesAwayFrom(tile: NormalTile): NormalTile[] {
  const suits = SUITS.filter((suit) => suit !== tile[0]);
  return [
    ...[1, 2, 3, 4, 5, 6].map((rank) => `${suits[0]}${rank}` as NormalTile),
    ...[7, 8, 9].map((rank) => `${suits[1]}${rank}` as NormalTile),
  ];
}

describe('每种牌最多四张的胡牌与听牌约束', () => {
  it.each(NORMAL_TILE_TYPES)('%s 暗手已有四张时不能听第五张或据此报嘴', (tile) => {
    const before = [tile, tile, tile, tile, ...sequencesAwayFrom(tile)];
    expect(isWinningHand([...before, tile])).toBe(false);
    expect(getWaitingTiles(before)).toEqual([]);
    expect(canDeclareMouth(before, [], 3, false)).toBe(false);
  });

  it.each(NORMAL_TILE_TYPES)('%s 碰牌加暗手共四张时不能把第五张算作将牌', (tile) => {
    const before = [tile, ...sequencesAwayFrom(tile)];
    const melds = [{ kind: 'pong' as const, tile, fromSeat: 1 as const }];
    expect(isWinningHand([...before, tile], melds)).toBe(false);
    expect(getWaitingTiles(before, melds)).toEqual([]);
    expect(canDeclareMouth(before, melds, 3, false)).toBe(false);
  });

  it('杠中的四张也计入上限，但合法第四张仍可组成顺子', () => {
    const before = ['m1', 'm3', 'p1', 'p2', 'p3', 's7', 's8', 's9', 'white', 'white'] as const;
    expect(getWaitingTiles(before, [{ kind: 'concealed-kong', tile: 'm2' }])).toEqual([]);
    expect(getWaitingTiles(before, [{ kind: 'pong', tile: 'm2', fromSeat: 1 }])).toEqual(['m2']);
    expect(isWinningHand([...before, 'm2'], [{ kind: 'pong', tile: 'm2', fromSeat: 1 }])).toBe(
      true,
    );
  });

  it('截图中的三条和七条按真实牌值区分，不把三八九条算作顺子', () => {
    const common = [
      'm4',
      'm5',
      'm6',
      'm7',
      'p5',
      'p6',
      'p6',
      'p7',
      'p7',
      'p8',
      's8',
      's9',
    ] as const;
    expect(getWaitingTiles([...common, 's3'])).toEqual([]);
    expect(getWaitingTiles([...common, 's7'])).toEqual(['m4', 'm7']);
    expect(isWinningHand([...common, 's3', 'm7'])).toBe(false);
    expect(isWinningHand([...common, 's7', 'm7'])).toBe(true);
  });
});

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

    const purePungs = [
      'm1',
      'm1',
      'm1',
      'm2',
      'm2',
      'm2',
      'm3',
      'm3',
      'm3',
      'm4',
      'm4',
      'm4',
      'm5',
      'm5',
    ] as const;
    expect(calculateFan({ concealedTiles: purePungs, melds: [], fortuneCount: 3 })).toEqual({
      total: 5,
      items: [
        { name: '碰碰胡', fan: 1 },
        { name: '清一色', fan: 1 },
        { name: '发财', fan: 3 },
      ],
    });

    const honorHand = [
      'm1',
      'm1',
      'm1',
      'm2',
      'm2',
      'm2',
      'm3',
      'm3',
      'm3',
      'red',
      'red',
      'red',
      'white',
      'white',
    ] as const;
    expect(isWinningHand(honorHand)).toBe(true);
    expect(isAllPungs(honorHand)).toBe(true);
    expect(isPureSuit(honorHand)).toBe(false);
  });

  it('清一色只接受单一序数花色，不接受红中/白板', () => {
    const pure = [
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
      'm8',
      'm9',
      'm1',
      'm1',
      'm1',
      'm2',
      'm2',
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
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
      'm8',
      'm9',
      'p1',
      'p1',
      'p2',
      'p2',
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

    expect(
      canWinOnDiscard(
        before,
        [],
        {
          fortuneCount: 0,
          mouthDeclared: false,
          lockedWaits: [],
          mouthRequired: false,
        },
        's1',
      ),
    ).toBe(false);
  });
});
