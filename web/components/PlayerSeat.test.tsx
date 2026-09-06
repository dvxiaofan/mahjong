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
  it('发财区同时展示实体矢量牌和明确数量', () => {
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
