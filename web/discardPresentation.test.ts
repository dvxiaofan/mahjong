import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/game.ts';
import { projectStateForSeat, projectStateForSpectator } from '../src/view.ts';
import {
  getDiscardPresentation,
  shouldAnimateDiscard,
  type DiscardObservation,
} from './discardPresentation';

function claiming() {
  const state = createGame({ seed: 3 });
  state.phase = 'claiming';
  state.currentSeat = 1;
  state.pendingDiscard = {
    tile: 'p7',
    discarder: 1,
    responses: { 2: { type: 'pass' }, 3: { type: 'pass' } },
  };
  state.players[1]!.discards = ['p7', 'p7'];
  state.players[0]!.concealedTiles = [
    'm1',
    'm1',
    'm1',
    'm2',
    'm2',
    'm2',
    'p1',
    'p1',
    'p1',
    'p7',
    'p7',
    's1',
    's2',
  ];
  state.events = [
    { type: 'discard', seat: 1, tile: 'p7', message: '旧弃牌' },
    { type: 'discard', seat: 1, tile: 'p7', message: '新弃牌' },
  ];
  return state;
}

describe('新弃牌展示与归位', () => {
  it('等待响应期间定位最新一张；全部过牌后保持同一张弃牌和标识', () => {
    const state = claiming();
    const pending = getDiscardPresentation(projectStateForSeat(state, 0));
    expect(pending).toMatchObject({ seat: 1, tile: 'p7', discardIndex: 1, outcome: 'pending' });
    const next = applyAction(state, { type: 'pass', seat: 0 });
    expect(getDiscardPresentation(projectStateForSeat(next, 0))).toMatchObject({
      id: pending!.id,
      discardIndex: 1,
      outcome: 'unclaimed',
    });
    expect(next.players[1]!.discards).toEqual(['p7', 'p7']);
  });

  it.each(['pong', 'exposed-kong'] as const)('%s 后不能把较早的同牌误当作新弃牌', (type) => {
    const state = claiming();
    if (type === 'exposed-kong') state.players[0]!.concealedTiles[0] = 'p7';
    const next = applyAction(state, { type, seat: 0 });
    expect(next.players[1]!.discards).toEqual(['p7']);
    for (const view of [projectStateForSeat(next, 0), projectStateForSpectator(next)]) {
      expect(getDiscardPresentation(view)).toMatchObject({
        outcome: type,
        claimedBy: 0,
        discardIndex: null,
      });
    }
  });

  it('点炮胡后移除新弃牌，但自摸不会误移除同牌的旧弃牌', () => {
    const state = claiming();
    state.players[0]!.concealedTiles = [
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
      'p7',
    ];
    state.players[0]!.fortuneCount = 1;
    const won = applyAction(state, { type: 'win', seat: 0 });
    expect(getDiscardPresentation(projectStateForSeat(won, 0))).toMatchObject({
      outcome: 'win',
      claimedBy: 0,
      discardIndex: null,
    });
    expect(won.players[1]!.discards).toEqual(['p7']);

    state.phase = 'awaiting-discard';
    state.currentSeat = 0;
    state.pendingDiscard = null;
    state.lastDrawnTile = 'p7';
    state.players[0]!.concealedTiles.push('p7');
    const selfDraw = applyAction(state, { type: 'win', seat: 0 });
    expect(getDiscardPresentation(projectStateForSeat(selfDraw, 0))).toMatchObject({
      outcome: 'unclaimed',
      claimedBy: null,
      discardIndex: 1,
    });
  });

  it('没有出牌记录时不从私人摸牌推断提示', () => {
    expect(getDiscardPresentation(projectStateForSeat(createGame({ seed: 3 }), 0))).toBeNull();
  });
});

describe('新弃牌动画的状态边界', () => {
  const baseline: DiscardObservation = {
    roundKey: 'round-1',
    viewerSeat: 0,
    live: true,
    eventCount: 20,
    discardId: '19:1:p7',
  };

  it('只播放新收到的出牌；快速连续出牌只突出最新一张', () => {
    const next = { ...baseline, eventCount: 25, discardId: '24:3:m1' };
    expect(shouldAnimateDiscard(baseline, next)).toBe(true);
    expect(shouldAnimateDiscard(next, { ...next, eventCount: 30, discardId: '29:0:p2' })).toBe(
      true,
    );
    expect(shouldAnimateDiscard(next, { ...next, eventCount: 26 })).toBe(false);
  });

  it.each([
    ['首次加载', baseline, baseline],
    ['回放', baseline, { ...baseline, live: false, eventCount: 22, discardId: '21:1:p7' }],
    ['回退', baseline, { ...baseline, eventCount: 10, discardId: '9:2:p7' }],
    [
      '新一局',
      baseline,
      { ...baseline, roundKey: 'round-2', eventCount: 22, discardId: '21:1:p7' },
    ],
    [
      '切换座位',
      baseline,
      { ...baseline, viewerSeat: 2 as const, eventCount: 22, discardId: '21:1:p7' },
    ],
    [
      '断线恢复',
      { ...baseline, live: false },
      { ...baseline, eventCount: 22, discardId: '21:1:p7' },
    ],
  ])('%s 不把历史快照当成新的出牌动画', (_name, previous, next) => {
    expect(shouldAnimateDiscard(previous as DiscardObservation, next as DiscardObservation)).toBe(
      false,
    );
  });
});
