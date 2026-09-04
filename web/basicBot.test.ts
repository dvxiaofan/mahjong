import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions } from '../src/game.js';
import type { GameState } from '../src/types.js';
import { chooseBasicBotAction, findNextBotAction } from './basicBot';

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

const winningBeforeSelfDraw = [
  'm1',
  'm1',
  'm1',
  'm2',
  'm2',
  'm2',
  'm3',
  'm3',
  'm3',
  'p1',
  'p1',
  'p1',
  's1',
] as const;

describe('本地基础 Bot', () => {
  it('只从规则引擎给出的动作中选择摸牌', () => {
    const state = blankState();
    state.currentSeat = 1;
    state.phase = 'awaiting-draw';
    state.drawMode = 'normal';

    expect(chooseBasicBotAction(state, 1)).toEqual({ type: 'draw', seat: 1 });
  });

  it('有自摸机会时优先胡牌', () => {
    const state = blankState();
    state.currentSeat = 1;
    state.phase = 'awaiting-discard';
    state.lastDrawnTile = 's1';
    state.players[1]!.concealedTiles = [...winningBeforeSelfDraw, 's1'];

    expect(chooseBasicBotAction(state, 1)).toEqual({ type: 'win', seat: 1 });
  });

  it('弃牌响应时可选择碰，否则安全过牌', () => {
    const state = blankState();
    state.phase = 'claiming';
    state.pendingDiscard = { tile: 'm1', discarder: 0, responses: {} };
    state.players[1]!.concealedTiles = ['m1', 'm1'];

    expect(chooseBasicBotAction(state, 1)).toEqual({ type: 'pong', seat: 1 });

    state.players[1]!.concealedTiles = [];
    expect(chooseBasicBotAction(state, 1)).toEqual({ type: 'pass', seat: 1 });
  });

  it('找到响应窗口中尚未响应的第一个 Bot', () => {
    const state = blankState();
    state.phase = 'claiming';
    state.pendingDiscard = { tile: 'm1', discarder: 0, responses: { 1: { type: 'pass' } } };

    const action = findNextBotAction(state);
    expect(action?.seat).toBe(2);
    expect(action?.type).toBe('pass');
  });

  it('Bot 动作可直接交给规则引擎推进', () => {
    const state = blankState();
    state.currentSeat = 1;
    state.phase = 'awaiting-draw';
    state.drawMode = 'normal';

    const action = chooseBasicBotAction(state, 1);
    if (action === null) throw new Error('Bot 没有动作');
    const next = applyAction(state, action);
    expect(next.phase).toBe('awaiting-discard');
    expect(next.currentSeat).toBe(1);
  });

  it('基础 Bot 配合默认人类动作可在有限步内完成一局', () => {
    let state = createGame({ seed: 20260904 });
    let steps = 0;

    while (state.phase !== 'finished' && state.phase !== 'drawn' && steps < 2000) {
      const action = findNextBotAction(state) ?? getLegalActions(state, 0)[0];
      if (action === undefined) throw new Error('本地对局出现无可执行动作的中间状态');
      state = applyAction(state, action);
      steps += 1;
    }

    expect(['finished', 'drawn']).toContain(state.phase);
    expect(steps).toBeLessThan(2000);
  });
});
