import { describe, expect, it } from 'vitest';
import {
  WallExhaustedError,
  createWallFromTiles,
  drawWithFortuneReplacement,
  remainingWallTiles,
} from './wall.js';

describe('双向牌墙与发财递归补牌', () => {
  it('正常摸到发财后从墙尾补牌，并递归处理墙尾发财', () => {
    const wall = createWallFromTiles(['fortune', 'm1', 'fortune', 'm2', 'fortune']);
    const resolved = drawWithFortuneReplacement(wall, 'normal');

    expect(resolved.tile).toBe('m2');
    expect(resolved.fortunes).toBe(2);
    expect(resolved.consumed).toEqual(['fortune', 'fortune', 'm2']);
    expect(remainingWallTiles(wall)).toBe(2);
  });

  it('补牌没有可用牌时抛出耗尽错误，并保留已翻出的发财', () => {
    const wall = createWallFromTiles(['fortune']);
    try {
      drawWithFortuneReplacement(wall, 'normal');
      throw new Error('预期应该耗尽牌墙');
    } catch (error) {
      expect(error).toBeInstanceOf(WallExhaustedError);
      expect((error as WallExhaustedError).consumed).toEqual(['fortune']);
      expect((error as WallExhaustedError).fortunes).toBe(1);
    }
  });
});
