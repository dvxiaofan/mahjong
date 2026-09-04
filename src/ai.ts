import { getLegalActions } from './game.js';
import type { GameAction, GamePhase, GameState, Seat } from './types.js';

export type AiTurnKind = 'draw' | 'self-action' | 'claim' | 'terminal';
export type AiDecisionSource = 'policy' | 'fallback';

export interface AiPolicyChoice {
  action: GameAction;
  reason: string;
  candidates?: readonly AiDecisionCandidate[];
}

export interface AiDecisionCandidate {
  action: GameAction;
  score: number;
  reasons: readonly string[];
}

export interface AiPolicyInput {
  state: GameState;
  seat: Seat;
  turnKind: AiTurnKind;
  legalActions: readonly GameAction[];
}

export interface AiPolicy {
  id: string;
  choose(input: AiPolicyInput): AiPolicyChoice | null;
}

export interface AiDecision {
  action: GameAction;
  reason: string;
  policyId: string;
  source: AiDecisionSource;
  turnKind: AiTurnKind;
  legalActionCount: number;
  candidates: AiDecisionCandidate[];
}

const basicPriority: Record<GamePhase, readonly GameAction['type'][]> = {
  'awaiting-draw': ['declare-mouth', 'concealed-kong', 'draw'],
  'awaiting-discard': ['win', 'declare-mouth', 'supplement-kong', 'concealed-kong', 'discard'],
  claiming: ['win', 'declare-mouth', 'exposed-kong', 'pong', 'pass'],
  finished: [],
  drawn: [],
};

const actionReasons: Record<GameAction['type'], string> = {
  draw: '轮到本座摸牌',
  discard: '基础策略选择第一张合法弃牌',
  win: '当前牌型满足胡牌条件',
  pass: '没有收益更高的合法响应',
  pong: '当前弃牌可以组成碰牌',
  'exposed-kong': '当前弃牌可以组成明杠',
  'concealed-kong': '暗手具备合法暗杠',
  'supplement-kong': '摸到已有碰牌的第四张，可补杠',
  'declare-mouth': '满足三财听牌条件，优先报嘴',
};

function sameAction(left: GameAction, right: GameAction): boolean {
  if (left.type !== right.type || left.seat !== right.seat) return false;
  if ('tile' in left || 'tile' in right) {
    return 'tile' in left && 'tile' in right && left.tile === right.tile;
  }
  return true;
}

function firstActionOfType(
  actions: readonly GameAction[],
  type: GameAction['type'],
): GameAction | null {
  return actions.find((action) => action.type === type) ?? null;
}

function chooseFallbackAction(state: GameState, actions: readonly GameAction[]): GameAction {
  if (state.phase === 'claiming') {
    return firstActionOfType(actions, 'pass') ?? actions[0]!;
  }
  if (state.phase === 'awaiting-draw') {
    return firstActionOfType(actions, 'draw') ?? actions[0]!;
  }
  return firstActionOfType(actions, 'discard') ?? actions[0]!;
}

export function classifyAiTurn(state: GameState): AiTurnKind {
  if (state.phase === 'awaiting-draw') return 'draw';
  if (state.phase === 'awaiting-discard') return 'self-action';
  if (state.phase === 'claiming') return 'claim';
  return 'terminal';
}

export const basicAiPolicy: AiPolicy = {
  id: 'basic-v1',
  choose({ state, legalActions }) {
    for (const type of basicPriority[state.phase]) {
      const action = firstActionOfType(legalActions, type);
      if (action !== null) {
        return { action, reason: actionReasons[action.type] };
      }
    }
    return null;
  },
};

/**
 * Run a policy behind a legality boundary. Policies cannot make the engine
 * accept an invented action; failures fall back to a conservative legal move.
 */
export function decideAiAction(
  state: GameState,
  seat: Seat,
  policy: AiPolicy = basicAiPolicy,
): AiDecision | null {
  const legalActions = getLegalActions(state, seat);
  if (legalActions.length === 0) return null;
  const turnKind = classifyAiTurn(state);

  let choice: AiPolicyChoice | null = null;
  try {
    choice = policy.choose({ state, seat, turnKind, legalActions });
  } catch {
    choice = null;
  }

  if (choice !== null && legalActions.some((action) => sameAction(action, choice.action))) {
    return {
      action: { ...choice.action } as GameAction,
      reason: choice.reason,
      policyId: policy.id,
      source: 'policy',
      turnKind,
      legalActionCount: legalActions.length,
      candidates: (choice.candidates ?? []).map((candidate) => ({
        action: { ...candidate.action } as GameAction,
        score: candidate.score,
        reasons: [...candidate.reasons],
      })),
    };
  }

  const fallback = chooseFallbackAction(state, legalActions);
  return {
    action: { ...fallback } as GameAction,
    reason: choice === null
      ? '策略未返回可用动作，采用安全合法回退'
      : '策略返回非法动作，采用安全合法回退',
    policyId: policy.id,
    source: 'fallback',
    turnKind,
    legalActionCount: legalActions.length,
    candidates: [],
  };
}
