import { rankStrategicDiscards, strategicAiPolicy } from './ai-strategy.js';
import type { AiDecisionCandidate, AiPolicy, AiPolicyChoice, AiPolicyInput } from './ai.js';
import type { RandomSource } from './random.js';
import type { GameAction } from './types.js';

export const AI_DIFFICULTIES = ['casual', 'standard', 'advanced'] as const;
export type AiDifficulty = (typeof AI_DIFFICULTIES)[number];

interface DifficultyProfile {
  discardMode: 'random' | 'near-best' | 'best';
  optionalClaimRate: number;
  mouthRate: number;
  kongRate: number;
}

const profiles: Record<AiDifficulty, DifficultyProfile> = {
  casual: {
    discardMode: 'random',
    optionalClaimRate: 0.35,
    mouthRate: 0.65,
    kongRate: 0.45,
  },
  standard: {
    discardMode: 'near-best',
    optionalClaimRate: 0.78,
    mouthRate: 0.92,
    kongRate: 0.82,
  },
  advanced: {
    discardMode: 'best',
    optionalClaimRate: 1,
    mouthRate: 1,
    kongRate: 1,
  },
};

function actionOf(actions: readonly GameAction[], type: GameAction['type']): GameAction | null {
  return actions.find((action) => action.type === type) ?? null;
}

function chooseCandidate(
  candidates: readonly AiDecisionCandidate[],
  profile: DifficultyProfile,
  random: RandomSource,
): AiDecisionCandidate | null {
  if (candidates.length === 0) return null;
  if (profile.discardMode === 'best') return candidates[0] ?? null;
  if (profile.discardMode === 'random') {
    return candidates[Math.floor(random() * candidates.length)] ?? candidates[0] ?? null;
  }

  const bestScore = candidates[0]!.score;
  const nearBest = candidates.filter((candidate) => candidate.score >= bestScore - 14).slice(0, 3);
  if (nearBest.length === 1 || random() < 0.76) return nearBest[0] ?? candidates[0] ?? null;
  return nearBest[Math.floor(random() * nearBest.length)] ?? nearBest[0] ?? null;
}

function discardChoice(
  input: AiPolicyInput,
  profile: DifficultyProfile,
  random: RandomSource,
): AiPolicyChoice | null {
  const ranked = rankStrategicDiscards(input.state, input.seat);
  const candidates: AiDecisionCandidate[] = ranked.map((choice) => ({
    action: choice.action,
    score: choice.strategicScore,
    reasons: [...choice.reasons, ...choice.heuristics],
  }));
  return selectScoredDiscard(candidates, profile, random);
}

function selectScoredDiscard(
  candidates: readonly AiDecisionCandidate[],
  profile: DifficultyProfile,
  random: RandomSource,
): AiPolicyChoice | null {
  const selected = chooseCandidate(candidates, profile, random);
  if (selected === null) return null;
  return {
    action: selected.action,
    reason: `难度策略选择评分 ${selected.score}：${selected.reasons.join('；')}`,
    candidates,
  };
}

function safeAlternative(
  input: AiPolicyInput,
  profile: DifficultyProfile,
  random: RandomSource,
  reason: string,
): AiPolicyChoice | null {
  const pass = actionOf(input.legalActions, 'pass');
  if (pass !== null) return { action: pass, reason };
  const discard = discardChoice(input, profile, random);
  if (discard !== null) return { ...discard, reason: `${reason}；${discard.reason}` };
  const draw = actionOf(input.legalActions, 'draw');
  if (draw !== null) return { action: draw, reason };
  return null;
}

function acceptanceRate(action: GameAction, profile: DifficultyProfile): number {
  if (action.type === 'declare-mouth') return profile.mouthRate;
  if (
    action.type === 'concealed-kong' ||
    action.type === 'supplement-kong' ||
    action.type === 'exposed-kong'
  ) {
    return profile.kongRate;
  }
  if (action.type === 'pong') return profile.optionalClaimRate;
  return 1;
}

export function createDifficultyAiPolicy(difficulty: AiDifficulty, random: RandomSource): AiPolicy {
  const profile = profiles[difficulty];
  return {
    id: `difficulty-${difficulty}-v1`,
    choose(input) {
      const strategic = strategicAiPolicy.choose(input);
      if (strategic === null) return null;

      if (strategic.action.type === 'discard') {
        return selectScoredDiscard(strategic.candidates ?? [], profile, random) ?? strategic;
      }

      const rate = acceptanceRate(strategic.action, profile);
      if (rate < 1 && random() > rate) {
        return (
          safeAlternative(
            input,
            profile,
            random,
            `${difficulty} 难度本次放弃可选的 ${strategic.action.type} 动作`,
          ) ?? strategic
        );
      }
      return strategic;
    },
  };
}
