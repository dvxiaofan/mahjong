import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions } from './game.js';
import { SEATS, type GameAction, type GameEventView, type WinType } from './types.js';
import {
  projectStateForSeat,
  projectStateForSpectator,
  toPlayerView,
  toPublicPlayerView,
} from './view.js';

describe('UI 视图契约', () => {
  it.each(
    SEATS.flatMap((winner) =>
      (['self-draw', 'discard'] as WinType[]).map((winType) => ({ winner, winType })),
    ),
  )('$winner 号玩家 $winType 后向四家与观战者亮出完整终局，胡牌张不重复', ({ winner, winType }) => {
    const state = createGame({ seed: 42 });
    const player = state.players[winner]!;
    player.concealedTiles = [
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'p1',
      'p2',
      'p3',
      's7',
      's8',
      's9',
      'red',
    ];
    player.fortuneCount = 1;
    player.mouthRequired = false;
    state.phase = winType === 'self-draw' ? 'awaiting-discard' : 'claiming';
    state.currentSeat = winner;
    state.lastDrawnTile = winType === 'self-draw' ? 'red' : null;
    if (winType === 'self-draw') player.concealedTiles.push('red');
    else {
      const discarder = SEATS[(winner + 3) % 4]!;
      state.currentSeat = discarder;
      state.players[discarder]!.discards = ['red', 'red'];
      state.pendingDiscard = { tile: 'red', discarder, responses: {} };
      for (const seat of SEATS) {
        if (seat !== discarder && seat !== winner)
          state.pendingDiscard.responses[seat] = { type: 'pass' };
      }
    }
    const before = projectStateForSpectator(state);
    expect(before.players.every((entry) => !('concealedTiles' in entry))).toBe(true);
    const finished = applyAction(state, { type: 'win', seat: winner });
    expect(finished.phase).toBe('finished');
    for (const view of [
      ...SEATS.map((seat) => projectStateForSeat(finished, seat)),
      projectStateForSpectator(finished),
    ]) {
      for (const entry of view.players) {
        expect(entry.visibility).toBe(entry.seat === view.viewerSeat ? 'self' : 'revealed');
        if (entry.visibility === 'public') throw new Error('终局仍有暗手');
        expect(entry.concealedTiles).toEqual(finished.players[entry.seat]!.concealedTiles);
        expect(entry.concealedTiles).not.toBe(finished.players[entry.seat]!.concealedTiles);
        if (entry.visibility === 'revealed') {
          expect('lockedWaits' in entry).toBe(false);
          expect('mouthRequired' in entry).toBe(false);
        }
      }
      expect(view.legalActions).toEqual([]);
      const won = view.players[winner]!;
      if (won.visibility === 'public') throw new Error('赢家手牌未公开');
      expect(won.concealedTiles).toHaveLength(14);
      expect(won.concealedTiles.filter((tile) => tile === 'red')).toHaveLength(2);
    }
    expect(before.players.every((entry) => !('concealedTiles' in entry))).toBe(true);
    expect(
      projectStateForSpectator(createGame({ seed: 43 })).players.every(
        (entry) => entry.visibility === 'public',
      ),
    ).toBe(true);
  });

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

  it('按查看座位投影完整状态，并裁剪他人的私密信息', () => {
    const state = createGame({ seed: 7 });
    state.currentSeat = 0;
    state.phase = 'claiming';
    state.drawMode = null;
    state.lastDrawnTile = state.players[0]!.concealedTiles[0]!;
    state.pendingDiscard = {
      tile: 'p1',
      discarder: 1,
      responses: {
        0: { type: 'pass' },
        2: { type: 'win' },
      },
    };
    state.players[1]!.melds = [{ kind: 'pong', tile: 'm1', fromSeat: 0 }];
    state.players[1]!.discards = ['p2'];
    state.events = [
      { type: 'draw', seat: 0, tile: 'm1', message: '0号玩家补摸1万' },
      { type: 'draw', seat: 1, tile: 'p1', message: '1号玩家补摸1筒' },
      { type: 'mouth-declared', seat: 1, tile: null, message: '1号玩家报嘴，听m1' },
      { type: 'discard', seat: 1, tile: 'p2', message: '1号玩家打出2筒' },
    ];

    for (const seat of [0, 1, 2, 3] as const) {
      const view = projectStateForSeat(state, seat);
      expect(view.viewerSeat).toBe(seat);
      expect(view.players).toHaveLength(4);
      expect(view.players.filter((player) => player.visibility === 'self')).toHaveLength(1);
      const selfPlayer = view.players[seat];
      expect(selfPlayer?.visibility).toBe('self');
      if (selfPlayer === undefined || selfPlayer.visibility !== 'self') {
        throw new Error('投影没有返回查看者自己的完整视图');
      }
      expect(selfPlayer.concealedTiles).toEqual(state.players[seat]!.concealedTiles);
      expect(selfPlayer.concealedTiles).not.toBe(state.players[seat]!.concealedTiles);

      for (const player of view.players) {
        if (player.seat === seat) continue;
        expect(player.visibility).toBe('public');
        expect('concealedTiles' in player).toBe(false);
        expect('lockedWaits' in player).toBe(false);
        expect('mouthRequired' in player).toBe(false);
      }

      expect(view.lastDrawnTile).toBe(seat === 0 ? state.lastDrawnTile : null);
      expect(view.wallRemaining).toBe(state.wall.replacementIndex - state.wall.drawIndex + 1);
      expect(view.dealerSeat).toBe(state.dealerSeat);
      expect('wall' in view).toBe(false);
      expect(view.pendingDiscard).toEqual({
        tile: 'p1',
        discarder: 1,
        respondedSeats: [0, 2],
      });
      expect('responses' in view.pendingDiscard!).toBe(false);
      expect(view.legalActions).toEqual(getLegalActions(state, seat));
    }

    const seatZeroView = projectStateForSeat(state, 0);
    expect(seatZeroView.events).toEqual([
      { type: 'draw', seat: 0, tile: 'm1', message: '0号玩家补摸1万' },
      { type: 'draw', seat: 1, tile: null, message: '1号玩家摸牌' },
      { type: 'mouth-declared', seat: 1, tile: null, message: '1号玩家报嘴' },
      { type: 'discard', seat: 1, tile: 'p2', message: '1号玩家打出2筒' },
    ]);

    const seatOneView = projectStateForSeat(state, 1);
    expect(seatOneView.events[0]).toEqual({
      type: 'draw',
      seat: 0,
      tile: null,
      message: '0号玩家摸牌',
    });
    expect(seatOneView.events[1]).toEqual({
      type: 'draw',
      seat: 1,
      tile: 'p1',
      message: '1号玩家补摸1筒',
    });
  });

  it('投影结果与内部状态相互独立', () => {
    const state = createGame({ seed: 11 });
    state.players[1]!.discards = ['m1'];
    state.phase = 'finished';
    state.result = {
      outcome: 'win',
      winner: 0,
      winType: 'self-draw',
      winningTile: 'm1',
      fan: { total: 1, items: [{ name: '测试番', fan: 1 }] },
      payments: [{ from: 1, to: 0, amount: 2, reason: 'win' }],
      reason: 'normal',
    };
    const view = projectStateForSeat(state, 0);

    const publicPlayer = view.players[1]!;
    const publicDiscards = publicPlayer.discards as unknown as string[];
    publicDiscards.push('p1');
    (view.events as GameEventView[]).push({
      type: 'round-draw',
      seat: null,
      tile: null,
      message: '伪造事件',
    });
    (view.legalActions as GameAction[]).push({ type: 'pass', seat: 0 });
    view.result!.fan!.items[0]!.fan = 99;
    view.result!.payments.push({ from: 2, to: 0, amount: 1, reason: 'win' });

    expect(state.players[1]!.discards).toEqual(['m1']);
    expect(state.events).not.toContainEqual(expect.objectContaining({ message: '伪造事件' }));
    expect(getLegalActions(state, 0)).not.toContainEqual({ type: 'pass', seat: 0 });
    expect(state.result!.fan!.items[0]!.fan).toBe(1);
    expect(state.result!.payments).toHaveLength(1);
  });

  it('观战视图不包含任何玩家暗手或合法动作', () => {
    const state = createGame({ seed: 12 });
    const view = projectStateForSpectator(state);
    expect(view.viewerSeat).toBeNull();
    expect(view.players.every((player) => player.visibility === 'public')).toBe(true);
    expect(view.players.every((player) => !('concealedTiles' in player))).toBe(true);
    expect(view.lastDrawnTile).toBeNull();
    expect(view.legalActions).toEqual([]);
  });
});
