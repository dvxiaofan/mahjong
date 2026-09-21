import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../src/game.ts';
import { decideAiAction } from '../src/ai.ts';
import { createTileSet, sortTiles, type NormalTile, type Tile } from '../src/tiles.ts';
import { SEATS, type GameState, type Seat } from '../src/types.ts';
import { projectStateForSeat, projectStateForSpectator } from '../src/view.ts';
import { WinHelp, WinHelpDetails } from './components/WinHelp';
import { fortuneEligibilityText, getWinExplanation, winExplanationCopy } from './winExplanation';

const screenshotHand: NormalTile[] = [
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

function scenario({
  seat = 0,
  discard = false,
  fortunes = 1,
  hand = screenshotHand,
  tile = 'm7',
}: {
  seat?: Seat;
  discard?: boolean;
  fortunes?: number;
  hand?: readonly NormalTile[];
  tile?: NormalTile;
} = {}): GameState {
  const state = createGame({ seed: 20 });
  const pool = createTileSet();
  const take = (value: Tile) => {
    const index = pool.indexOf(value);
    if (index < 0) throw new Error(`超出四张上限：${value}`);
    pool.splice(index, 1);
  };
  hand.forEach(take);
  for (let index = 0; index < fortunes; index++) take('fortune');
  for (const player of state.players) {
    Object.assign(player, {
      concealedTiles: player.seat === seat ? [...hand] : [],
      melds: [],
      discards: [],
      gangs: [],
      score: 0,
      fortuneCount: player.seat === seat ? fortunes : 0,
      mouthDeclared: false,
      mouthRequired: false,
      lockedWaits: [],
    });
    while (player.seat !== seat && player.concealedTiles.length < 13) {
      const index = pool.findIndex((value) => value !== 'fortune');
      player.concealedTiles.push(pool.splice(index, 1)[0] as NormalTile);
    }
    player.concealedTiles = sortTiles(player.concealedTiles);
  }
  Object.assign(state, {
    wall: { tiles: pool, drawIndex: 0, replacementIndex: pool.length - 1 },
    currentSeat: seat,
    phase: 'awaiting-discard',
    drawMode: null,
    lastDrawnTile: tile,
    events: [],
    payments: [],
    pendingDiscard: null,
    result: null,
    drawAfterGang: false,
  });
  if (discard) {
    const source = ((seat + 3) % 4) as Seat;
    state.players[seat]!.concealedTiles.splice(
      state.players[seat]!.concealedTiles.indexOf(tile),
      1,
    );
    state.players[source]!.discards = [tile];
    Object.assign(state, {
      phase: 'claiming',
      currentSeat: source,
      lastDrawnTile: null,
      pendingDiscard: { discarder: source, tile, responses: {} },
    });
  }
  return state;
}

function expectLegalAgreement(state: GameState) {
  for (const seat of SEATS) {
    const view = projectStateForSeat(state, seat);
    expect(getWinExplanation(view)?.status === 'can-win', `${state.phase}: ${seat}号玩家`).toBe(
      view.legalActions.some((action) => action.type === 'win'),
    );
  }
  expect(getWinExplanation(projectStateForSpectator(state))).toBeNull();
}

describe('自己的胡牌说明与阶段限制', () => {
  it.each(SEATS)('%s号玩家自摸、接炮和报嘴前后与合法动作一致', (seat) => {
    for (const fortunes of [0, 1, 2, 3, 4]) {
      for (const discard of [false, true]) {
        let state = scenario({ seat, fortunes, discard });
        const view = projectStateForSeat(state, seat);
        const result = getWinExplanation(view)!;
        expectLegalAgreement(state);
        expect(sortTiles(result.tiles)).toEqual(sortTiles(screenshotHand));
        if (discard && fortunes >= 3) {
          expect(result.status).toBe('mouth-required');
          expect(result.canDeclareMouth).toBe(true);
          state = applyAction(state, { type: 'declare-mouth', seat });
          expectLegalAgreement(state);
          expect(getWinExplanation(projectStateForSeat(state, seat))?.status).toBe('can-win');
        }
      }
    }
  });

  it('截图中的真实三条导致牌型未成，保留剩余三八九条和发财条件', () => {
    const state = scenario({ hand: screenshotHand.map((tile) => (tile === 's7' ? 's3' : tile)) });
    const view = projectStateForSeat(state, 0);
    expectLegalAgreement(state);
    expect(getWinExplanation(view)?.status).toBe('incomplete-hand');
    const html = renderToStaticMarkup(<WinHelpDetails view={view} isReplaying={false} />);
    expect(html).toContain('牌型还未组成');
    expect(html).toContain('未成组的牌：3条、8条、9条');
    expect(html).toContain('不代表唯一搭配');
    expect(html).toContain('src="/tiles/s3.png');
    expect(html).not.toContain('src="/tiles/s7.png');
  });

  it('无发财接炮时既显示资格限制，也如实说明牌型是否组成', () => {
    for (const valid of [true, false]) {
      const view = projectStateForSeat(
        scenario({
          discard: true,
          fortunes: 0,
          hand: valid
            ? screenshotHand
            : screenshotHand.map((tile) => (tile === 's7' ? 's3' : tile)),
        }),
        0,
      );
      const html = renderToStaticMarkup(<WinHelpDetails view={view} isReplaying={false} />);
      expect(html).toContain('没有发财，只能自摸');
      expect(html).toContain(valid ? '牌型已组成' : '未成组的牌：3条、8条、9条');
    }
  });

  it('锁定听口约束自摸和接炮，报嘴自摸必须胡，接炮仍可过', () => {
    for (const discard of [false, true]) {
      const state = scenario({ discard, fortunes: 3 });
      Object.assign(state.players[0]!, { mouthDeclared: true, lockedWaits: ['m7'] });
      expectLegalAgreement(state);
      const view = projectStateForSeat(state, 0);
      expect(
        view.legalActions.some((action) => action.type === (discard ? 'pass' : 'discard')),
      ).toBe(discard);
      const html = renderToStaticMarkup(<WinHelpDetails view={view} isReplaying={false} />);
      expect(html).toContain('报嘴锁定听口：7万');
      expect(html).toContain('自摸成胡必须胡');
      state.players[0]!.lockedWaits = ['white'];
      expectLegalAgreement(state);
      const explanation = getWinExplanation(projectStateForSeat(state, 0))!;
      expect(explanation.status).toBe('outside-locked-waits');
      expect(winExplanationCopy(explanation)[0]).toContain('不在报嘴听口');
    }
  });

  it('同一弃牌响应过后不再建议报嘴或胡牌，也不会把自己的弃牌加回手牌', () => {
    let state = scenario({ discard: true, fortunes: 3 });
    const ownDiscard = getWinExplanation(projectStateForSeat(state, 3))!;
    expect(ownDiscard.status).toBe('own-discard');
    expect(ownDiscard.candidateTile).toBeNull();
    state = applyAction(state, { type: 'pass', seat: 0 });
    const result = getWinExplanation(projectStateForSeat(state, 0))!;
    expect(result.status).toBe('already-responded');
    expect(result.canDeclareMouth).toBe(false);
    expectLegalAgreement(state);
  });

  it('普通摸牌、杠后补牌和碰后出牌都不会被当成已摸牌自摸', () => {
    let state = scenario();
    state = applyAction(state, { type: 'discard', seat: 0, tile: 'm7' });
    for (const seat of [1, 2, 3] as const) state = applyAction(state, { type: 'pass', seat });
    expect(getWinExplanation(projectStateForSeat(state, 1))?.status).toBe('waiting-draw');
    expect(getWinExplanation(projectStateForSeat(state, 0))?.status).toBe('other-turn');
    expectLegalAgreement(state);

    const kongHand: NormalTile[] = [
      'm1',
      'm1',
      'm1',
      'm1',
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
      's7',
      's8',
      's9',
      'white',
    ];
    state = applyAction(scenario({ hand: kongHand, tile: 'white' }), {
      type: 'concealed-kong',
      seat: 0,
      tile: 'm1',
    });
    expect(getWinExplanation(projectStateForSeat(state, 0))?.status).toBe('waiting-replacement');
    expectLegalAgreement(state);
    state = applyAction(state, { type: 'draw', seat: 0 });
    expectLegalAgreement(state);

    const pongHand: NormalTile[] = [
      's1',
      's1',
      's1',
      'm1',
      'm2',
      'm3',
      'p4',
      'p5',
      'p6',
      's7',
      's8',
      's9',
      'white',
      'white',
    ];
    state = applyAction(scenario({ hand: pongHand, tile: 's1', discard: true }), {
      type: 'pong',
      seat: 0,
    });
    for (const seat of [1, 2] as const) state = applyAction(state, { type: 'pass', seat });
    const result = getWinExplanation(projectStateForSeat(state, 0))!;
    expect(result.status).toBe('no-drawn-tile');
    expect(result.tiles).toHaveLength(11);
    expectLegalAgreement(state);
  });

  it('局面缺少候选牌时不编造摸牌，结束和缺少自身信息时不显示私有说明', () => {
    const view = projectStateForSeat(scenario(), 0);
    expect(getWinExplanation({ ...view, lastDrawnTile: 'red' })?.status).toBe('missing-candidate');
    expect(getWinExplanation({ ...view, phase: 'claiming', pendingDiscard: null })?.status).toBe(
      'missing-candidate',
    );
    expect(
      getWinExplanation({ ...view, players: view.players.filter((player) => player.seat !== 0) }),
    ).toBeNull();
    for (const phase of ['finished', 'drawn'] as const)
      expect(getWinExplanation({ ...view, phase })).toBeNull();
  });

  it('回放清除合法动作后仍可解释当时牌型，提交和断线提示与规则资格分开', () => {
    const view = projectStateForSeat(scenario(), 0);
    const replay = { ...view, legalActions: [] };
    expect(getWinExplanation(replay)).toEqual(getWinExplanation(view));
    for (const props of [
      { view: replay, isReplaying: true },
      { view, isReplaying: false, actionPending: true },
      { view, isReplaying: false, actionDisabledReason: '连接已断开，请等待重连' },
    ]) {
      const html = renderToStaticMarkup(<WinHelpDetails {...props} />);
      expect(html).toContain('已满足自摸条件');
      expect(html).toContain(
        props.isReplaying ? '历史局面' : props.actionPending ? '正在提交操作' : '连接已断开',
      );
      expect(html).not.toContain('<button');
    }
  });

  it('只展开自己的说明，关闭时不提前生成分组，观战不出现私有帮助', () => {
    const state = scenario({ fortunes: 3 });
    const view = projectStateForSeat(state, 0);
    const before = JSON.stringify(view);
    const html = renderToStaticMarkup(<WinHelp view={view} isReplaying={false} />);
    expect(html).toContain('<summary>胡牌条件');
    expect(html).not.toContain('win-help-body');
    expect(JSON.stringify(view)).toBe(before);
    for (const Component of [WinHelp, WinHelpDetails]) {
      expect(
        renderToStaticMarkup(
          <Component view={projectStateForSpectator(state)} isReplaying={false} />,
        ),
      ).toBe('');
      expect(
        renderToStaticMarkup(
          <Component view={{ ...view, phase: 'finished' }} isReplaying={false} />,
        ),
      ).toBe('');
    }
    state.players[1]!.lockedWaits = ['red'];
    state.players[1]!.concealedTiles.reverse();
    expect(getWinExplanation(projectStateForSeat(state, 0))).toEqual(getWinExplanation(view));
  });

  it('自己的发财状态文案完整覆盖报嘴、待报嘴和自摸限制', () => {
    for (const fortunes of [0, 1, 3]) {
      const state = scenario({ fortunes });
      const player = getWinExplanation(projectStateForSeat(state, 0))!.player;
      expect(fortuneEligibilityText(player)).toContain(`你有 ${fortunes} 张发财`);
    }
    const state = scenario({ fortunes: 2 });
    state.players[0]!.mouthRequired = true;
    expect(
      fortuneEligibilityText(getWinExplanation(projectStateForSeat(state, 0))!.player),
    ).toContain('接炮须先报嘴');
    const result = getWinExplanation(
      projectStateForSeat(scenario({ fortunes: 3, discard: true }), 0),
    )!;
    expect(winExplanationCopy({ ...result, canDeclareMouth: false })[1]).toContain(
      '尚未满足报嘴条件',
    );
  });

  it.each([18, 67, 209])('实际完整对局 seed=%s 每次推进都与四家合法动作一致', (seed) => {
    let state = createGame({ seed });
    let steps = 0;
    while (state.result === null && steps < 800) {
      expectLegalAgreement(state);
      const decision = SEATS.map((seat) => decideAiAction(state, seat)).find(
        (entry) => entry !== null,
      );
      expect(decision).toBeDefined();
      state = applyAction(state, decision!.action);
      steps++;
    }
    expect(state.result).not.toBeNull();
    expectLegalAgreement(state);
  });
});
