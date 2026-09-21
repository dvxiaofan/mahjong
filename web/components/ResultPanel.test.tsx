import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game.js';
import { projectStateForSeat, projectStateForSpectator } from '../../src/view.js';
import { SEATS } from '../../src/types.js';
import { ResultPanel } from './ResultPanel';

describe('结算面板', () => {
  it.each(SEATS)('%s号玩家胡牌后，四家和观战均可查看同一四面子一将拆分', (winner) => {
    const state = createGame({ seed: 2 });
    state.phase = 'finished';
    state.players[winner]!.concealedTiles = [
      'm4',
      'm5',
      'm6',
      'm7',
      'm7',
      'p5',
      'p6',
      'p6',
      'p7',
      'p7',
      'p8',
      's7',
      's8',
      's9',
    ];
    state.result = {
      outcome: 'win',
      winner,
      winType: 'self-draw',
      winningTile: 'm7',
      fan: { total: 0, items: [] },
      payments: [],
      reason: 'normal',
    };
    for (const view of [
      ...SEATS.map((seat) => projectStateForSeat(state, seat)),
      projectStateForSpectator(state),
    ]) {
      const html = renderToStaticMarkup(<ResultPanel view={view} onReset={() => undefined} />);
      expect(html).toContain('胡牌牌型拆解');
      expect(html).toContain('4 组面子 + 1 对将牌');
      expect(html).toContain('将牌：7万、7万');
      expect(html).toContain('顺子：5筒、6筒、7筒');
      expect(html).toContain('顺子：6筒、7筒、8筒');
      expect(html.match(/role="group"/g)).toHaveLength(5);
    }
  });

  it('显示胡牌类型、番数、得分和支付流水', () => {
    const state = createGame({ seed: 1 });
    state.phase = 'finished';
    state.players[0]!.score = 12;
    state.players[1]!.score = -4;
    state.players[2]!.score = -4;
    state.players[3]!.score = -4;
    state.result = {
      outcome: 'win',
      winner: 0,
      winType: 'self-draw',
      winningTile: 'm1',
      fan: {
        total: 3,
        items: [
          { name: '碰碰胡', fan: 1 },
          { name: '发财', fan: 2 },
        ],
      },
      payments: [{ from: 1, to: 0, amount: 4, reason: 'win' }],
      reason: 'normal',
    };

    const html = renderToStaticMarkup(
      <ResultPanel view={projectStateForSeat(state, 0)} onReset={() => undefined} />,
    );

    expect(html).toContain('恭喜，你胡了');
    expect(html).toContain('自摸');
    expect(html).toContain('3 番');
    expect(html).toContain('碰碰胡 +1');
    expect(html).toContain('下家 → 你 · 胡牌 4 分');
    expect(html).toContain('再来一局');
  });

  it('荒庄时说明杠分作废', () => {
    const state = createGame({ seed: 2 });
    state.phase = 'drawn';
    state.result = {
      outcome: 'draw',
      winner: null,
      winType: null,
      winningTile: null,
      fan: null,
      payments: [],
      reason: 'wall-exhausted',
    };

    const html = renderToStaticMarkup(
      <ResultPanel view={projectStateForSeat(state, 0)} onReset={() => undefined} />,
    );
    expect(html).toContain('本局荒庄');
    expect(html).toContain('杠分全部作废');
  });
});
