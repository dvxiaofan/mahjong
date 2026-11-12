import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game';
import { projectStateForSeat, projectStateForSpectator } from '../src/view';
import { actionNoticeGlyph, getTableActionNotice } from './tableFeedback';

describe('中央动作提示', () => {
  it('杠类提示用明/暗/补区分，紧凑提示即使隐藏副标签也不会混淆', () => {
    expect(actionNoticeGlyph('exposed-kong')).toBe('明');
    expect(actionNoticeGlyph('concealed-kong')).toBe('暗');
    expect(actionNoticeGlyph('supplement-kong')).toBe('补');
    expect(actionNoticeGlyph('pong')).toBe('碰');
    expect(actionNoticeGlyph('win')).toBe('胡');
  });

  it.each(['pong', 'exposed-kong', 'concealed-kong', 'supplement-kong', 'win'] as const)(
    '识别 %s 并忽略后续摸牌、支付事件',
    (kind) => {
      const state = createGame({ seed: 3 });
      const before = state.events.length;
      state.events.push({ type: kind, seat: 2, tile: 'p7', message: '公开动作' });
      state.events.push({ type: 'gang-payment', seat: 2, tile: null, message: '杠分' });
      state.events.push({ type: 'draw', seat: 2, tile: 's1', message: '私人摸牌' });
      for (const view of [projectStateForSeat(state, 0), projectStateForSpectator(state)]) {
        expect(getTableActionNotice(view, before)).toMatchObject({ seat: 2, kind, tile: 'p7' });
        expect(getTableActionNotice(view, before + 1)).toBeNull();
      }
    },
  );

  it('同一批新消息只提示最新动作，旧动作不因快照或同牌再出现而重播', () => {
    const state = createGame({ seed: 3 });
    state.events = [
      { type: 'pong', seat: 1, tile: 'p7', message: '碰' },
      { type: 'win', seat: 2, tile: 'p7', message: '胡' },
    ];
    const view = projectStateForSeat(state, 0);
    expect(getTableActionNotice(view, 0)).toMatchObject({ seat: 2, kind: 'win' });
    expect(getTableActionNotice(view, 2)).toBeNull();
  });
});
