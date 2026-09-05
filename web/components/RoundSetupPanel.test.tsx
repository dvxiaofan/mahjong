import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoundSetupPanel } from './RoundSetupPanel';

describe('定庄与开门面板', () => {
  it('显示四家首轮骰子、并列加赛和最终首庄', () => {
    const html = renderToStaticMarkup(
      <RoundSetupPanel
        dealerReason="initial-dice"
        dealerSelection={{
          dealerSeat: 2,
          winningRoll: [6, 6],
          rounds: [
            {
              candidates: [0, 1, 2, 3],
              rolls: { 0: [5, 5], 1: [2, 3], 2: [4, 6], 3: [1, 2] },
            },
            {
              candidates: [0, 2],
              rolls: { 0: [3, 4], 2: [6, 6] },
            },
          ],
        }}
        opening={{
          rollerSeat: 2,
          dice: [6, 6],
          total: 12,
          wallSeat: 1,
          stack: 11,
          tileOffset: 82,
        }}
        roundNumber={1}
        viewerSeat={0}
      />,
    );

    expect(html).toContain('首轮比骰');
    expect(html).toContain('第 2 轮 · 并列加赛');
    expect(html).toContain('对家坐庄');
    expect(html).toContain('下家牌墙 · 第 12 墩');
    expect(html.match(/12 点/g)).toHaveLength(2);
  });

  it('后续局明确显示赢家接庄和本局开门骰', () => {
    const html = renderToStaticMarkup(
      <RoundSetupPanel
        dealerReason="previous-winner"
        dealerSelection={null}
        opening={{
          rollerSeat: 1,
          dice: [2, 4],
          total: 6,
          wallSeat: 2,
          stack: 5,
          tileOffset: 70,
        }}
        roundNumber={2}
        viewerSeat={0}
      />,
    );

    expect(html).toContain('第 2 局');
    expect(html).toContain('上局赢家接庄');
    expect(html).toContain('下家坐庄');
    expect(html).toContain('本局开门骰');
  });
});
