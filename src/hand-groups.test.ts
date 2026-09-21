import { describe, expect, it } from 'vitest';
import { calculateFan, getWinningHandGroups, isWinningHand, type HandGroup } from './rules.js';
import { NORMAL_TILE_TYPES, SUITS, sortTiles, type NormalTile } from './tiles.js';
import type { Meld } from './types.js';

function expectComplete(
  groups: HandGroup[],
  concealed: readonly NormalTile[],
  melds: readonly Meld[] = [],
) {
  expect(groups).toHaveLength(5);
  expect(groups.filter((group) => group.kind === 'pair')).toHaveLength(1);
  expect(groups.at(-1)?.kind).toBe('pair');
  const actual = groups.flatMap((group) => group.tiles);
  const original = [
    ...concealed,
    ...melds.flatMap((meld) =>
      Array.from({ length: meld.kind === 'pong' ? 3 : 4 }, () => meld.tile),
    ),
  ];
  expect(sortTiles(actual)).toEqual(sortTiles(original));
  for (const group of groups) {
    if (group.kind === 'sequence') {
      expect(group.tiles).toHaveLength(3);
      const [first, second, third] = group.tiles;
      expect([second![0], third![0]]).toEqual([first![0], first![0]]);
      expect([Number(second![1]), Number(third![1])]).toEqual([
        Number(first![1]) + 1,
        Number(first![1]) + 2,
      ]);
    } else {
      expect(new Set(group.tiles).size).toBe(1);
      expect(group.tiles).toHaveLength(
        group.kind === 'pair' ? 2 : group.kind.includes('kong') ? 4 : 3,
      );
    }
  }
}

describe('胡牌分组与判定共用同一搜索', () => {
  it.each(NORMAL_TILE_TYPES)('%s 作将时返回完整的四组面子，不增加或丢失实体牌', (tile) => {
    const sequences = SUITS.flatMap((suit) =>
      [1, 4, 7].map((start) =>
        [start, start + 1, start + 2].map((rank) => `${suit}${rank}` as NormalTile),
      ),
    );
    const hand = [
      ...sequences
        .filter((group) => !group.includes(tile))
        .slice(0, 4)
        .flat(),
      tile,
      tile,
    ];
    expect(isWinningHand(hand)).toBe(true);
    expectComplete(getWinningHandGroups(hand)!, hand);
    expect(getWinningHandGroups(hand)!.at(-1)?.tiles).toEqual([tile, tile]);
  });

  it.each(NORMAL_TILE_TYPES)('%s 作将的碰碰胡拆分与计番一致', (tile) => {
    const hand = [
      ...NORMAL_TILE_TYPES.filter((value) => value !== tile)
        .slice(0, 4)
        .flatMap((value) => [value, value, value]),
      tile,
      tile,
    ];
    const groups = getWinningHandGroups(hand)!;
    expectComplete(groups, hand);
    expect(groups.slice(0, 4).every((group) => group.kind === 'triplet')).toBe(true);
    expect(calculateFan({ concealedTiles: hand, melds: [], fortuneCount: 0 }).items).toContainEqual(
      { name: '碰碰胡', fan: 1 },
    );
  });

  it.each(['pong', 'exposed-kong', 'concealed-kong', 'added-kong'] as const)(
    '%s 保留实体张数和鸣牌类型',
    (kind) => {
      const meld = (
        kind === 'concealed-kong' ? { kind, tile: 'red' } : { kind, tile: 'red', fromSeat: 1 }
      ) as Meld;
      const hand = [
        'm1',
        'm2',
        'm3',
        'p4',
        'p5',
        'p6',
        's7',
        's8',
        's9',
        'white',
        'white',
      ] as const;
      const groups = getWinningHandGroups(hand, [meld])!;
      expectComplete(groups, hand, [meld]);
      expect(groups[0]?.kind).toBe(kind);
    },
  );

  it('多种拆分都可胡时选择与碰碰胡番数一致的一种', () => {
    const hand = [
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
    const groups = getWinningHandGroups(hand)!;
    expectComplete(groups, hand);
    expect(groups.map((group) => group.kind)).toEqual([
      'triplet',
      'triplet',
      'triplet',
      'triplet',
      'pair',
    ]);
  });

  it('截图牌组正确拆成两个重叠筒子顺子，三条版本不生成虚假分组', () => {
    const hand: NormalTile[] = [
      'm4',
      'm5',
      'm6',
      'm7',
      'm7',
      'p5',
      'p6',
      'p6',
      'p7',
      'p7',
      'p8',
      's7',
      's8',
      's9',
    ];
    const groups = getWinningHandGroups(hand)!;
    expectComplete(groups, hand);
    expect(groups).toContainEqual({ kind: 'sequence', tiles: ['p5', 'p6', 'p7'] });
    expect(groups).toContainEqual({ kind: 'sequence', tiles: ['p6', 'p7', 'p8'] });
    hand[11] = 's3';
    expect(getWinningHandGroups(hand)).toBeNull();
  });

  it('缺牌、跨门顺子、第五张同牌和无效鸣牌均没有胡牌拆分', () => {
    expect(getWinningHandGroups(['m1', 'm1'])).toBeNull();
    const hand: NormalTile[] = [
      'm8',
      'm9',
      'p1',
      'p4',
      'p5',
      'p6',
      's7',
      's8',
      's9',
      'red',
      'red',
      'red',
      'white',
      'white',
    ];
    expect(getWinningHandGroups(hand)).toBeNull();
    expect(
      getWinningHandGroups([
        'm1',
        'm1',
        'm1',
        'm1',
        'm1',
        'p1',
        'p2',
        'p3',
        'p4',
        'p5',
        'p6',
        's7',
        's8',
        's9',
      ]),
    ).toBeNull();
    expect(
      getWinningHandGroups(
        ['white', 'white'],
        Array.from({ length: 5 }, () => ({ kind: 'concealed-kong', tile: 'red' })),
      ),
    ).toBeNull();
  });

  it('四副鸣牌也可配将成胡，返回值不会影响下一次搜索', () => {
    const melds: Meld[] = ['m1', 'p1', 's1', 'red'].map((tile) => ({
      kind: 'concealed-kong',
      tile: tile as NormalTile,
    }));
    const groups = getWinningHandGroups(['white', 'white'], melds)!;
    expectComplete(groups, ['white', 'white'], melds);
    groups[0]!.tiles.pop();
    expect(getWinningHandGroups(['white', 'white'], melds)![0]!.tiles).toHaveLength(4);
  });
});
