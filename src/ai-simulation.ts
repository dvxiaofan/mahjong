import { decideAiAction, type AiDecision } from './ai.js';
import { createDifficultyAiPolicy, type AiDifficulty } from './ai-difficulty.js';
import { applyAction, createGame } from './game.js';
import { seededRandom } from './random.js';
import { SEATS, type GameState, type Seat } from './types.js';

export interface AiSimulationOptions {
  games: number;
  seed: number;
  difficulty: AiDifficulty;
  maxActionsPerGame?: number;
}

export interface AiSimulationSummary {
  games: number;
  completedGames: number;
  wins: number;
  draws: number;
  totalActions: number;
  averageActions: number;
  winsBySeat: Record<Seat, number>;
  discardDecisions: number;
  topRatedDiscards: number;
  optimalDiscardRate: number;
  scoreSum: number;
}

function sameAction(left: AiDecision['action'], right: AiDecision['action']): boolean {
  if (left.type !== right.type || left.seat !== right.seat) return false;
  if ('tile' in left || 'tile' in right) {
    return 'tile' in left && 'tile' in right && left.tile === right.tile;
  }
  return true;
}

function nextDecision(
  state: GameState,
  policies: Record<Seat, ReturnType<typeof createDifficultyAiPolicy>>,
): AiDecision | null {
  for (const seat of SEATS) {
    const decision = decideAiAction(state, seat, policies[seat]);
    if (decision !== null) return decision;
  }
  return null;
}

export function runAiSimulation(options: AiSimulationOptions): AiSimulationSummary {
  if (!Number.isInteger(options.games) || options.games <= 0) {
    throw new Error('模拟局数必须是正整数');
  }
  const maxActions = options.maxActionsPerGame ?? 2000;
  const summary: AiSimulationSummary = {
    games: options.games,
    completedGames: 0,
    wins: 0,
    draws: 0,
    totalActions: 0,
    averageActions: 0,
    winsBySeat: { 0: 0, 1: 0, 2: 0, 3: 0 },
    discardDecisions: 0,
    topRatedDiscards: 0,
    optimalDiscardRate: 0,
    scoreSum: 0,
  };

  for (let gameIndex = 0; gameIndex < options.games; gameIndex += 1) {
    const gameSeed = options.seed + gameIndex;
    let state = createGame({ dealerSeat: (gameIndex % 4) as Seat, seed: gameSeed });
    const policies = Object.fromEntries(
      SEATS.map((seat) => [
        seat,
        createDifficultyAiPolicy(
          options.difficulty,
          seededRandom((gameSeed ^ ((seat + 1) * 0x9e3779b9)) >>> 0),
        ),
      ]),
    ) as Record<Seat, ReturnType<typeof createDifficultyAiPolicy>>;
    let actions = 0;

    while (state.phase !== 'finished' && state.phase !== 'drawn' && actions < maxActions) {
      const decision = nextDecision(state, policies);
      if (decision === null) throw new Error(`模拟在第 ${gameIndex + 1} 局出现无动作状态`);
      if (decision.action.type === 'discard' && decision.candidates.length > 0) {
        summary.discardDecisions += 1;
        if (sameAction(decision.action, decision.candidates[0]!.action)) {
          summary.topRatedDiscards += 1;
        }
      }
      state = applyAction(state, decision.action);
      actions += 1;
    }

    if (state.phase !== 'finished' && state.phase !== 'drawn') {
      throw new Error(`模拟第 ${gameIndex + 1} 局超过 ${maxActions} 个动作`);
    }
    summary.completedGames += 1;
    summary.totalActions += actions;
    if (state.result?.outcome === 'win' && state.result.winner !== null) {
      summary.wins += 1;
      summary.winsBySeat[state.result.winner] += 1;
    } else {
      summary.draws += 1;
    }
    summary.scoreSum += state.players.reduce((total, player) => total + player.score, 0);
  }

  summary.averageActions = summary.totalActions / summary.games;
  summary.optimalDiscardRate =
    summary.discardDecisions === 0 ? 0 : summary.topRatedDiscards / summary.discardDecisions;
  return summary;
}
