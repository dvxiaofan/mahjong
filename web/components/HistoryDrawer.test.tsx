import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../../src/game.ts';
import { projectStateForSeat } from '../../src/view.ts';
import type { RecordedAction } from '../localSession';
import { HistoryDrawer } from './HistoryDrawer';

const records: RecordedAction[] = [
  { action: { type: 'draw', seat: 0 }, source: 'auto-draw' },
  { action: { type: 'discard', seat: 0, tile: 'm1' }, source: 'human' },
  { action: { type: 'declare-mouth', seat: 1 }, source: 'bot' },
  { action: { type: 'win', seat: 1 }, source: 'bot' },
];

describe('牌局记录关键节点', () => {
  it('展示报嘴和胡牌，并提供动作前后跳转', () => {
    const view = projectStateForSeat(createGame({ seed: 8, dealerSeat: 0 }), 0);
    const html = renderToStaticMarkup(
      <HistoryDrawer
        onClose={() => undefined}
        onReplayStep={() => undefined}
        onResumeLive={() => undefined}
        open
        records={records}
        replayStep={null}
        view={view}
      />,
    );
    expect(html).toContain('关键节点');
    expect(html).toContain('报嘴');
    expect(html).toContain('胡牌');
    expect(html).toContain('第 3 步');
    expect(html).toContain('>前<');
    expect(html).toContain('>后<');
  });
});
