import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game.ts';
import { projectStateForSeat, projectStateForSpectator } from '../../src/view.ts';
import type { GameAudienceView } from '../../src/types.ts';
import { MahjongTable } from './MahjongTable';

function responseState() {
  const state = createGame({ seed: 3 });
  state.phase = 'claiming';
  state.currentSeat = 1;
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
  state.pendingDiscard = { tile: 'p7', discarder: 1, responses: {} };
  state.players[1]!.discards.push('p7');
  state.events.push({ type: 'discard', seat: 1, tile: 'p7', message: '1号玩家打出7筒' });
  return state;
}

function renderTable(
  view: GameAudienceView,
  isReplaying = false,
  options: Partial<ComponentProps<typeof MahjongTable>> = {},
) {
  return renderToStaticMarkup(
    <MahjongTable
      view={view}
      botThinking
      isReplaying={isReplaying}
      onAction={() => undefined}
      onReset={() => undefined}
      {...options}
    />,
  );
}

describe('牌桌出牌与操作提示', () => {
  it('牌桌提供常驻中央局况盘，四向座位仍围绕中央排列', () => {
    const html = renderTable(projectStateForSeat(createGame({ seed: 3 }), 0));
    expect(html).toContain('class="table-dial"');
    expect(html).toContain('aria-label="牌局局况"');
    expect(html).toContain('seat-slot--north');
    expect(html).toContain('seat-slot--west');
    expect(html).toContain('seat-slot--east');
    expect(html).toContain('seat-slot--south');
  });

  it('局况与最近出牌集中在中央盘，不新增重复的操作区或出牌提示', () => {
    const html = renderTable(projectStateForSeat(responseState(), 0));
    expect(html.match(/aria-label="出牌提示"/g)).toHaveLength(1);
    expect(html.match(/aria-label="我方操作"/g)).toHaveLength(1);
    const dialStart = html.indexOf('class="table-dial"');
    const dial = html.slice(dialStart, html.indexOf('</section>', dialStart));
    expect(dial).toContain('牌墙剩余');
    expect(dial).toContain('aria-label="出牌提示"');
    expect(dial).toContain('class="response-details"');
    expect(dial).toContain('庄家');
    expect(dial).toContain('当前：等待各家响应');
  });

  it('待响应牌在中央独立浮层展示，来源牌区只保留隐藏的小牌占位', () => {
    const html = renderTable(projectStateForSeat(responseState(), 0));
    expect(html.match(/class="table-discard-overlay"/g)).toHaveLength(1);
    expect(html).toContain('data-discard-source="1"');
    expect(html).toContain('discard-target--floating');
    expect(html.indexOf('class="table-discard-overlay"')).toBeLessThan(html.indexOf('<article'));
    const sourceStart = html.indexOf('data-seat="1"');
    const source = html.slice(sourceStart, html.indexOf('</article>', sourceStart));
    expect(source).not.toContain('table-discard-overlay');
    expect(source).not.toContain('discard-entry--featured');
  });

  it('响应动作只出现在我方手牌所在牌区，其他座位和下方面板没有重复操作区', () => {
    const html = renderTable(projectStateForSeat(responseState(), 0));
    const selfStart = html.indexOf('data-seat="0"');
    const selfEnd = html.indexOf('</article>', selfStart);
    const self = html.slice(selfStart, selfEnd);
    expect(self).toContain('aria-label="我方操作"');
    expect(self).toContain('title="碰"');
    expect(self).toContain('title="过"');
    expect(self.indexOf('aria-label="我方操作"')).toBeGreaterThan(
      self.indexOf('aria-label="自己的手牌"'),
    );
    expect(html.match(/aria-label="我方操作"/g)).toHaveLength(1);
  });

  it('联网提交中或暂不可操作时关闭动作和手牌，同时显示原因', () => {
    const view = projectStateForSeat(createGame({ seed: 3 }), 0);
    expect(view.legalActions.length).toBeGreaterThan(0);
    for (const options of [
      { actionPending: true },
      { actionDisabledReason: '连接已断开，重连后继续操作' },
    ]) {
      const html = renderTable(view, false, options);
      expect(html).not.toContain('class="action-button');
      expect(html).not.toContain('aria-label="打出');
      expect(html).toContain(
        options.actionPending ? '正在提交，请等待牌局确认' : '连接已断开，重连后继续操作',
      );
    }
    const claiming = renderTable(projectStateForSeat(responseState(), 0), false, {
      actionPending: true,
    });
    expect(claiming).not.toContain('等你响应');
  });

  it('将实际牌面、出牌来源和我方响应提示集中展示', () => {
    const html = renderTable(projectStateForSeat(responseState(), 0));
    expect(html).toContain('aria-label="出牌提示"');
    expect(html).toContain('下家（2号位）打出 7筒');
    expect(html).toContain('src="/tiles/p7.png"');
    expect(html.match(/请响应下家打出的 7筒/g)).toHaveLength(1);
    expect(html).toContain('class="response-details"');
    expect(html).toContain('下家 · 出牌者');
    expect(html).toContain('player-seat--discarder');
    expect(html).toContain('当前：等待各家响应');
  });

  it('已响应后移除操作催促，保留其他玩家的等待状态', () => {
    const state = responseState();
    state.pendingDiscard!.responses[0] = { type: 'pass' };
    const html = renderTable(projectStateForSeat(state, 0));
    expect(html).toContain('你已响应，等待其他玩家');
    expect(html).toContain('你 · 已响应');
    expect(html).not.toContain('discard-notice--attention');
    expect(html).not.toContain('等你响应');
  });

  it('响应按钮预留固定位置，提交或断线后不会用别的动作替换过牌位置', () => {
    const view = projectStateForSeat(responseState(), 0);
    for (const options of [
      {},
      { actionPending: true },
      { actionPending: true, actionDisabledReason: '连接已断开，重连后继续操作' },
    ]) {
      const html = renderTable(view, false, options);
      expect(
        [...html.matchAll(/data-response-action="([^"]+)"/g)].map((match) => match[1]),
      ).toEqual(['win', 'pong', 'exposed-kong', 'declare-mouth', 'pass']);
      if (options.actionDisabledReason !== undefined) {
        expect(html).toContain(options.actionDisabledReason);
        expect(html).not.toContain('正在提交，请等待牌局确认');
      }
    }
  });

  it('回放与观战没有交互动作，观战以绝对座位标识来源', () => {
    const state = responseState();
    // Deliberately retain legal actions: the table must enforce its replay boundary itself.
    const replay = renderTable(projectStateForSeat(state, 0), true);
    expect(replay).toContain('回放 · 待响应出牌');
    expect(replay).not.toContain('class="action-button');
    expect(replay).not.toContain('等你响应');
    const replayHand = renderTable(projectStateForSeat(createGame({ seed: 3 }), 0), true);
    expect(replayHand).not.toContain('aria-label="打出');

    const spectator = renderTable(projectStateForSpectator(state));
    expect(spectator).toContain('2号玩家（2号位）打出 7筒');
    expect(spectator).toContain('1号玩家牌区');
    expect(spectator).not.toContain('我方');
    expect(spectator).not.toContain('class="action-button');
  });
});
