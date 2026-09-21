import { describe, expect, it } from 'vitest';
import {
  canWinOnDiscard,
  canWinOnSelfDraw,
  getHandArrangement,
  getWinBlockReason,
  getWinningHandGroups,
  isWinningHand,
  type HandArrangement,
  type WinPlayerContext,
} from './rules.js';
import { sortTiles, type NormalTile } from './tiles.js';
import type { Meld } from './types.js';

const complete: NormalTile[] = [
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
const before = complete.filter((_, index) => index !== 4);
const player: WinPlayerContext = {
  fortuneCount: 1,
  mouthDeclared: false,
  mouthRequired: false,
  lockedWaits: [],
};

function assertConservation(
  arrangement: HandArrangement,
  hand: readonly NormalTile[],
  melds: readonly Meld[] = [],
) {
  expect(
    sortTiles([...arrangement.groups.flatMap((group) => group.tiles), ...arrangement.ungrouped]),
  ).toEqual(
    sortTiles([
      ...hand,
      ...melds.flatMap((meld) =>
        Array.from({ length: meld.kind === 'pong' ? 3 : 4 }, () => meld.tile),
      ),
    ]),
  );
  expect(arrangement.groups.filter((group) => group.kind === 'pair').length).toBeLessThanOrEqual(1);
  expect(arrangement.groups.filter((group) => group.kind !== 'pair').length).toBeLessThanOrEqual(4);
}

describe('胡牌资格原因', () => {
  it.each([0, 1, 2, 3, 4])(
    '%s 张发财在自摸、接炮、报嘴与固定听口条件下保持原规则',
    (fortuneCount) => {
      for (const mouthDeclared of [false, true]) {
        for (const mouthRequired of [false, true]) {
          for (const locked of [false, true]) {
            const context = {
              fortuneCount,
              mouthDeclared,
              mouthRequired,
              lockedWaits: locked ? ['m7' as const] : ['white' as const],
            };
            const selfDraw = !mouthDeclared || locked;
            const discard =
              selfDraw &&
              fortuneCount >= 1 &&
              (mouthDeclared || (fortuneCount < 3 && !mouthRequired));
            expect(canWinOnSelfDraw(before, [], context, 'm7')).toBe(selfDraw);
            expect(canWinOnDiscard(before, [], context, 'm7')).toBe(discard);
            expect(getWinBlockReason(before, [], context, 'm7', 'self-draw') === null).toBe(
              selfDraw,
            );
            expect(getWinBlockReason(before, [], context, 'm7', 'discard') === null).toBe(discard);
          }
        }
      }
    },
  );

  it('分别说明未成牌、无发财、未报嘴和非锁定听口', () => {
    const incorrect = before.map((tile) => (tile === 's7' ? ('s3' as const) : tile));
    expect(getWinBlockReason(incorrect, [], player, 'm7', 'self-draw')).toBe('incomplete-hand');
    expect(getWinBlockReason(before, [], { ...player, fortuneCount: 0 }, 'm7', 'discard')).toBe(
      'no-fortune',
    );
    expect(getWinBlockReason(before, [], { ...player, fortuneCount: 3 }, 'm7', 'discard')).toBe(
      'mouth-required',
    );
    expect(getWinBlockReason(before, [], { ...player, mouthRequired: true }, 'm7', 'discard')).toBe(
      'mouth-required',
    );
    expect(
      getWinBlockReason(
        before,
        [],
        { ...player, mouthDeclared: true, lockedWaits: ['white'] },
        'm7',
        'self-draw',
      ),
    ).toBe('outside-locked-waits');
  });

  it('无发财或未报嘴不能掩盖自摸资格，不能制造第五张同牌胡牌', () => {
    expect(
      getWinBlockReason(before, [], { ...player, fortuneCount: 0 }, 'm7', 'self-draw'),
    ).toBeNull();
    expect(
      getWinBlockReason(
        before,
        [],
        { ...player, fortuneCount: 4, mouthRequired: true },
        'm7',
        'self-draw',
      ),
    ).toBeNull();
    expect(
      getWinBlockReason(
        ['m1', 'm1', 'm1', 'm1', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 's7', 's8', 's9'],
        [],
        player,
        'm1',
        'self-draw',
      ),
    ).toBe('incomplete-hand');
  });
});

describe('按需整理牌型', () => {
  it('截图中的三八九条保留为剩余牌，不伪造成顺子', () => {
    const hand = complete.map((tile) => (tile === 's7' ? ('s3' as const) : tile));
    const result = getHandArrangement(hand)!;
    assertConservation(result, hand);
    expect(result.groups).toHaveLength(4);
    expect(result.groups.at(-1)).toEqual({ kind: 'pair', tiles: ['m7', 'm7'] });
    expect(result.ungrouped).toEqual(['s3', 's8', 's9']);
    expect(isWinningHand(hand)).toBe(false);
  });

  it('摸牌前、缺将和单张也可说明，绝不把部分整理当成胡牌', () => {
    for (const hand of [before, complete.slice(0, 3), ['white'] as NormalTile[], []]) {
      const result = getHandArrangement(hand)!;
      assertConservation(result, hand);
      expect(result.groups.length < 5 || result.ungrouped.length > 0).toBe(true);
      expect(isWinningHand(hand)).toBe(false);
    }
  });

  it('会探索顺子与对子竞争，不用先取刻子的贪心搭配漏掉完整组', () => {
    const hand: NormalTile[] = [
      'm1',
      'm1',
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'p7',
      'p8',
      'p9',
      's3',
      's8',
      's9',
    ];
    const result = getHandArrangement(hand)!;
    assertConservation(result, hand);
    expect(result.ungrouped).toEqual(['s3', 's8', 's9']);
    expect(result.groups).toContainEqual({ kind: 'pair', tiles: ['m1', 'm1'] });
    expect(result.groups).toContainEqual({ kind: 'sequence', tiles: ['m1', 'm2', 'm3'] });
    expect(getHandArrangement([...hand].reverse())).toEqual(result);
  });

  it.each(['pong', 'exposed-kong', 'concealed-kong', 'added-kong'] as const)(
    '%s 计一组面子并保留全部实体牌',
    (kind) => {
      const meld: Meld =
        kind === 'concealed-kong' ? { kind, tile: 'red' } : { kind, tile: 'red', fromSeat: 1 };
      const hand: NormalTile[] = ['m4', 'm5', 'm6', 'm7', 'm7', 'p5', 'p6', 'p6', 'p7', 'p7', 'p8'];
      const result = getHandArrangement(hand, [meld])!;
      assertConservation(result, hand, [meld]);
      expect(result.groups).toHaveLength(5);
      expect(result.ungrouped).toEqual([]);
    },
  );

  it('完整牌型和终局拆分相同，修改解释不会改变原始手牌或下次结果', () => {
    const result = getHandArrangement(complete)!;
    expect(result.groups).toEqual(getWinningHandGroups(complete));
    const snapshot = [...complete];
    result.groups[0]!.tiles.pop();
    result.ungrouped.push('white');
    expect(complete).toEqual(snapshot);
    expect(getHandArrangement(complete)!.ungrouped).toEqual([]);
    assertConservation(getHandArrangement(complete)!, complete);
  });

  it('拒绝超量牌、非法牌和无效鸣牌，不为损坏的牌组编造解释', () => {
    expect(getHandArrangement([...complete, 'white'])).toBeNull();
    expect(getHandArrangement(['fortune' as NormalTile])).toBeNull();
    expect(
      getHandArrangement(['m1', 'm1'], [{ kind: 'pong', tile: 'm1', fromSeat: 1 }]),
    ).toBeNull();
    expect(
      getHandArrangement([], [{ kind: 'pong', tile: 'red', fromSeat: 8 } as unknown as Meld]),
    ).toBeNull();
    expect(getHandArrangement([], null as unknown as Meld[])).toBeNull();
    expect(getWinningHandGroups([], null as unknown as Meld[])).toBeNull();
  });
});
