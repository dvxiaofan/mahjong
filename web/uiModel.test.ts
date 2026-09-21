import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/game.js';
import { projectStateForSeat, projectStateForSpectator } from '../src/view.js';
import {
  findDiscardAction,
  formatActionForViewer,
  formatEventForViewer,
  getInteractionPrompt,
  getLatestDiscard,
  getSeatActivity,
  getSeatActivityLabel,
  getTurnLabel,
  matchesEventFilter,
  nonDiscardActions,
  seatLabel,
} from './uiModel';

describe('牌桌 UI 状态模型', () => {
  it('从合法动作中找到对应手牌的出牌动作', () => {
    const state = createGame({ seed: 20260904 });
    const view = projectStateForSeat(state, 0);
    const tile =
      view.players[0]!.visibility === 'self' ? view.players[0]!.concealedTiles[0]! : null;
    if (tile === null) throw new Error('缺少自己的手牌');

    expect(findDiscardAction(view.legalActions, tile)).toEqual({
      type: 'discard',
      seat: 0,
      tile,
    });
    expect(nonDiscardActions(view.legalActions)).toEqual([]);
  });

  it('根据摸牌、出牌和响应阶段给出操作提示', () => {
    let state = createGame({ seed: 20260904 });
    let view = projectStateForSeat(state, 0);
    expect(getInteractionPrompt(view, false)).toContain('点击一张手牌');

    const discard = view.legalActions.find((action) => action.type === 'discard');
    if (discard === undefined) throw new Error('缺少出牌动作');
    state = applyAction(state, discard);
    view = projectStateForSeat(state, 0);
    expect(getInteractionPrompt(view, true)).toContain('等待其他玩家响应');

    state.pendingDiscard = { tile: 'm1', discarder: 1, responses: {} };
    view = projectStateForSeat(state, 0);
    expect(getInteractionPrompt(view, true)).toContain('请响应');
  });

  it('响应窗口标记弃牌者、待响应和已响应座位', () => {
    const state = createGame({ seed: 3 });
    state.phase = 'claiming';
    state.pendingDiscard = {
      tile: 'm1',
      discarder: 0,
      responses: { 1: { type: 'pass' } },
    };
    const view = projectStateForSeat(state, 0);

    expect(getSeatActivity(view, 0)).toBe('discarder');
    expect(getSeatActivity(view, 1)).toBe('responded');
    expect(getSeatActivity(view, 2)).toBe('waiting');
    expect(getSeatActivity(view, 3)).toBe('waiting');
  });

  it('把座位、事件和动作转成查看者视角的称呼', () => {
    expect([0, 1, 2, 3].map((seat) => seatLabel(seat as 0 | 1 | 2 | 3, 0))).toEqual([
      '你',
      '下家',
      '对家',
      '上家',
    ]);
    expect(
      formatEventForViewer(
        {
          type: 'discard',
          seat: 1,
          tile: 'm1',
          message: '1号玩家打出1万',
        },
        0,
      ),
    ).toBe('下家打出1万');
    expect(formatActionForViewer({ type: 'discard', seat: 0, tile: 'p2' }, 0)).toBe('你打出 2筒');
  });

  it('响应提示优先于 AI 思考，并按查看座位说明出牌来源', () => {
    const state = createGame({ seed: 3 });
    state.phase = 'claiming';
    state.currentSeat = 1;
    state.pendingDiscard = { tile: 'p7', discarder: 1, responses: {} };

    const self = projectStateForSeat(state, 0);
    expect(getInteractionPrompt(self, true)).toBe('请响应下家打出的 7筒');
    expect(getInteractionPrompt(projectStateForSeat(state, 2), true)).toBe('请响应上家打出的 7筒');
    expect(getSeatActivityLabel(self, 0)).toBe('等你响应');
    expect(getSeatActivityLabel(self, 0, true)).toBe('待响应');
    expect(getTurnLabel(self)).toBe('等待各家响应');

    state.pendingDiscard.responses[0] = { type: 'pass' };
    const responded = projectStateForSeat(state, 0);
    expect(getInteractionPrompt(responded, true)).toBe('你已响应，等待其他玩家');
    expect(getSeatActivityLabel(responded, 0)).toBe('已响应');
    expect(getInteractionPrompt(projectStateForSpectator(state), true)).toContain('正在观战');
  });

  it('最新出牌来自公开弃牌事件，后续摸牌不会替换或泄露为出牌提示', () => {
    const state = createGame({ seed: 3 });
    expect(getLatestDiscard(projectStateForSeat(state, 0))).toBeNull();
    state.events.push({ type: 'discard', seat: 3, tile: 's8', message: '出牌' });
    const eventIndex = state.events.length - 1;
    state.events.push({ type: 'draw', seat: 0, tile: 'm9', message: '摸牌' });

    for (const view of [projectStateForSeat(state, 0), projectStateForSpectator(state)]) {
      expect(getLatestDiscard(view)).toEqual({ seat: 3, tile: 's8', eventIndex });
    }
    state.phase = 'claiming';
    state.pendingDiscard = { tile: 'p2', discarder: 1, responses: {} };
    expect(getLatestDiscard(projectStateForSeat(state, 0))).toMatchObject({ seat: 1, tile: 'p2' });
  });

  it('普通轮转和结算提示反映当前阶段，不在响应或结束时误标行动者', () => {
    const state = createGame({ seed: 3 });
    state.currentSeat = 2;
    state.phase = 'awaiting-draw';
    expect(getTurnLabel(projectStateForSeat(state, 0))).toBe('对家摸牌');
    expect(getSeatActivityLabel(projectStateForSeat(state, 0), 2)).toBe('待摸牌');
    state.phase = 'awaiting-discard';
    expect(getTurnLabel(projectStateForSeat(state, 0))).toBe('对家出牌');
    state.phase = 'finished';
    expect(getTurnLabel(projectStateForSeat(state, 0))).toBe('本局已结束');
    expect(getSeatActivity(projectStateForSeat(state, 0), 2)).toBe('idle');
  });

  it('按流程、特殊动作和结算筛选事件', () => {
    const discard = { type: 'discard', seat: 0, tile: 'm1', message: '' } as const;
    const fortune = { type: 'fortune', seat: 0, tile: null, message: '' } as const;
    const win = { type: 'win', seat: 0, tile: 'm1', message: '' } as const;
    expect(matchesEventFilter(discard, 'flow')).toBe(true);
    expect(matchesEventFilter(fortune, 'special')).toBe(true);
    expect(matchesEventFilter(win, 'settlement')).toBe(true);
    expect(matchesEventFilter(discard, 'settlement')).toBe(false);
  });
});
