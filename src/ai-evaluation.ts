import {
  NORMAL_TILE_TYPES,
  SUITS,
  isSuitedTile,
  tileSortKey,
  tileSuit,
  type NormalTile,
  type Suit,
} from './tiles.js';
import { getLegalActions } from './game.js';
import { getWaitingTiles } from './rules.js';
import type { GameAction, GameState, Meld, Seat } from './types.js';

export interface EffectiveTile {
  tile: NormalTile;
  remaining: number;
  nextShanten: number;
}

export interface HandEvaluation {
  shanten: number;
  waitingTiles: NormalTile[];
  effectiveTiles: EffectiveTile[];
  effectiveTileCount: number;
  pureSuitPotential: number;
  pureSuitTarget: Suit | null;
  allPungsPotential: number;
  fortuneFan: number;
}

export interface DiscardEvaluation {
  action: Extract<GameAction, { type: 'discard' }>;
  tile: NormalTile;
  score: number;
  hand: HandEvaluation;
  reasons: string[];
}

const shantenCache = new Map<string, number>();

function countsFor(tiles: readonly NormalTile[]): number[] {
  return NORMAL_TILE_TYPES.map((tile) =>
    tiles.reduce((total, candidate) => total + (candidate === tile ? 1 : 0), 0),
  );
}

function shantenKey(counts: readonly number[], meldCount: number): string {
  return `${meldCount}|${counts.join('')}`;
}

function searchShanten(counts: number[], fixedMelds: number): number {
  const memo = new Map<string, number>();

  function visit(
    start: number,
    completeMelds: number,
    pairUsed: boolean,
    partialGroups: number,
  ): number {
    let index = start;
    while (index < counts.length && counts[index] === 0) index += 1;

    if (index >= counts.length) {
      const melds = fixedMelds + completeMelds;
      const usablePartials = Math.min(partialGroups, Math.max(0, 4 - melds));
      return 8 - melds * 2 - usablePartials - (pairUsed ? 1 : 0);
    }

    const signature = `${index}|${completeMelds}|${pairUsed ? 1 : 0}|${partialGroups}|${counts.join('')}`;
    const cached = memo.get(signature);
    if (cached !== undefined) return cached;

    const tile = NORMAL_TILE_TYPES[index]!;
    let best = 8;

    // Treat one tile as isolated and continue. This guarantees progress.
    counts[index]! -= 1;
    best = Math.min(best, visit(index, completeMelds, pairUsed, partialGroups));
    counts[index]! += 1;

    if (counts[index]! >= 3) {
      counts[index]! -= 3;
      best = Math.min(best, visit(index, completeMelds + 1, pairUsed, partialGroups));
      counts[index]! += 3;
    }

    if (isSuitedTile(tile)) {
      const rank = Number(tile[1]);
      if (rank <= 7 && counts[index + 1]! > 0 && counts[index + 2]! > 0) {
        counts[index]! -= 1;
        counts[index + 1]! -= 1;
        counts[index + 2]! -= 1;
        best = Math.min(best, visit(index, completeMelds + 1, pairUsed, partialGroups));
        counts[index]! += 1;
        counts[index + 1]! += 1;
        counts[index + 2]! += 1;
      }
    }

    if (counts[index]! >= 2) {
      counts[index]! -= 2;
      if (!pairUsed) {
        best = Math.min(best, visit(index, completeMelds, true, partialGroups));
      }
      best = Math.min(best, visit(index, completeMelds, pairUsed, partialGroups + 1));
      counts[index]! += 2;
    }

    if (isSuitedTile(tile)) {
      const rank = Number(tile[1]);
      if (rank <= 8 && counts[index + 1]! > 0) {
        counts[index]! -= 1;
        counts[index + 1]! -= 1;
        best = Math.min(best, visit(index, completeMelds, pairUsed, partialGroups + 1));
        counts[index]! += 1;
        counts[index + 1]! += 1;
      }
      if (rank <= 7 && counts[index + 2]! > 0) {
        counts[index]! -= 1;
        counts[index + 2]! -= 1;
        best = Math.min(best, visit(index, completeMelds, pairUsed, partialGroups + 1));
        counts[index]! += 1;
        counts[index + 2]! += 1;
      }
    }

    memo.set(signature, best);
    return best;
  }

  return visit(0, 0, false, 0);
}

/** Standard 4-melds-and-a-pair shanten. -1 is complete; 0 is ready. */
export function calculateShanten(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[] = [],
): number {
  const counts = countsFor(concealedTiles);
  const key = shantenKey(counts, melds.length);
  const cached = shantenCache.get(key);
  if (cached !== undefined) return cached;
  const result = searchShanten(counts, melds.length);
  shantenCache.set(key, result);
  return result;
}

function meldTileCount(meld: Meld): number {
  return meld.kind === 'pong' ? 3 : 4;
}

function visibleTileCount(
  state: GameState,
  seat: Seat,
  concealedTiles: readonly NormalTile[],
  tile: NormalTile,
): number {
  const ownConcealed = concealedTiles.filter((candidate) => candidate === tile).length;
  const discards = state.players.reduce(
    (total, player) => total + player.discards.filter((candidate) => candidate === tile).length,
    0,
  );
  const publicMelds = state.players.reduce(
    (total, player) =>
      total +
      player.melds.reduce(
        (meldTotal, meld) => meldTotal + (meld.tile === tile ? meldTileCount(meld) : 0),
        0,
      ),
    0,
  );
  // The explicit seat parameter documents that only this seat's concealed hand is counted.
  void seat;
  return ownConcealed + discards + publicMelds;
}

function pureSuitMetrics(
  concealedTiles: readonly NormalTile[],
  melds: readonly Meld[],
): { potential: number; target: Suit | null } {
  const tiles = [
    ...concealedTiles,
    ...melds.flatMap((meld) => Array.from({ length: 3 }, () => meld.tile)),
  ];
  if (tiles.length === 0) return { potential: 0, target: null };

  const suitCounts = SUITS.map((suit) => ({
    suit,
    count: tiles.filter((tile) => tileSuit(tile) === suit).length,
  })).sort((left, right) => right.count - left.count);
  const target = suitCounts[0];
  if (target === undefined || target.count === 0) return { potential: 0, target: null };
  return { potential: target.count / tiles.length, target: target.suit };
}

function allPungsMetric(concealedTiles: readonly NormalTile[], melds: readonly Meld[]): number {
  const counts = countsFor(concealedTiles);
  const completed = melds.length + counts.filter((count) => count >= 3).length;
  const pairCandidates = counts.filter((count) => count >= 2).length;
  const structuralUnits = completed * 2 + Math.min(pairCandidates, Math.max(0, 5 - completed));
  return Math.min(1, structuralUnits / 9);
}

export function evaluateHand(
  state: GameState,
  seat: Seat,
  concealedTiles: readonly NormalTile[] = state.players[seat]?.concealedTiles ?? [],
  melds: readonly Meld[] = state.players[seat]?.melds ?? [],
): HandEvaluation {
  const player = state.players[seat];
  if (player === undefined) throw new Error(`不存在 ${seat} 号玩家`);
  const shanten = calculateShanten(concealedTiles, melds);
  const waitingTiles = getWaitingTiles(concealedTiles, melds);
  const effectiveTiles = NORMAL_TILE_TYPES.flatMap((tile): EffectiveTile[] => {
    const nextShanten = calculateShanten([...concealedTiles, tile], melds);
    if (nextShanten >= shanten) return [];
    const remaining = Math.max(0, 4 - visibleTileCount(state, seat, concealedTiles, tile));
    return remaining === 0 ? [] : [{ tile, remaining, nextShanten }];
  });
  const pureSuit = pureSuitMetrics(concealedTiles, melds);

  return {
    shanten,
    waitingTiles,
    effectiveTiles,
    effectiveTileCount: effectiveTiles.reduce((total, tile) => total + tile.remaining, 0),
    pureSuitPotential: pureSuit.potential,
    pureSuitTarget: pureSuit.target,
    allPungsPotential: allPungsMetric(concealedTiles, melds),
    fortuneFan: player.fortuneCount,
  };
}

function removeOne(tiles: readonly NormalTile[], tile: NormalTile): NormalTile[] {
  const result = [...tiles];
  const index = result.indexOf(tile);
  if (index >= 0) result.splice(index, 1);
  return result;
}

export function scoreHandEvaluation(hand: HandEvaluation): number {
  return Math.round(
    -hand.shanten * 100 +
      hand.effectiveTileCount * 4 +
      hand.pureSuitPotential * 18 +
      hand.allPungsPotential * 14 +
      hand.fortuneFan * 2,
  );
}

function explainHand(hand: HandEvaluation): string[] {
  const reasons = [
    hand.shanten < 0 ? '已经成胡' : `${hand.shanten} 向听`,
    `${hand.effectiveTileCount} 张可见有效进张`,
  ];
  if (hand.pureSuitTarget !== null && hand.pureSuitPotential >= 0.7) {
    reasons.push(`${hand.pureSuitTarget} 门清一色倾向`);
  }
  if (hand.allPungsPotential >= 0.55) reasons.push('碰碰胡结构较强');
  if (hand.fortuneFan > 0) reasons.push(`已有 ${hand.fortuneFan} 张发财`);
  return reasons;
}

export function evaluateDiscardChoices(state: GameState, seat: Seat): DiscardEvaluation[] {
  const player = state.players[seat];
  if (player === undefined) return [];
  const seen = new Set<NormalTile>();
  const choices: DiscardEvaluation[] = [];

  for (const action of getLegalActions(state, seat)) {
    if (action.type !== 'discard' || seen.has(action.tile)) continue;
    seen.add(action.tile);
    const concealed = removeOne(player.concealedTiles, action.tile);
    const hand = evaluateHand(state, seat, concealed, player.melds);
    choices.push({
      action,
      tile: action.tile,
      score: scoreHandEvaluation(hand),
      hand,
      reasons: explainHand(hand),
    });
  }

  return choices.sort(
    (left, right) => right.score - left.score || tileSortKey(left.tile) - tileSortKey(right.tile),
  );
}
