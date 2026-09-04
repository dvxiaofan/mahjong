import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './game.js';
import { toPlayerView, toPublicPlayerView } from './view.js';

describe('UI 视图契约', () => {
  it('公开玩家视图不包含暗手私密字段，自身视图包含完整信息', () => {
    const state = createGame({ seed: 1 });
    const player = state.players[0]!;
    player.discards = ['m1'];
    player.mouthDeclared = true;
    player.lockedWaits = ['m2'];
    player.mouthRequired = false;

    const publicView = toPublicPlayerView(player);
    const selfView = toPlayerView(player);

    expect(publicView.visibility).toBe('public');
    expect(publicView.concealedTileCount).toBe(player.concealedTiles.length);
    expect(publicView.discards).toEqual(['m1']);
    expect(publicView.discards).not.toBe(player.discards);
    expect(publicView.melds).not.toBe(player.melds);
    expect('concealedTiles' in publicView).toBe(false);
    expect('lockedWaits' in publicView).toBe(false);
    expect('mouthRequired' in publicView).toBe(false);

    expect(selfView.visibility).toBe('self');
    expect(selfView.concealedTiles).toEqual(player.concealedTiles);
    expect(selfView.concealedTiles).not.toBe(player.concealedTiles);
    expect(selfView.lockedWaits).toEqual(['m2']);
    expect(selfView.mouthRequired).toBe(false);
  });

  it('弃牌写入弃牌区，碰走后从当前弃牌区移除且不污染旧状态', () => {
    const state = createGame({
      wallTiles: Array.from({ length: 120 }, () => 'm9' as const),
    });
    const drawn = state.lastDrawnTile;
    if (drawn === null) throw new Error('测试牌局没有庄家起牌');

    let next = applyAction(state, { type: 'discard', seat: 0, tile: drawn });
    expect(state.players[0]!.discards).toEqual([]);
    expect(next.players[0]!.discards).toEqual([drawn]);

    next = applyAction(next, { type: 'pong', seat: 1 });
    next = applyAction(next, { type: 'pass', seat: 2 });
    next = applyAction(next, { type: 'pass', seat: 3 });
    expect(next.players[0]!.discards).toEqual([]);
    expect(next.players[1]!.melds).toContainEqual({
      kind: 'pong',
      tile: drawn,
      fromSeat: 0,
    });
  });
});
