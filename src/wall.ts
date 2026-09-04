import { createTileSet, isFortuneTile, type Tile } from './tiles.js';
import { shuffle, type RandomSource } from './random.js';
import type { WallState } from './types.js';

export class WallExhaustedError extends Error {
  readonly consumed: Tile[];
  readonly fortunes: number;

  constructor(message = '牌墙已经没有可摸的牌', consumed: readonly Tile[] = [], fortunes = 0) {
    super(message);
    this.name = 'WallExhaustedError';
    this.consumed = [...consumed];
    this.fortunes = fortunes;
  }
}

export function createWall(random: RandomSource = Math.random): WallState {
  return createWallFromTiles(shuffle(createTileSet(), random));
}

export function createWallFromTiles(tiles: readonly Tile[]): WallState {
  if (tiles.length === 0) {
    throw new Error('牌墙不能为空');
  }
  return {
    tiles: [...tiles],
    drawIndex: 0,
    replacementIndex: tiles.length - 1,
  };
}

export function remainingWallTiles(wall: WallState): number {
  return Math.max(0, wall.replacementIndex - wall.drawIndex + 1);
}

export function drawNormal(wall: WallState): Tile {
  if (wall.drawIndex > wall.replacementIndex) {
    throw new WallExhaustedError();
  }
  const tile = wall.tiles[wall.drawIndex];
  if (tile === undefined) throw new WallExhaustedError();
  wall.drawIndex += 1;
  return tile;
}

export function drawReplacement(wall: WallState): Tile {
  if (wall.drawIndex > wall.replacementIndex) {
    throw new WallExhaustedError();
  }
  const tile = wall.tiles[wall.replacementIndex];
  if (tile === undefined) throw new WallExhaustedError();
  wall.replacementIndex -= 1;
  return tile;
}

export interface DrawResolved {
  tile: Exclude<Tile, 'fortune'>;
  fortunes: number;
  consumed: Tile[];
}

/**
 * Draw a tile and automatically replace every发财 found on the active draw
 * route. Normal draws replace from the wall tail; tail draws continue from
 * the wall tail as well.
 */
export function drawWithFortuneReplacement(
  wall: WallState,
  mode: 'normal' | 'replacement',
): DrawResolved {
  const consumed: Tile[] = [];
  let fortunes = 0;

  while (true) {
    let next: Tile;
    try {
      next = mode === 'normal' && consumed.length === 0 ? drawNormal(wall) : drawReplacement(wall);
    } catch (error) {
      if (error instanceof WallExhaustedError) {
        throw new WallExhaustedError('发财/补牌流程耗尽牌墙', consumed, fortunes);
      }
      throw error;
    }

    consumed.push(next);
    if (!isFortuneTile(next)) {
      return { tile: next, fortunes, consumed };
    }
    fortunes += 1;
  }
}
