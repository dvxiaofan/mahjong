import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions } from './game.js';
import type { GameState } from './types.js';
import type { Tile } from './tiles.js';

const winningBeforeSelfDraw = [
  'm1', 'm1', 'm1',
  'm2', 'm2', 'm2',
  'm3', 'm3', 'm3',
  'p1', 'p1', 'p1',
  's1',
] as const;

function blankState(): GameState {
  const state = createGame({
    dealerSeat: 0,
    wallTiles: Array.from({ length: 120 }, () => 'm9' as const),
  });
  for (const player of state.players) {
    player.concealedTiles = [];
    player.melds = [];
    player.discards = [];
    player.fortuneCount = 0;
    player.mouthDeclared = false;
    player.lockedWaits = [];
    player.mouthRequired = false;
    player.score = 0;
    player.gangs = [];
  }
  state.events = [];
  state.payments = [];
  state.result = null;
  state.pendingDiscard = null;
  state.lastDrawnTile = null;
  state.drawAfterGang = false;
  return state;
}

function winningStateWithEndGang(kind: 'concealed' | 'exposed'): GameState {
  const state = blankState();
  state.currentSeat = 0;
  state.phase = 'awaiting-discard';
  state.lastDrawnTile = 's1';
  state.players[0]!.concealedTiles = [
    'm2', 'm2', 'm2',
    'm3', 'm3', 'm3',
    'p1', 'p1', 'p1',
    's1', 's1',
  ];
  state.players[0]!.melds = kind === 'concealed'
    ? [{ kind: 'concealed-kong', tile: 'm1' }]
    : [{ kind: 'exposed-kong', tile: 'm1', fromSeat: 2 }];
  state.players[0]!.gangs = [{
    kind,
    seat: 0,
    payer: kind === 'exposed' ? 2 : null,
    amount: 1,
    settlement: 'end',
    settled: false,
  }];
  return state;
}

describe('牌局状态机', () => {
  it('按庄家开始逆时针发牌，庄家14张其余13张', () => {
    const state = createGame({
      dealerSeat: 2,
      wallTiles: Array.from({ length: 120 }, (_, index) => (index % 2 === 0 ? 'm1' : 'm2')),
    });
    expect(state.players.map((player) => player.concealedTiles.length)).toEqual([13, 13, 14, 13]);
    expect(state.events.slice(0, 8).map((event) => event.seat)).toEqual([2, 3, 0, 1, 2, 3, 0, 1]);
  });

  it('准确保留庄家最后一张起牌，不受手牌排序影响', () => {
    const wallTiles: Tile[] = Array.from({ length: 120 }, () => 'm9');
    wallTiles[52] = 'm1';
    const state = createGame({ dealerSeat: 0, wallTiles });
    expect(state.lastDrawnTile).toBe('m1');
    expect(state.players[0]!.concealedTiles.at(-1)).toBe('m9');
  });

  it('非庄家起手即有四张同牌时，在摸牌前可宣布暗杠', () => {
    const state = blankState();
    state.currentSeat = 1;
    state.phase = 'awaiting-draw';
    state.drawMode = 'normal';
    state.players[1]!.concealedTiles = ['m1', 'm1', 'm1', 'm1', 'p1', 'p2', 'p3', 's1', 's2', 's3', 'red', 'red', 'white'];
    expect(getLegalActions(state, 1)).toContainEqual({ type: 'concealed-kong', seat: 1, tile: 'm1' });
    const next = applyAction(state, { type: 'concealed-kong', seat: 1, tile: 'm1' });
    expect(next.players[1]!.melds).toContainEqual({ kind: 'concealed-kong', tile: 'm1' });
    expect(next.phase).toBe('awaiting-draw');
    expect(next.drawMode).toBe('replacement');
  });

  it('杠后等待墙尾补牌时不能跳过补牌再次宣布暗杠', () => {
    const state = blankState();
    state.currentSeat = 1;
    state.phase = 'awaiting-draw';
    state.drawMode = 'replacement';
    state.players[1]!.concealedTiles = ['m1', 'm1', 'm1', 'm1', 'p1', 'p2', 'p3', 's1', 's2', 's3'];
    expect(getLegalActions(state, 1)).not.toContainEqual({ type: 'concealed-kong', seat: 1, tile: 'm1' });
    expect(getLegalActions(state, 1)).toContainEqual({ type: 'draw', seat: 1 });
  });

  it('三张以上发财未报嘴可自摸，报嘴后点炮可拒绝且保持锁定', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 's1';
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw, 's1'];
    state.players[0]!.fortuneCount = 3;
    state.players[0]!.mouthRequired = true;
    expect(getLegalActions(state, 0)).toContainEqual({ type: 'win', seat: 0 });

    state.phase = 'claiming';
    state.lastDrawnTile = null;
    state.pendingDiscard = { tile: 's1', discarder: 1, responses: {} };
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw];
    state.players[0]!.mouthDeclared = true;
    state.players[0]!.lockedWaits = ['s1'];
    const actions = getLegalActions(state, 0);
    expect(actions).toContainEqual({ type: 'win', seat: 0 });
    expect(actions).toContainEqual({ type: 'pass', seat: 0 });
    const passed = applyAction(state, { type: 'pass', seat: 0 });
    expect(passed.players[0]!.mouthDeclared).toBe(true);
  });

  it('报嘴后摸到非胡牌张只能原张打出', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 's2';
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw.slice(0, 12), 's1', 's2'];
    state.players[0]!.fortuneCount = 3;
    state.players[0]!.mouthDeclared = true;
    state.players[0]!.lockedWaits = ['s1'];
    expect(getLegalActions(state, 0)).toEqual([{ type: 'discard', seat: 0, tile: 's2' }]);
  });

  it('持有三张以上发财时，可在点炮响应前先报嘴再胡', () => {
    const state = blankState();
    state.phase = 'claiming';
    state.currentSeat = 1;
    state.pendingDiscard = { tile: 's1', discarder: 1, responses: {} };
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw];
    state.players[0]!.fortuneCount = 3;

    expect(getLegalActions(state, 0)).toContainEqual({ type: 'declare-mouth', seat: 0 });
    let next = applyAction(state, { type: 'declare-mouth', seat: 0 });
    expect(next.players[0]!.lockedWaits).toEqual(['s1']);
    expect(getLegalActions(next, 0)).toContainEqual({ type: 'win', seat: 0 });
  });

  it('点炮胡后将获胜牌并入胡牌者暗手', () => {
    const state = blankState();
    state.phase = 'claiming';
    state.currentSeat = 1;
    state.pendingDiscard = { tile: 's1', discarder: 1, responses: {} };
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw];
    state.players[0]!.fortuneCount = 1;

    let next = applyAction(state, { type: 'win', seat: 0 });
    next = applyAction(next, { type: 'pass', seat: 2 });
    next = applyAction(next, { type: 'pass', seat: 3 });
    expect(next.result?.winner).toBe(0);
    expect(next.players[0]!.concealedTiles).toHaveLength(14);
    expect(next.players[0]!.concealedTiles.filter((tile) => tile === 's1')).toHaveLength(2);
  });

  it('自摸按番数向三家收取正确金额，并记录番数明细', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 's1';
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw, 's1'];
    state.players[0]!.fortuneCount = 2;

    const next = applyAction(state, { type: 'win', seat: 0 });

    expect(next.result?.fan).toEqual({
      total: 3,
      items: [
        { name: '碰碰胡', fan: 1 },
        { name: '发财', fan: 2 },
      ],
    });
    expect(next.payments).toEqual([
      { from: 1, to: 0, amount: 4, reason: 'win' },
      { from: 2, to: 0, amount: 4, reason: 'win' },
      { from: 3, to: 0, amount: 4, reason: 'win' },
    ]);
    expect(next.players.map((player) => player.score)).toEqual([12, -4, -4, -4]);
  });

  it('点炮只由点炮者支付，并按胡牌者自己的发财数计分', () => {
    const state = blankState();
    state.phase = 'claiming';
    state.pendingDiscard = { tile: 's1', discarder: 2, responses: {} };
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw];
    state.players[0]!.fortuneCount = 1;

    let next = applyAction(state, { type: 'win', seat: 0 });
    next = applyAction(next, { type: 'pass', seat: 1 });
    next = applyAction(next, { type: 'pass', seat: 3 });

    expect(next.result?.fan?.total).toBe(2);
    expect(next.payments).toEqual([
      { from: 2, to: 0, amount: 3, reason: 'win' },
    ]);
    expect(next.players.map((player) => player.score)).toEqual([3, 0, -3, 0]);
  });

  it('报嘴后清一色碰碰胡点炮，按全部番种合计结算', () => {
    const state = blankState();
    state.phase = 'claiming';
    state.pendingDiscard = { tile: 'm5', discarder: 1, responses: {} };
    state.players[0]!.concealedTiles = [
      'm1', 'm1', 'm1',
      'm2', 'm2', 'm2',
      'm3', 'm3', 'm3',
      'm4', 'm4', 'm4',
      'm5',
    ];
    state.players[0]!.fortuneCount = 3;

    let next = applyAction(state, { type: 'declare-mouth', seat: 0 });
    expect(next.players[0]!.lockedWaits).toEqual(['m2', 'm3', 'm4', 'm5', 'm6']);
    next = applyAction(next, { type: 'win', seat: 0 });
    next = applyAction(next, { type: 'pass', seat: 2 });
    next = applyAction(next, { type: 'pass', seat: 3 });

    expect(next.result?.fan).toEqual({
      total: 5,
      items: [
        { name: '碰碰胡', fan: 1 },
        { name: '清一色', fan: 1 },
        { name: '发财', fan: 3 },
      ],
    });
    expect(next.payments).toEqual([
      { from: 1, to: 0, amount: 6, reason: 'win' },
    ]);
    expect(next.players.map((player) => player.score)).toEqual([6, -6, 0, 0]);
  });

  it('暗杠终局向其余三家各收1分', () => {
    const state = winningStateWithEndGang('concealed');

    const next = applyAction(state, { type: 'win', seat: 0 });

    expect(next.payments).toEqual([
      { from: 1, to: 0, amount: 1, reason: 'concealed-kong' },
      { from: 2, to: 0, amount: 1, reason: 'concealed-kong' },
      { from: 3, to: 0, amount: 1, reason: 'concealed-kong' },
      { from: 1, to: 0, amount: 2, reason: 'win' },
      { from: 2, to: 0, amount: 2, reason: 'win' },
      { from: 3, to: 0, amount: 2, reason: 'win' },
    ]);
    expect(next.players.map((player) => player.score)).toEqual([9, -3, -3, -3]);
  });

  it('明杠终局只向点杠者收1分', () => {
    const state = winningStateWithEndGang('exposed');

    const next = applyAction(state, { type: 'win', seat: 0 });

    expect(next.payments).toEqual([
      { from: 2, to: 0, amount: 1, reason: 'exposed-kong' },
      { from: 1, to: 0, amount: 2, reason: 'win' },
      { from: 2, to: 0, amount: 2, reason: 'win' },
      { from: 3, to: 0, amount: 2, reason: 'win' },
    ]);
    expect(next.players.map((player) => player.score)).toEqual([7, -2, -3, -2]);
  });

  it('补杠即时收分，杠上自摸后保留该补杠分', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 'm1';
    state.players[0]!.concealedTiles = [
      'm2', 'm2', 'm2',
      'm3', 'm3', 'm3',
      'p1', 'p1', 'p1',
      's1',
      'm1',
    ];
    state.players[0]!.melds = [{ kind: 'pong', tile: 'm1', fromSeat: 1 }];
    state.wall.tiles[state.wall.replacementIndex] = 's1';

    let next = applyAction(state, { type: 'supplement-kong', seat: 0, tile: 'm1' });
    expect(next.players.map((player) => player.score)).toEqual([1, -1, 0, 0]);
    expect(next.payments).toEqual([
      { from: 1, to: 0, amount: 1, reason: 'supplement-kong' },
    ]);

    next = applyAction(next, { type: 'draw', seat: 0 });
    next = applyAction(next, { type: 'win', seat: 0 });
    expect(next.result?.reason).toBe('gang-draw');
    expect(next.payments).toEqual([
      { from: 1, to: 0, amount: 1, reason: 'supplement-kong' },
      { from: 1, to: 0, amount: 2, reason: 'win' },
      { from: 2, to: 0, amount: 2, reason: 'win' },
      { from: 3, to: 0, amount: 2, reason: 'win' },
    ]);
    expect(next.players.map((player) => player.score)).toEqual([7, -3, -2, -2]);
  });

  it('荒庄时暗杠和明杠均不结算', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-draw';
    state.drawMode = 'replacement';
    state.wall.drawIndex = 1;
    state.wall.replacementIndex = 0;
    state.players[0]!.gangs = [{
      kind: 'concealed',
      seat: 0,
      payer: null,
      amount: 1,
      settlement: 'end',
      settled: false,
    }];
    state.players[1]!.gangs = [{
      kind: 'exposed',
      seat: 1,
      payer: 0,
      amount: 1,
      settlement: 'end',
      settled: false,
    }];

    const next = applyAction(state, { type: 'draw', seat: 0 });

    expect(next.phase).toBe('drawn');
    expect(next.payments).toEqual([]);
    expect(next.players.map((player) => player.score)).toEqual([0, 0, 0, 0]);
  });

  it('发财递归补牌的发财进入发财区，最终普通牌进入手牌', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-draw';
    state.drawMode = 'normal';
    state.players[0]!.concealedTiles = Array.from({ length: 13 }, () => 'm9' as const);
    state.wall.tiles = Array.from({ length: 13 }, (_, index) =>
      index === 10 ? 'fortune' : index === 11 ? 'm1' : index === 12 ? 'fortune' : 'm9',
    );
    state.wall.drawIndex = 10;
    state.wall.replacementIndex = 12;

    const next = applyAction(state, { type: 'draw', seat: 0 });
    expect(next.players[0]!.fortuneCount).toBe(2);
    expect(next.players[0]!.concealedTiles).toContain('m1');
    expect(next.players[0]!.concealedTiles).not.toContain('fortune');
    expect(next.lastDrawnTile).toBe('m1');
  });

  it('补杠立即进入补牌阶段，不产生抢杠胡响应窗口', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 'm1';
    state.players[0]!.concealedTiles = ['m2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'p1', 'p2', 'p3', 'm1'];
    state.players[0]!.melds = [{ kind: 'pong', tile: 'm1', fromSeat: 1 }];
    expect(getLegalActions(state, 0)).toContainEqual({ type: 'supplement-kong', seat: 0, tile: 'm1' });

    const next = applyAction(state, { type: 'supplement-kong', seat: 0, tile: 'm1' });
    expect(next.pendingDiscard).toBeNull();
    expect(next.phase).toBe('awaiting-draw');
    expect(getLegalActions(next, 1)).toEqual([]);
  });

  it('同一弃牌按弃牌者下家顺序竞争，即使下家不是庄家也优先', () => {
    const state = blankState();
    state.dealerSeat = 0;
    state.phase = 'claiming';
    state.pendingDiscard = { tile: 's1', discarder: 2, responses: {} };
    state.players[3]!.concealedTiles = ['s1', 's1'];
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw];
    state.players[0]!.fortuneCount = 1;

    let next = applyAction(state, { type: 'win', seat: 0 });
    next = applyAction(next, { type: 'pass', seat: 1 });
    next = applyAction(next, { type: 'pong', seat: 3 });
    expect(next.phase).toBe('awaiting-discard');
    expect(next.currentSeat).toBe(3);
    expect(next.players[3]!.melds).toContainEqual({ kind: 'pong', tile: 's1', fromSeat: 2 });
    expect(next.result).toBeNull();
  });

  it('前位玩家过牌后，下一位仍可对同一弃牌声明胡牌', () => {
    const state = blankState();
    state.phase = 'claiming';
    state.pendingDiscard = { tile: 's1', discarder: 2, responses: {} };
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw];
    state.players[0]!.fortuneCount = 1;
    state.players[3]!.concealedTiles = [...winningBeforeSelfDraw];
    state.players[3]!.fortuneCount = 1;

    let next = applyAction(state, { type: 'pass', seat: 3 });
    next = applyAction(next, { type: 'win', seat: 0 });
    next = applyAction(next, { type: 'pass', seat: 1 });

    expect(next.result?.winner).toBe(0);
    expect(next.result?.winType).toBe('discard');
  });

  it('荒庄时退还已即时支付的补杠分', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-draw';
    state.drawMode = 'replacement';
    state.wall.drawIndex = 1;
    state.wall.replacementIndex = 0;
    state.players[0]!.score = 1;
    state.players[1]!.score = -1;
    state.payments = [{ from: 1, to: 0, amount: 1, reason: 'supplement-kong' }];
    state.players[0]!.gangs = [{ kind: 'supplement', seat: 0, payer: 1, amount: 1, settlement: 'immediate', settled: true }];

    const next = applyAction(state, { type: 'draw', seat: 0 });
    expect(next.phase).toBe('drawn');
    expect(next.players.map((player) => player.score)).toEqual([0, 0, 0, 0]);
    expect(next.payments).toEqual([]);
    expect(next.result?.outcome).toBe('draw');
  });
});
