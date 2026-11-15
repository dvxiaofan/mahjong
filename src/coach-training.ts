import { decideAiAction } from './ai.js';
import { createDifficultyAiPolicy, type AiDifficulty } from './ai-difficulty.js';
import { COACH_FEATURE_COUNT, coachWallSegment, extractCoachFeatures } from './coach-risk.js';
import { applyAction, createGame, getLegalActions } from './game.js';
import { seededRandom } from './random.js';
import { isTing, isWinningHand } from './rules.js';
import { SEATS, type GameState, type Seat } from './types.js';
import { projectStateForSeat } from './view.js';

const TENPAI_FORTUNE_BUCKETS = 4;
const TENPAI_MELD_BUCKETS = 4;
const TENPAI_WALL_SEGMENTS = 12;

export interface CoachDatasetOptions {
  difficulty: AiDifficulty;
  games: number;
  seed: number;
  sampleLimit?: number;
  maxActionsPerGame?: number;
}

export interface CoachDataset {
  difficulty: AiDifficulty;
  games: number;
  completedGames: number;
  candidates: number;
  totalPositives: number;
  samples: number;
  positives: number;
  rows: Float32Array;
  labels: Uint8Array;
  /** Flat [fortune][melds][wall segment] layout. */
  tenpaiCounts: Uint32Array;
  tenpaiWins: Uint32Array;
}

function tenpaiIndex(fortune: number, melds: number, segment: number): number {
  return (
    fortune * TENPAI_MELD_BUCKETS * TENPAI_WALL_SEGMENTS + melds * TENPAI_WALL_SEGMENTS + segment
  );
}

function canRonOnTile(
  state: GameState,
  seat: Seat,
  tile: GameState['players'][number]['concealedTiles'][number],
): boolean {
  const player = state.players[seat];
  if (player === undefined || player.fortuneCount < 1) return false;
  if (!isWinningHand([...player.concealedTiles, tile], player.melds)) return false;
  if (player.mouthDeclared && !player.lockedWaits.includes(tile)) return false;
  return true;
}

function tenpaiAtDiscard(state: GameState, seat: Seat): boolean {
  const player = state.players[seat];
  if (player === undefined) return false;
  return player.mouthDeclared || isTing(player.concealedTiles, player.melds);
}

function nextDecision(
  state: GameState,
  policies: Record<Seat, ReturnType<typeof createDifficultyAiPolicy>>,
) {
  for (const seat of SEATS) {
    const decision = decideAiAction(state, seat, policies[seat]);
    if (decision !== null) return decision;
  }
  return null;
}

/**
 * Play complete AI games and sample public-feature rows. Hidden hands and wall
 * order are used only to produce labels; `extractCoachFeatures()` never sees them.
 */
export function buildCoachDataset(options: CoachDatasetOptions): CoachDataset {
  if (!Number.isInteger(options.games) || options.games <= 0) {
    throw new Error('教练拟合局数必须是正整数');
  }
  if (!Number.isInteger(options.seed) || options.seed < 0) {
    throw new Error('教练拟合种子必须是非负整数');
  }

  const sampleLimit = Math.max(1, Math.floor(options.sampleLimit ?? 400_000));
  const rows = new Float32Array(sampleLimit * COACH_FEATURE_COUNT);
  const labels = new Uint8Array(sampleLimit);
  const tenpaiCounts = new Uint32Array(
    TENPAI_FORTUNE_BUCKETS * TENPAI_MELD_BUCKETS * TENPAI_WALL_SEGMENTS,
  );
  const tenpaiWins = new Uint32Array(tenpaiCounts.length);
  const random = seededRandom((options.seed ^ 0xa5a5_5a5a) >>> 0);
  let candidates = 0;
  let totalPositives = 0;
  let samples = 0;
  let positives = 0;
  let completedGames = 0;
  const maxActions = options.maxActionsPerGame ?? 2000;

  function addSample(features: Float64Array, label: boolean): void {
    candidates += 1;
    if (label) totalPositives += 1;
    let target: number;
    if (samples < sampleLimit) {
      target = samples;
      samples += 1;
    } else {
      target = Math.floor(random() * candidates);
      if (target >= sampleLimit) return;
    }
    rows.set(features, target * COACH_FEATURE_COUNT);
    labels[target] = label ? 1 : 0;
    if (target >= sampleLimit) return;
  }

  for (let gameIndex = 0; gameIndex < options.games; gameIndex += 1) {
    const gameSeed = options.seed + gameIndex;
    let state = createGame({
      seed: gameSeed,
      dealerSeat: (gameIndex % 4) as Seat,
    });
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
      if (state.phase === 'awaiting-discard') {
        const viewerSeat = state.currentSeat;
        const view = projectStateForSeat(state, viewerSeat);
        const discardTiles = getLegalActions(state, viewerSeat)
          .filter((action): action is Extract<typeof action, { type: 'discard' }> => {
            return action.type === 'discard';
          })
          .map((action) => action.tile);
        const opponents = view.players.filter((player) => player.seat !== viewerSeat);

        for (const tile of discardTiles) {
          for (const opponent of opponents) {
            if (opponent.fortuneCount < 1) continue;
            addSample(
              extractCoachFeatures(view, opponent, tile),
              canRonOnTile(state, opponent.seat, tile),
            );
          }
        }

        const segment = coachWallSegment(view);
        for (const opponent of opponents) {
          const fortune = Math.min(opponent.fortuneCount, 3);
          const melds = Math.min(opponent.melds.length, 3);
          const index = tenpaiIndex(fortune, melds, segment);
          tenpaiCounts[index] = tenpaiCounts[index]! + 1;
          if (tenpaiAtDiscard(state, opponent.seat)) {
            tenpaiWins[index] = tenpaiWins[index]! + 1;
          }
        }
      }

      const decision = nextDecision(state, policies);
      if (decision === null) {
        throw new Error(`教练拟合在第 ${gameIndex + 1} 局出现无动作状态`);
      }
      state = applyAction(state, decision.action);
      actions += 1;
    }

    if (state.phase !== 'finished' && state.phase !== 'drawn') {
      throw new Error(`教练拟合第 ${gameIndex + 1} 局超过 ${maxActions} 个动作`);
    }
    completedGames += 1;
  }

  for (let index = 0; index < samples; index += 1) {
    if (labels[index] === 1) positives += 1;
  }

  return {
    difficulty: options.difficulty,
    games: options.games,
    completedGames,
    candidates,
    totalPositives,
    samples,
    positives,
    rows: rows.slice(0, samples * COACH_FEATURE_COUNT),
    labels: labels.slice(0, samples),
    tenpaiCounts,
    tenpaiWins,
  };
}
