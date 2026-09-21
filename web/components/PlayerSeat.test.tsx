import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PlayerView } from '../../src/types.ts';
import { PlayerSeat } from './PlayerSeat';

function playerWithFortunes(fortuneCount: number): PlayerView {
  return {
    seat: 0,
    visibility: 'self',
    concealedTileCount: 0,
    concealedTiles: [],
    melds: [],
    discards: [],
    fortuneCount,
    mouthDeclared: false,
    lockedWaits: [],
    mouthRequired: false,
    score: 0,
    gangs: [],
  };
}

describe('玩家座位牌面', () => {
  it('亮出终局手牌与碰杠，胡牌张只出现一次且不能出牌', () => {
    const player = {
      ...playerWithFortunes(1),
      visibility: 'revealed' as const,
      concealedTiles: ['m1', 'm1', 'm1', 'm2', 'm2', 'm2', 'm3', 'm3', 'm3', 'p7', 'p7'] as const,
      concealedTileCount: 11,
      melds: [{ kind: 'concealed-kong' as const, tile: 's1' as const }],
    };
    const html = renderToStaticMarkup(
      <PlayerSeat
        activity="idle"
        dealer={false}
        lastDrawnTile={null}
        legalActions={[]}
        onAction={() => undefined}
        player={player}
        position="north"
        winningTile="p7"
      />,
    );
    expect(html).toContain('本局亮牌');
    expect(html).toContain('胡牌张 7筒');
    expect(html).not.toContain('背面牌');
    expect(html).not.toContain('<button');
    expect(html.match(/data-tile="p7"/g)).toHaveLength(2);
    expect(html.match(/data-tile="s1"/g)).toHaveLength(4);
    expect(html.match(/data-tile=/g)).toHaveLength(16);
  });

  it('中央展示时来源牌区只保留最后一张的小牌占位，不放大或误隐藏旧同牌', () => {
    const player: PlayerView = {
      ...playerWithFortunes(0),
      discards: [...Array.from({ length: 25 }, () => 'm1' as const), 'p7', 'm2', 'p7'],
    };
    const html = renderToStaticMarkup(
      <PlayerSeat
        activity="discarder"
        dealer={false}
        lastDrawnTile={null}
        legalActions={[]}
        onAction={() => undefined}
        player={player}
        position="south"
        discardHighlight={{
          presentation: {
            id: '27:0:p7',
            eventIndex: 27,
            seat: 0,
            tile: 'p7',
            discardIndex: 27,
            outcome: 'pending',
            claimedBy: null,
          },
          floating: true,
        }}
      />,
    );
    expect(html.match(/discard-target--floating/g)).toHaveLength(1);
    expect(html).toContain('aria-hidden="true" data-discard-id="27:0:p7"');
    expect(html).not.toContain('discard-entry--featured');
    expect(html.match(/data-tile="p7"/g)).toHaveLength(2);
    expect(html.match(/data-tile=/g)).toHaveLength(18);
  });

  it('发财区同时展示素材牌面和明确数量', () => {
    const html = renderToStaticMarkup(
      <PlayerSeat
        activity="idle"
        dealer={false}
        lastDrawnTile={null}
        legalActions={[]}
        onAction={() => undefined}
        player={playerWithFortunes(2)}
        position="south"
      />,
    );

    expect(html.match(/data-tile="fortune"/g)).toHaveLength(2);
    expect(html.match(/src="\/tiles\/fortune\.png"/g)).toHaveLength(2);
    expect(html).toContain('× 2');
  });
});

describe('联网座位身份角标', () => {
  function render(decoration: { name?: string; host?: boolean; bot?: boolean } | undefined) {
    return renderToStaticMarkup(
      <PlayerSeat
        activity="idle"
        dealer={false}
        decoration={decoration}
        lastDrawnTile={null}
        legalActions={[]}
        onAction={() => undefined}
        player={playerWithFortunes(0)}
        position="south"
      />,
    );
  }

  it('房主座位显示皇冠角标和昵称，机器人座位显示机器人角标', () => {
    const host = render({ name: '玩家甲', host: true });
    expect(host).toContain('seat-badge--host');
    expect(host).toContain('房主');
    expect(host).toContain('玩家甲');
    expect(host).not.toContain('seat-badge--bot');
    const bot = render({ name: '机器人甲', bot: true });
    expect(bot).toContain('seat-badge--bot');
    expect(bot).not.toContain('seat-badge--host');
  });

  it('本地对局没有装饰信息时不渲染任何角标', () => {
    const html = render(undefined);
    expect(html).not.toContain('seat-badge');
    expect(html).not.toContain('seat-name');
  });
});
