import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analyzeCoach, createCoachReview } from '../../src/coach.ts';
import { rankStrategicDiscards } from '../../src/ai-strategy.ts';
import { createGame } from '../../src/game.ts';
import { projectStateForSeat } from '../../src/view.ts';
import type { PlayerView } from '../../src/types.ts';
import { DEFAULT_HAND_SETTINGS } from '../handSettings';
import { SelfHand } from '../components/SelfHand';
import { CoachPanel } from './CoachPanel';
import { CoachToggle } from './CoachToggle';
import type { CoachModel } from './useCoach';

function riskModel(): CoachModel {
  const state = createGame({ seed: 5, dealerSeat: 0 });
  state.players[1]!.fortuneCount = 1;
  const analysis = analyzeCoach(state, 0);
  return {
    analysis,
    review: null,
    mode: 'risk',
    canDiscard: true,
    notice: null,
  };
}

describe('教练面板', () => {
  it('风险态显示三家摘要、风险排序与估算边界', () => {
    const html = renderToStaticMarkup(<CoachPanel model={riskModel()} />);
    expect(html).toContain('出牌风险');
    expect(html).toContain('这巡打出去后');
    expect(html).toContain('放炮风险');
    expect(html).toContain('下家');
    expect(html).toContain('概率按当前 AI 难度与公开信息估算');
    expect(html).not.toContain('和教练一致');
  });

  it('点评态保留上一步，并允许切到本巡风险', () => {
    const state = createGame({ seed: 3, dealerSeat: 0 });
    state.players[1]!.fortuneCount = 1;
    const ranked = rankStrategicDiscards(state, 0);
    const review = createCoachReview(state, 0, ranked[0]!.tile);
    if (review === null) throw new Error('missing review');
    const model: CoachModel = {
      analysis: analyzeCoach(state, 0),
      review,
      mode: 'review',
      canDiscard: true,
      notice: null,
    };
    const html = renderToStaticMarkup(<CoachPanel model={model} />);
    expect(html).toContain('出牌点评');
    expect(html).toContain('上步点评');
    expect(html).toContain('本巡风险');
    expect(html).toContain('你打的');
    expect(html).toContain('教练会打');
    expect(html).toContain('可见进张');
    expect(html).toContain(review.summary);
  });

  it('终局点评收成紧凑卡片', () => {
    const state = createGame({ seed: 3, dealerSeat: 0 });
    state.players[1]!.fortuneCount = 1;
    const ranked = rankStrategicDiscards(state, 0);
    const review = createCoachReview(state, 0, ranked[0]!.tile);
    if (review === null) throw new Error('missing review');
    const html = renderToStaticMarkup(
      <CoachPanel
        compact
        model={{
          analysis: analyzeCoach(state, 0),
          review,
          mode: 'review',
          canDiscard: false,
          notice: null,
        }}
      />,
    );
    expect(html).toContain('coach-panel--compact');
    expect(html).toContain('教练点评');
    expect(html).toContain(review.summary);
    expect(html).not.toContain('本巡风险');
  });

  it('开关有明确文本和按压状态', () => {
    const on = renderToStaticMarkup(<CoachToggle enabled onChange={() => undefined} />);
    const off = renderToStaticMarkup(<CoachToggle enabled={false} onChange={() => undefined} />);
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('教练模式 · 开');
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('教练模式 · 关');
  });
});

describe('手牌风险角标', () => {
  it('风险牌只显示点位角标，读屏名称带百分比', () => {
    const view = projectStateForSeat(createGame({ seed: 3, dealerSeat: 0 }), 0);
    const player = view.players[0] as PlayerView;
    const tile = player.concealedTiles[0]!;
    const html = renderToStaticMarkup(
      <SelfHand
        player={player}
        actions={view.legalActions}
        lastDrawnTile={view.lastDrawnTile}
        onAction={() => undefined}
        interaction={{
          context: view,
          settings: { ...DEFAULT_HAND_SETTINGS, confirmation: 'direct' },
          confirmDiscard: false,
          saved: true,
          update: () => undefined,
        }}
        tileRisks={{ [tile]: 0.11 }}
      />,
    );
    expect(html).toContain('tile-risk-marker--high');
    expect(html).toContain('放炮风险约 11%');
    expect(html).not.toContain('12%');
  });

  it('没有风险映射时不渲染教练角标', () => {
    const view = projectStateForSeat(createGame({ seed: 3, dealerSeat: 0 }), 0);
    const player = view.players[0] as PlayerView;
    const html = renderToStaticMarkup(
      <SelfHand
        player={player}
        actions={view.legalActions}
        lastDrawnTile={view.lastDrawnTile}
        onAction={() => undefined}
      />,
    );
    expect(html).not.toContain('tile-risk-marker');
    expect(html).not.toContain('放炮风险');
  });
});
