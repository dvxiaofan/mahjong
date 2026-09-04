import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/game.js';
import { projectStateForSeat } from '../src/view.js';
import {
  findDiscardAction,
  formatActionForViewer,
  formatEventForViewer,
  getInteractionPrompt,
  getSeatActivity,
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
    expect(getInteractionPrompt(view, true)).toContain('对手正在');

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
