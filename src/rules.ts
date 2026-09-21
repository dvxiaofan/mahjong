import {
  NORMAL_TILE_TYPES,
  SUITS,
  TILE_COPIES,
  isHonorTile,
  isSuitedTile,
  tileRank,
  tileSuit,
  type HonorTile,
  type NormalTile,
  type Rank,
  type SuitedTile,
} from './tiles.js';
import type { FanBreakdown, FanItem, Meld, MeldKind, WinType } from './types.js';
import { SEATS } from './types.js';

const ALL_PUNG_KINDS: readonly MeldKind[] = [
  'pong',
  'exposed-kong',
  'concealed-kong',
  'added-kong',
];

export interface HandGroup {
  kind: 'sequence' | 'triplet' | 'pair' | MeldKind;
  tiles: NormalTile[];
}

export interface HandArrangement {
  groups: HandGroup[];
  ungrouped: NormalTile[];
}

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
  memo: Map<string, HandArrangement | null>,
  allowUngrouped = false,
): HandArrangement | null {
  const signature = `${countSignature(counts, groupsRemaining, pairUsed, allowSequences)}|${allowUngrouped}`;
  const cached = memo.get(signature);
  if (cached !== undefined) return cached;

  const first = sortedCountEntries(counts).find(([, count]) => count > 0)?.[0];
  if (first === undefined) {
    const result =
      allowUngrouped || (groupsRemaining === 0 && pairUsed) ? { groups: [], ungrouped: [] } : null;
    memo.set(signature, result);
    return result;
  }

  const count = counts.get(first) ?? 0;
  const choices: HandGroup[] = [];
  if (!pairUsed && count >= 2) {
    choices.push({ kind: 'pair', tiles: [first, first] });
  }
  if (groupsRemaining > 0 && count >= 3) {
    choices.push({ kind: 'triplet', tiles: [first, first, first] });
  }
  if (allowSequences && isSuitedTile(first) && groupsRemaining > 0) {
    const rank = tileRank(first);
    const suit = tileSuit(first);
    if (suit !== null && rank <= 7) {
      const second = `${suit}${rank + 1}` as SuitedTile;
      const third = `${suit}${rank + 2}` as SuitedTile;
      if ((counts.get(second) ?? 0) > 0 && (counts.get(third) ?? 0) > 0) {
        choices.push({ kind: 'sequence', tiles: [first, second, third] });
      }
    }
  }

  let best: HandArrangement | null = null;
  for (const group of choices) {
    const next = copyCounts(counts);
    for (const tile of group.tiles) removeCount(next, tile, 1);
    const isPair = group.kind === 'pair';
    const suffix = canPartition(
      next,
      groupsRemaining - (isPair ? 0 : 1),
      pairUsed || isPair,
      allowSequences,
      memo,
      allowUngrouped,
    );
    if (suffix !== null && (best === null || suffix.ungrouped.length < best.ungrouped.length)) {
      best = { groups: [group, ...suffix.groups], ungrouped: suffix.ungrouped };
      if (!allowUngrouped || best.ungrouped.length === 0) break;
    }
  }

  // Only the optional explanation search may leave tiles ungrouped. Win checks never do.
  if (allowUngrouped && best?.ungrouped.length !== 0) {
    const next = copyCounts(counts);
    removeCount(next, first, 1);
    const suffix = canPartition(next, groupsRemaining, pairUsed, allowSequences, memo, true)!;
    if (best === null || suffix.ungrouped.length + 1 < best.ungrouped.length) {
      best = { groups: suffix.groups, ungrouped: [first, ...suffix.ungrouped] };
    }
  }

  memo.set(signature, best);
  return best;
}

function requiredConcealedTileCount(meldCount: number): number {
  return (4 - meldCount) * 3 + 2;
}

function handCounts(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
): Map<NormalTile, number> | null {
  if (!validateMelds(melds)) return null;
  if (concealedTiles.some((tile) => !NORMAL_TILE_TYPES.includes(tile))) return null;
  if (concealedTiles.length > requiredConcealedTileCount(melds.length)) return null;

  const counts = createCounts(concealedTiles);
  const physicalCounts = copyCounts(counts);
  for (const meld of melds) {
    const amount = meld.kind === 'pong' ? 3 : 4;
    physicalCounts.set(meld.tile, (physicalCounts.get(meld.tile) ?? 0) + amount);
  }
  // Meld tiles are still owned: a putative winning tile cannot be a fifth copy.
  if ([...physicalCounts.values()].some((count) => count > TILE_COPIES)) return null;
  return counts;
}

function winningCounts(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
): Map<NormalTile, number> | null {
  const counts = handCounts(concealedTiles, melds);
  return counts !== null && concealedTiles.length === requiredConcealedTileCount(melds.length)
    ? counts
    : null;
}

function includeMelds(groups: readonly HandGroup[], melds: readonly Meld[]): HandGroup[] {
  return [
    ...melds.map((meld) => ({
      kind: meld.kind,
      tiles: Array.from({ length: meld.kind === 'pong' ? 3 : 4 }, () => meld.tile),
    })),
    ...groups.filter((group) => group.kind !== 'pair'),
    ...groups.filter((group) => group.kind === 'pair'),
  ];
}

/** Determine whether concealed tiles plus exposed melds form 4面子+1将. */
export function isWinningHand(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): boolean {
  const counts = winningCounts(concealedTiles, melds);
  return counts !== null && canPartition(counts, 4 - melds.length, false, true, new Map()) !== null;
}

/** A witness from the same partition search used for winning and fan detection. */
export function getWinningHandGroups(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): HandGroup[] | null {
  const counts = winningCounts(concealedTiles, melds);
  if (counts === null) return null;
  // Prefer a pung-only witness when possible, matching the existing 碰碰胡 scoring rule.
  const concealed =
    canPartition(counts, 4 - melds.length, false, false, new Map()) ??
    canPartition(counts, 4 - melds.length, false, true, new Map());
  if (concealed === null) return null;
  return includeMelds(concealed.groups, melds);
}

/** One arrangement of complete groups and remaining tiles, for on-demand explanations only. */
export function getHandArrangement(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): HandArrangement | null {
  const counts = handCounts(concealedTiles, melds);
  if (counts === null) return null;
  const winningGroups = getWinningHandGroups(concealedTiles, melds);
  if (winningGroups !== null) return { groups: winningGroups, ungrouped: [] };
  const partial = canPartition(counts, 4 - melds.length, false, true, new Map(), true)!;
  return { groups: includeMelds(partial.groups, melds), ungrouped: partial.ungrouped };
}

/** Return every normal tile that completes the current 13-tile hand. */
export function getWaitingTiles(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): NormalTile[] {
  return NORMAL_TILE_TYPES.filter((tile) => isWinningHand([...concealedTiles, tile], melds));
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
  return (
    canPartition(createCounts(concealedTiles), 4 - melds.length, false, false, new Map()) !== null
  );
}

export function isAllPungs(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): boolean {
  return isPungOnlyConcealed(concealedTiles, melds) && isWinningHand(concealedTiles, melds);
}

export function isPureSuit(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): boolean {
  if (!validateMelds(melds) || concealedTiles.some((tile) => !NORMAL_TILE_TYPES.includes(tile))) {
    return false;
  }
  const allTiles: NormalTile[] = [...concealedTiles, ...melds.map((meld) => meld.tile)];
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
  return getWinBlockReason(concealedTiles, melds, player, winningTile, 'self-draw') === null;
}

export function canWinOnDiscard(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
  player: WinPlayerContext,
  discardedTile: NormalTile,
): boolean {
  return getWinBlockReason(concealedTiles, melds, player, discardedTile, 'discard') === null;
}

export type WinBlockReason =
  'incomplete-hand' | 'no-fortune' | 'outside-locked-waits' | 'mouth-required';

/** Rule eligibility before adding the candidate tile; turn timing is checked by the game. */
export function getWinBlockReason(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
  player: WinPlayerContext,
  winningTile: NormalTile,
  winType: WinType,
): WinBlockReason | null {
  if (winType === 'discard' && player.fortuneCount < 1) return 'no-fortune';
  if (!isWinningHand([...concealedTiles, winningTile], melds)) return 'incomplete-hand';
  if (player.mouthDeclared && !player.lockedWaits.includes(winningTile)) {
    return 'outside-locked-waits';
  }
  // 未报嘴不妨碍自摸，3 张以上发财或待报嘴限制只适用于接炮。
  if (
    winType === 'discard' &&
    !player.mouthDeclared &&
    (player.fortuneCount >= 3 || player.mouthRequired)
  ) {
    return 'mouth-required';
  }
  return null;
}

export function canDeclareMouth(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
  fortuneCount: number,
  alreadyDeclared: boolean,
): boolean {
  return (
    !alreadyDeclared &&
    Number.isInteger(fortuneCount) &&
    fortuneCount >= 3 &&
    isTing(concealedTiles, melds)
  );
}

export function isNormalTile(tile: string): tile is NormalTile {
  return (NORMAL_TILE_TYPES as readonly string[]).includes(tile);
}

export function isHonor(tile: NormalTile): tile is HonorTile {
  return isHonorTile(tile);
}
