import { applyAction, createGame, getLegalActions } from '../../src/game.ts';
import { sortTiles, tileLabel, type NormalTile } from '../../src/tiles.ts';
import type { GameAction, GameState, Seat } from '../../src/types.ts';

export type TutorialScenarioId = 'fortune' | 'without-fortune' | 'mouth' | 'kong';

export interface TutorialExpectedAction {
  type: GameAction['type'];
  tile?: NormalTile;
}

export interface TutorialStep {
  title: string;
  prompt: string;
  detail: string;
  expected: TutorialExpectedAction;
  success: string;
}

export interface TutorialScenario {
  id: TutorialScenarioId;
  title: string;
  subtitle: string;
  initialState: GameState;
  steps: readonly TutorialStep[];
}

export interface TutorialCatalogItem {
  id: TutorialScenarioId;
  title: string;
  subtitle: string;
}

export const TUTORIAL_CATALOG: readonly TutorialCatalogItem[] = [
  {
    id: 'fortune',
    title: '发财补牌',
    subtitle: '摸到发财后，从牌墙末尾补一张，并自动加 1 番',
  },
  {
    id: 'without-fortune',
    title: '零财不能接炮',
    subtitle: '没有发财可以自摸，但别人打出的胡牌张不能接',
  },
  {
    id: 'mouth',
    title: '三财先报嘴',
    subtitle: '三张以上发财听牌后，接炮前必须先报嘴',
  },
  {
    id: 'kong',
    title: '杠后补牌',
    subtitle: '杠牌后不能直接出牌，必须先从牌墙末尾补摸',
  },
];

const WINNING_THIRTEEN: readonly NormalTile[] = [
  'm1',
  'm1',
  'm1',
  'm2',
  'm2',
  'm2',
  'm3',
  'm3',
  'm3',
  'p1',
  'p1',
  'p1',
  's1',
];

function blankState(): GameState {
  const state = createGame({
    dealerSeat: 0,
    wallTiles: Array.from({ length: 120 }, () => 'm9' as const),
  });
  for (const player of state.players) {
    player.concealedTiles = [];
    player.melds = [];
    player.discards = [];
    player.fortuneCount = 0;
    player.mouthDeclared = false;
    player.lockedWaits = [];
    player.mouthRequired = false;
    player.score = 0;
    player.gangs = [];
  }
  state.events = [];
  state.payments = [];
  state.result = null;
  state.pendingDiscard = null;
  state.lastDrawnTile = null;
  state.drawAfterGang = false;
  return state;
}

function seat(state: GameState, value: Seat) {
  const player = state.players[value];
  if (player === undefined) throw new Error(`缺少 ${value} 号玩家`);
  return player;
}

function withWall(state: GameState, tiles: GameState['wall']['tiles']): GameState {
  state.wall = {
    tiles,
    drawIndex: 0,
    replacementIndex: tiles.length - 1,
  };
  return state;
}

function fortuneScenario(): TutorialScenario {
  const state = withWall(blankState(), ['fortune', 'p9', 's1']);
  state.currentSeat = 0;
  state.phase = 'awaiting-draw';
  state.drawMode = 'normal';
  seat(state, 0).concealedTiles = sortTiles(WINNING_THIRTEEN);

  return {
    id: 'fortune',
    title: '发财补牌',
    subtitle: '发财不是手牌，摸到就亮出，并从牌墙末尾补摸一张。',
    initialState: state,
    steps: [
      {
        title: '从牌墙摸一张',
        prompt: '点击「摸牌」，看看发财怎样触发补牌。',
        detail: '发财不会进入手牌，它会增加番数，再从牌墙末尾补一张普通牌。',
        expected: { type: 'draw' },
        success: '摸到发财后自动补到 1 条。发财数变成 1，手牌也听 1 条了。',
      },
      {
        title: '补牌后自摸',
        prompt: '补到的牌正好成胡，点击「胡牌」。',
        detail: '发财只提供番数，不占手牌位置；成牌仍由万、筒、条和红中白板组成。',
        expected: { type: 'win' },
        success: '这手牌现在是碰碰胡，另有 1 张发财，共 2 番。',
      },
    ],
  };
}

function withoutFortuneScenario(): TutorialScenario {
  const state = blankState();
  state.currentSeat = 1;
  state.phase = 'claiming';
  state.pendingDiscard = { tile: 's1', discarder: 1, responses: {} };
  seat(state, 0).concealedTiles = sortTiles(WINNING_THIRTEEN);

  return {
    id: 'without-fortune',
    title: '零财不能接炮',
    subtitle: '零财时，别人打出的牌即使能成胡，也不能接炮。',
    initialState: state,
    steps: [
      {
        title: '看看能做什么',
        prompt: '下家打出 1 条，但你没有发财。点击「过」。',
        detail: '零财只限制接炮；自己摸到 1 条仍然可以自摸。',
        expected: { type: 'pass' },
        success: '正确。零财不能接炮，但下一巡如果自摸 1 条，仍然可以胡。',
      },
    ],
  };
}

function mouthScenario(): TutorialScenario {
  const state = blankState();
  state.currentSeat = 1;
  state.phase = 'claiming';
  state.pendingDiscard = { tile: 's1', discarder: 1, responses: {} };
  seat(state, 0).concealedTiles = sortTiles(WINNING_THIRTEEN);
  seat(state, 0).fortuneCount = 3;
  seat(state, 0).mouthRequired = true;

  return {
    id: 'mouth',
    title: '三财先报嘴',
    subtitle: '三张以上发财听牌后，接炮前必须报嘴锁定听口。',
    initialState: state,
    steps: [
      {
        title: '先报嘴',
        prompt: '你有 3 张发财，下家打出 1 条。先点击「报嘴」。',
        detail: '报嘴会锁定当前听口，并解除“只能自摸”的限制。',
        expected: { type: 'declare-mouth' },
        success: '报嘴完成，1 条已经锁定为听口。现在可以接这张炮。',
      },
      {
        title: '再接炮',
        prompt: '报嘴后，点击「胡牌」接下家的 1 条。',
        detail: '如果报嘴后改听，锁定听口仍然是报嘴时的 1 条。',
        expected: { type: 'win' },
        success: '这就是“三财先报嘴再胡”。报嘴前不能直接接炮。',
      },
    ],
  };
}

function kongScenario(): TutorialScenario {
  const state = withWall(blankState(), ['p5']);
  state.currentSeat = 0;
  state.phase = 'awaiting-discard';
  state.lastDrawnTile = 'p9';
  seat(state, 0).concealedTiles = sortTiles([
    'm1',
    'm1',
    'm1',
    'm1',
    'm2',
    'm2',
    'm2',
    'm3',
    'm3',
    'm3',
    'p1',
    'p1',
    'p1',
    'p9',
  ]);

  return {
    id: 'kong',
    title: '杠后补牌',
    subtitle: '杠牌后不能直接继续出牌，必须先从牌墙末尾补摸。',
    initialState: state,
    steps: [
      {
        title: '暗杠四张 1 万',
        prompt: '手里有四张 1 万，点击「暗杠 1万」。',
        detail: '暗杠的四张牌会亮在副露区，但牌面仍然对其他人隐藏。',
        expected: { type: 'concealed-kong', tile: 'm1' },
        success: '暗杠完成。接下来必须先补牌，不能跳过。',
      },
      {
        title: '从墙尾补摸',
        prompt: '点击「摸牌」，补杠后的一张牌。',
        detail: '补牌从牌墙末尾取，与普通摸牌方向相反。',
        expected: { type: 'draw' },
        success: '补到 5 筒。只有完成补牌后，才会继续处理这一巡的后续动作。',
      },
    ],
  };
}

export function buildTutorialScenario(id: TutorialScenarioId): TutorialScenario {
  if (id === 'fortune') return fortuneScenario();
  if (id === 'without-fortune') return withoutFortuneScenario();
  if (id === 'mouth') return mouthScenario();
  return kongScenario();
}

export function tutorialTargetAction(state: GameState, step: TutorialStep): GameAction | null {
  return (
    getLegalActions(state, 0).find(
      (action) =>
        action.type === step.expected.type &&
        (step.expected.tile === undefined ||
          ('tile' in action && action.tile === step.expected.tile)),
    ) ?? null
  );
}

export function applyTutorialAction(
  state: GameState,
  step: TutorialStep,
  action: GameAction,
): GameState {
  const target = tutorialTargetAction(state, step);
  if (target === null || target.type !== action.type) {
    throw new Error('这个动作不是本步的教学目标');
  }
  if ('tile' in target && (!('tile' in action) || target.tile !== action.tile)) {
    throw new Error('请按提示选择对应牌张');
  }
  return applyAction(state, action);
}

export function tutorialStepSummary(step: TutorialStep): string {
  if (step.expected.tile === undefined) return step.title;
  return `${step.title}：${tileLabel(step.expected.tile)}`;
}
