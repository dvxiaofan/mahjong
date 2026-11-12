import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions } from '../../src/game.ts';
import { projectStateForSeat } from '../../src/view.ts';
import { getLatestVoiceClip, voiceClipUrl } from '../tableAudio';
import { getTableActionNotice } from '../tableFeedback';
import { eventTypeLabel, formatEventForViewer } from '../uiModel';
import { MahjongTable } from '../components/MahjongTable';
import { ResultPanel } from '../components/ResultPanel';

function exposedKongState() {
  const state = createGame({ seed: 31 });
  state.events = [];
  state.phase = 'claiming';
  state.currentSeat = 1;
  state.drawMode = null;
  state.players[0]!.concealedTiles = [
    'p1',
    'p1',
    'p1',
    'm1',
    'm2',
    'm3',
    'm7',
    'm8',
    'm9',
    's5',
    's6',
    's7',
    'white',
  ];
  state.players[1]!.discards = ['p1'];
  state.pendingDiscard = {
    tile: 'p1',
    discarder: 1,
    responses: { 2: { type: 'pass' }, 3: { type: 'pass' } },
  };
  return state;
}

describe('弃牌明杠的反馈链路', () => {
  it('从弃牌杠下时，事件、牌组、中央提示和语音都使用明杠', () => {
    const before = exposedKongState();
    expect(getLegalActions(before, 0)).toContainEqual({ type: 'exposed-kong', seat: 0 });

    const after = applyAction(before, { type: 'exposed-kong', seat: 0 });
    const event = after.events.at(-1);
    expect(event).toMatchObject({
      type: 'exposed-kong',
      seat: 0,
      tile: 'p1',
      message: '0号玩家明杠1筒',
    });
    expect(after.players[0]!.melds).toContainEqual({
      kind: 'exposed-kong',
      tile: 'p1',
      fromSeat: 1,
    });

    const view = projectStateForSeat(after, 0);
    expect(eventTypeLabel(view.events.at(-1)!.type)).toBe('明杠');
    expect(formatEventForViewer(view.events.at(-1)!, 0)).toBe('你明杠1筒');
    expect(getTableActionNotice(view, 0)).toMatchObject({
      kind: 'exposed-kong',
      label: '明杠',
      tile: 'p1',
    });
    expect(getLatestVoiceClip(view, 0)).toBe('exposed-kong');
    expect(voiceClipUrl('exposed-kong', 'male')).toContain('mandarin-male');

    const html = renderToStaticMarkup(
      <MahjongTable
        view={view}
        botThinking={false}
        isReplaying={false}
        onAction={() => undefined}
        onReset={() => undefined}
      />,
    );
    expect(html).toContain('明杠');
    expect(html).not.toContain('暗杠');
  });

  it('终局杠分保留明杠原因，结算面板不会改写成暗杠', () => {
    let state = applyAction(exposedKongState(), { type: 'exposed-kong', seat: 0 });
    state.phase = 'claiming';
    state.currentSeat = 1;
    state.pendingDiscard = {
      tile: 'white',
      discarder: 1,
      responses: { 2: { type: 'pass' }, 3: { type: 'pass' } },
    };
    state.players[1]!.discards.push('white');
    state.players[0]!.fortuneCount = 1;

    state = applyAction(state, { type: 'win', seat: 0 });
    expect(state.result?.payments).toContainEqual({
      from: 1,
      to: 0,
      amount: 1,
      reason: 'exposed-kong',
    });

    const html = renderToStaticMarkup(
      <ResultPanel view={projectStateForSeat(state, 0)} onReset={() => undefined} />,
    );
    expect(html).toContain('明杠');
    expect(html).not.toContain('暗杠');
  });
});
