import { describe, expect, it } from 'vitest';
import {
  ALL_TILE_TYPES,
  NORMAL_TILE_TYPES,
  createTileSet,
  tileLabel,
} from './tiles.js';

describe('牌库', () => {
  it('包含120张牌，且每种牌恰好4张', () => {
    const tiles = createTileSet();
    expect(tiles).toHaveLength(120);
    expect(ALL_TILE_TYPES).toHaveLength(30);
    for (const type of ALL_TILE_TYPES) {
      expect(tiles.filter((tile) => tile === type)).toHaveLength(4);
    }
    expect(NORMAL_TILE_TYPES).not.toContain('fortune');
  });

  it('红中、白板是普通牌，发财是独立宝牌', () => {
    expect(NORMAL_TILE_TYPES).toContain('red');
    expect(NORMAL_TILE_TYPES).toContain('white');
    expect(tileLabel('fortune')).toBe('发财');
  });
});
