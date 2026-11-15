import { describe, expect, it } from 'vitest';
import type { RecordedAction } from './localSession';
import { buildReplayMarkers } from './replayMarkers';

const records: RecordedAction[] = [
  { action: { type: 'draw', seat: 0 }, source: 'auto-draw' },
  { action: { type: 'discard', seat: 0, tile: 'm1' }, source: 'human' },
  { action: { type: 'declare-mouth', seat: 1 }, source: 'bot' },
  { action: { type: 'pong', seat: 2 }, source: 'bot' },
  { action: { type: 'concealed-kong', seat: 3, tile: 'p9' }, source: 'bot' },
  { action: { type: 'win', seat: 2 }, source: 'bot' },
];

describe('关键节点复盘', () => {
  it('只标记报嘴、碰、三类杠和胡牌，并提供动作前后步数', () => {
    const markers = buildReplayMarkers(records, 0);
    expect(markers.map((marker) => [marker.kind, marker.beforeStep, marker.afterStep])).toEqual([
      ['mouth', 2, 3],
      ['pong', 3, 4],
      ['kong', 4, 5],
      ['win', 5, 6],
    ]);
    expect(markers[0]?.actionText).toContain('报嘴');
    expect(markers[2]?.actionText).toContain('暗杠');
  });

  it('没有关键动作时返回空列表', () => {
    expect(buildReplayMarkers(records.slice(0, 2), 0)).toEqual([]);
  });
});
