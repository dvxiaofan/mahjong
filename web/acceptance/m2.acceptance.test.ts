import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions } from '../../src/game.js';
import type { GameState } from '../../src/types.js';
import { projectStateForSeat } from '../../src/view.js';

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

describe('M2 本地 UI 总验收场景', () => {
  it('A01：普通自摸生成三家支付和可投影结算', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 's1';
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw, 's1'];

    const next = applyAction(state, { type: 'win', seat: 0 });
    const view = projectStateForSeat(next, 0);

    expect(next.result).toMatchObject({ outcome: 'win', winner: 0, winType: 'self-draw' });
    expect(next.payments.map((payment) => payment.amount)).toEqual([2, 2, 2]);
    expect(view.result?.winner).toBe(0);
    expect(view.legalActions).toEqual([]);
  });

  it('A02：点炮可胡，报嘴玩家拒炮后后位玩家仍可胡', () => {
    const state = blankState();
    state.phase = 'claiming';
    state.pendingDiscard = { tile: 's1', discarder: 1, responses: {} };
    state.players[0]!.concealedTiles = [...winningBeforeSelfDraw];
    state.players[0]!.fortuneCount = 3;
    state.players[0]!.mouthDeclared = true;
    state.players[0]!.lockedWaits = ['s1'];
    state.players[2]!.concealedTiles = [...winningBeforeSelfDraw];
    state.players[2]!.fortuneCount = 1;

    let next = applyAction(state, { type: 'pass', seat: 0 });
    next = applyAction(next, { type: 'win', seat: 2 });
    next = applyAction(next, { type: 'pass', seat: 3 });

    expect(next.result).toMatchObject({ winner: 2, winType: 'discard' });
    expect(next.players[0]!.mouthDeclared).toBe(true);
  });

  it('A03：发财递归补牌进入发财区，普通补牌进入暗手', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-draw';
    state.drawMode = 'normal';
    state.players[0]!.concealedTiles = Array.from({ length: 13 }, () => 'm9' as const);
    state.wall.tiles = ['fortune', 'm1', 'fortune'];
    state.wall.drawIndex = 0;
    state.wall.replacementIndex = 2;

    const next = applyAction(state, { type: 'draw', seat: 0 });
    expect(next.players[0]!.fortuneCount).toBe(2);
    expect(next.players[0]!.concealedTiles).toContain('m1');
    expect(projectStateForSeat(next, 0).players[0]!.fortuneCount).toBe(2);
  });

  it('A04：暗杠、明杠和补杠均进入墙尾补牌流程', () => {
    const concealed = blankState();
    concealed.currentSeat = 0;
    concealed.phase = 'awaiting-discard';
    concealed.lastDrawnTile = 'm1';
    concealed.players[0]!.concealedTiles = ['m1', 'm1', 'm1', 'm1'];
    const afterConcealed = applyAction(concealed, { type: 'concealed-kong', seat: 0, tile: 'm1' });
    expect(afterConcealed.drawMode).toBe('replacement');

    const exposed = blankState();
    exposed.phase = 'claiming';
    exposed.pendingDiscard = { tile: 'm1', discarder: 0, responses: {} };
    exposed.players[0]!.discards = ['m1'];
    exposed.players[1]!.concealedTiles = ['m1', 'm1', 'm1'];
    let afterExposed = applyAction(exposed, { type: 'exposed-kong', seat: 1 });
    afterExposed = applyAction(afterExposed, { type: 'pass', seat: 2 });
    afterExposed = applyAction(afterExposed, { type: 'pass', seat: 3 });
    expect(afterExposed.drawMode).toBe('replacement');

    const supplement = blankState();
    supplement.currentSeat = 0;
    supplement.phase = 'awaiting-discard';
    supplement.lastDrawnTile = 'm1';
    supplement.players[0]!.concealedTiles = ['m1'];
    supplement.players[0]!.melds = [{ kind: 'pong', tile: 'm1', fromSeat: 1 }];
    const afterSupplement = applyAction(supplement, { type: 'supplement-kong', seat: 0, tile: 'm1' });
    expect(afterSupplement.drawMode).toBe('replacement');
    expect(afterSupplement.payments).toEqual([
      { from: 1, to: 0, amount: 1, reason: 'supplement-kong' },
    ]);
  });

  it('A05：报嘴锁定听口并在补杠后完成杠上开花', () => {
    const mouth = blankState();
    mouth.phase = 'claiming';
    mouth.pendingDiscard = { tile: 's1', discarder: 1, responses: {} };
    mouth.players[0]!.concealedTiles = [...winningBeforeSelfDraw];
    mouth.players[0]!.fortuneCount = 3;
    let afterMouth = applyAction(mouth, { type: 'declare-mouth', seat: 0 });
    expect(afterMouth.players[0]!.lockedWaits).toContain('s1');
    expect(getLegalActions(afterMouth, 0)).toContainEqual({ type: 'win', seat: 0 });

    const gang = blankState();
    gang.currentSeat = 0;
    gang.phase = 'awaiting-discard';
    gang.lastDrawnTile = 'm1';
    gang.players[0]!.concealedTiles = [
      'm2', 'm2', 'm2', 'm3', 'm3', 'm3',
      'p1', 'p1', 'p1', 's1', 'm1',
    ];
    gang.players[0]!.melds = [{ kind: 'pong', tile: 'm1', fromSeat: 1 }];
    gang.wall.tiles[gang.wall.replacementIndex] = 's1';
    let next = applyAction(gang, { type: 'supplement-kong', seat: 0, tile: 'm1' });
    next = applyAction(next, { type: 'draw', seat: 0 });
    next = applyAction(next, { type: 'win', seat: 0 });
    expect(next.result?.reason).toBe('gang-draw');
  });

  it('A06：荒庄退还即时补杠分并清空支付流水', () => {
    const state = blankState();
    state.currentSeat = 0;
    state.phase = 'awaiting-draw';
    state.drawMode = 'replacement';
    state.wall.drawIndex = 1;
    state.wall.replacementIndex = 0;
    state.players[0]!.score = 1;
    state.players[1]!.score = -1;
    state.payments = [{ from: 1, to: 0, amount: 1, reason: 'supplement-kong' }];
    state.players[0]!.gangs = [{
      kind: 'supplement', seat: 0, payer: 1, amount: 1,
      settlement: 'immediate', settled: true,
    }];

    const next = applyAction(state, { type: 'draw', seat: 0 });
    expect(next.result?.outcome).toBe('draw');
    expect(next.players.map((player) => player.score)).toEqual([0, 0, 0, 0]);
    expect(next.payments).toEqual([]);
  });
});
