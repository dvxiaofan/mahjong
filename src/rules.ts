import {
  NORMAL_TILE_TYPES,
  SUITS,
  isHonorTile,
  isSuitedTile,
  tileRank,
  tileSuit,
  type HonorTile,
  type NormalTile,
  type Rank,
  type SuitedTile,
} from './tiles.js';
import type { FanBreakdown, FanItem, Meld, MeldKind } from './types.js';
import { SEATS } from './types.js';

const ALL_PUNG_KINDS: readonly MeldKind[] = [
  'pong',
  'exposed-kong',
  'concealed-kong',
  'added-kong',
];

function createCounts(tiles: readonly NormalTile[]): Map<NormalTile, number> {
  const counts = new Map<NormalTile, number>();
  for (const tile of tiles) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return counts;
}

function sortedCountEntries(counts: ReadonlyMap<NormalTile, number>): [NormalTile, number][] {
  return [...counts.entries()].sort((a, b) => {
    const ai = NORMAL_TILE_TYPES.indexOf(a[0]);
    const bi = NORMAL_TILE_TYPES.indexOf(b[0]);
    return ai - bi;
  });
}

function isSeat(value: unknown): value is (typeof SEATS)[number] {
  return SEATS.includes(value as (typeof SEATS)[number]);
}

function validateMelds(melds: readonly Meld[]): boolean {
  if (!Array.isArray(melds) || melds.length > 4) return false;
  return melds.every((meld) => {
    if (meld === null || typeof meld !== 'object') return false;
    if (!ALL_PUNG_KINDS.includes(meld.kind) || !NORMAL_TILE_TYPES.includes(meld.tile)) {
      return false;
    }
    if (meld.kind === 'concealed-kong') return true;
    return isSeat(meld.fromSeat);
  });
}

function removeCount(counts: Map<NormalTile, number>, tile: NormalTile, amount: number): void {
  const current = counts.get(tile) ?? 0;
  if (current < amount) throw new Error(`无法从计数中移除 ${tile}`);
  if (current === amount) counts.delete(tile);
  else counts.set(tile, current - amount);
}

function copyCounts(counts: ReadonlyMap<NormalTile, number>): Map<NormalTile, number> {
  return new Map(counts);
}

function countSignature(
  counts: ReadonlyMap<NormalTile, number>,
  groupsRemaining: number,
  pairUsed: boolean,
  allowSequences: boolean,
): string {
  const values = NORMAL_TILE_TYPES.map((tile) => counts.get(tile) ?? 0).join('');
  return `${values}|${groupsRemaining}|${pairUsed ? 1 : 0}|${allowSequences ? 1 : 0}`;
}

function canPartition(
  counts: Map<NormalTile, number>,
  groupsRemaining: number,
  pairUsed: boolean,
  allowSequences: boolean,
  memo: Map<string, boolean>,
): boolean {
  const signature = countSignature(counts, groupsRemaining, pairUsed, allowSequences);
  const cached = memo.get(signature);
  if (cached !== undefined) return cached;

  const first = sortedCountEntries(counts).find(([, count]) => count > 0)?.[0];
  if (first === undefined) {
    const valid = groupsRemaining === 0 && pairUsed;
    memo.set(signature, valid);
    return valid;
  }

  const count = counts.get(first) ?? 0;
  let valid = false;

  if (!pairUsed && count >= 2) {
    const next = copyCounts(counts);
    removeCount(next, first, 2);
    valid = canPartition(next, groupsRemaining, true, allowSequences, memo);
  }

  if (!valid && groupsRemaining > 0 && count >= 3) {
    const next = copyCounts(counts);
    removeCount(next, first, 3);
    valid = canPartition(next, groupsRemaining - 1, pairUsed, allowSequences, memo);
  }

  if (!valid && allowSequences && isSuitedTile(first) && groupsRemaining > 0) {
    const rank = tileRank(first);
    const suit = tileSuit(first);
    if (suit !== null && rank <= 7) {
      const second = `${suit}${rank + 1}` as SuitedTile;
      const third = `${suit}${rank + 2}` as SuitedTile;
      if ((counts.get(second) ?? 0) > 0 && (counts.get(third) ?? 0) > 0) {
        const next = copyCounts(counts);
        removeCount(next, first, 1);
        removeCount(next, second, 1);
        removeCount(next, third, 1);
        valid = canPartition(next, groupsRemaining - 1, pairUsed, allowSequences, memo);
      }
    }
  }

  memo.set(signature, valid);
  return valid;
}

function requiredConcealedTileCount(meldCount: number): number {
  return (4 - meldCount) * 3 + 2;
}

/** Determine whether concealed tiles plus exposed melds form 4面子+1将. */
export function isWinningHand(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): boolean {
  if (!validateMelds(melds)) return false;
  if (concealedTiles.some((tile) => !NORMAL_TILE_TYPES.includes(tile))) return false;
  if (concealedTiles.length !== requiredConcealedTileCount(melds.length)) return false;

  return canPartition(
    createCounts(concealedTiles),
    4 - melds.length,
    false,
    true,
    new Map(),
  );
}

/** Return every normal tile that completes the current 13-tile hand. */
export function getWaitingTiles(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): NormalTile[] {
  return NORMAL_TILE_TYPES.filter((tile) =>
    isWinningHand([...concealedTiles, tile], melds),
  );
}

export function isTing(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): boolean {
  return getWaitingTiles(concealedTiles, melds).length > 0;
}

function isPungOnlyConcealed(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
): boolean {
  if (!validateMelds(melds)) return false;
  if (!melds.every((meld) => ALL_PUNG_KINDS.includes(meld.kind))) return false;
  if (concealedTiles.length !== requiredConcealedTileCount(melds.length)) return false;
  return canPartition(
    createCounts(concealedTiles),
    4 - melds.length,
    false,
    false,
    new Map(),
  );
}

export function isAllPungs(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): boolean {
  return isPungOnlyConcealed(concealedTiles, melds) &&
    isWinningHand(concealedTiles, melds);
}

export function isPureSuit(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): boolean {
  if (!validateMelds(melds) || concealedTiles.some((tile) => !NORMAL_TILE_TYPES.includes(tile))) {
    return false;
  }
  const allTiles: NormalTile[] = [
    ...concealedTiles,
    ...melds.map((meld) => meld.tile),
  ];
  const suits = new Set(allTiles.map(tileSuit));
  return allTiles.length > 0 && suits.size === 1 && !suits.has(null);
}

export interface WinContext {
  concealedTiles: readonly NormalTile[];
  melds: readonly Meld[];
  fortuneCount: number;
}

export interface WinPlayerContext {
  fortuneCount: number;
  mouthDeclared: boolean;
  lockedWaits: readonly NormalTile[];
  mouthRequired: boolean;
}

export function calculateFan(context: WinContext): FanBreakdown {
  if (!isWinningHand(context.concealedTiles, context.melds)) {
    throw new Error('未完成的牌不能计算番数');
  }
  if (!Number.isInteger(context.fortuneCount) || context.fortuneCount < 0) {
    throw new Error('发财数量必须是非负整数');
  }

  const items: FanItem[] = [];
  if (isAllPungs(context.concealedTiles, context.melds)) {
    items.push({ name: '碰碰胡', fan: 1 });
  }
  if (isPureSuit(context.concealedTiles, context.melds)) {
    items.push({ name: '清一色', fan: 1 });
  }
  if (context.fortuneCount > 0) {
    items.push({ name: '发财', fan: context.fortuneCount });
  }

  return {
    total: items.reduce((sum, item) => sum + item.fan, 0),
    items,
  };
}

export function canWinOnSelfDraw(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
  player: WinPlayerContext,
  winningTile: NormalTile,
): boolean {
  if (!isWinningHand([...concealedTiles, winningTile], melds)) return false;
  if (player.mouthDeclared && !player.lockedWaits.includes(winningTile)) return false;
  // 未报嘴并不妨碍自摸：即使有 3 张以上发财，也可以自摸胡。
  return true;
}

export function canWinOnDiscard(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
  player: WinPlayerContext,
  discardedTile: NormalTile,
): boolean {
  if (player.fortuneCount < 1) return false;
  if (!isWinningHand([...concealedTiles, discardedTile], melds)) return false;
  if (player.mouthDeclared && !player.lockedWaits.includes(discardedTile)) return false;
  // 3 张以上发财且未报嘴时，只能自摸，不能胡弃牌。
  if (!player.mouthDeclared && (player.fortuneCount >= 3 || player.mouthRequired)) return false;
  return true;
}

export function canDeclareMouth(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
  fortuneCount: number,
  alreadyDeclared: boolean,
): boolean {
  return !alreadyDeclared &&
    Number.isInteger(fortuneCount) &&
    fortuneCount >= 3 &&
    isTing(concealedTiles, melds);
}

export function isNormalTile(tile: string): tile is NormalTile {
  return (NORMAL_TILE_TYPES as readonly string[]).includes(tile);
}

export function isHonor(tile: NormalTile): tile is HonorTile {
  return isHonorTile(tile);
}
