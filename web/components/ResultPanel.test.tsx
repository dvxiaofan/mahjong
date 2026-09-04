import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game.js';
import { projectStateForSeat } from '../../src/view.js';
import { ResultPanel } from './ResultPanel';

describe('结算面板', () => {
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
      payments: [
        { from: 1, to: 0, amount: 4, reason: 'win' },
      ],
      reason: 'normal',
    };

    const html = renderToStaticMarkup(
      <ResultPanel view={projectStateForSeat(state, 0)} onReset={() => undefined} />,
    );

    expect(html).toContain('恭喜，你胡了');
    expect(html).toContain('自摸');
    expect(html).toContain('3 番');
    expect(html).toContain('碰碰胡 +1');
    expect(html).toContain('2号玩家 → 你 · 胡牌 4 分');
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
