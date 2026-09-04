import { applyAction, createGame, getLegalActions } from './game.js';
import { seededRandom, shuffle, type RandomSource } from './random.js';
import { createTileSet, type Tile } from './tiles.js';
import { SEATS, type GameAction, type GameState, type RoundResult, type Seat } from './types.js';

export const DEFAULT_MATCH_ROUNDS = 8;
export const WALL_STACKS_PER_SIDE = 15;

export type MatchPhase = 'playing' | 'between-rounds' | 'finished';
export type DrawDealerPolicy = 'stay' | 'rotate';
export type DicePair = readonly [first: number, second: number];

export interface DiceRollRound {
  candidates: readonly Seat[];
  rolls: Partial<Record<Seat, DicePair>>;
}

export interface DealerSelection {
  dealerSeat: Seat;
  rounds: readonly DiceRollRound[];
  winningRoll: DicePair;
}

export interface WallOpening {
  rollerSeat: Seat;
  dice: DicePair;
  total: number;
  wallSeat: Seat;
  stack: number;
  tileOffset: number;
}

export interface MatchRoundRecord {
  roundNumber: number;
  dealerSeat: Seat;
  opening: WallOpening;
  result: RoundResult;
  scoreDeltas: readonly number[];
  cumulativeScores: readonly number[];
}

export interface MatchState {
  seed: number;
  maxRounds: number;
  drawDealerPolicy: DrawDealerPolicy;
  phase: MatchPhase;
  roundNumber: number;
  dealerSeat: Seat;
  opening: WallOpening;
  dealerSelection: DealerSelection | null;
  game: GameState;
  cumulativeScores: number[];
  history: MatchRoundRecord[];
}

export interface CreateMatchOptions {
  seed?: number;
  maxRounds?: number;
  dealerSeat?: Seat;
  drawDealerPolicy?: DrawDealerPolicy;
}

function rollDie(random: RandomSource): number {
  return Math.floor(random() * 6) + 1;
}

export function rollDicePair(random: RandomSource): DicePair {
  return [rollDie(random), rollDie(random)];
}

function diceTotal(dice: DicePair): number {
  return dice[0] + dice[1];
}

export function selectInitialDealer(random: RandomSource): DealerSelection {
  let candidates: Seat[] = [...SEATS];
  const rounds: DiceRollRound[] = [];

  while (true) {
    const rolls: Partial<Record<Seat, DicePair>> = {};
    for (const seat of candidates) rolls[seat] = rollDicePair(random);
    rounds.push({ candidates: [...candidates], rolls });
    const highest = Math.max(...candidates.map((seat) => diceTotal(rolls[seat]!)));
    const leaders = candidates.filter((seat) => diceTotal(rolls[seat]!) === highest);
    if (leaders.length === 1) {
      const dealerSeat = leaders[0]!;
      return { dealerSeat, rounds, winningRoll: rolls[dealerSeat]! };
    }
    candidates = leaders;
  }
}

/** Map two dice to one of four 15-stack walls and a tile offset in the 120-tile array. */
export function calculateWallOpening(rollerSeat: Seat, dice: DicePair): WallOpening {
  const total = diceTotal(dice);
  const wallSeat = ((rollerSeat + total - 1) % 4) as Seat;
  const stack = (total - 1) % WALL_STACKS_PER_SIDE;
  return {
    rollerSeat,
    dice: [...dice] as DicePair,
    total,
    wallSeat,
    stack,
    tileOffset: wallSeat * WALL_STACKS_PER_SIDE * 2 + stack * 2,
  };
}

function rotateWall(tiles: readonly Tile[], offset: number): Tile[] {
  const normalized = ((offset % tiles.length) + tiles.length) % tiles.length;
  return [...tiles.slice(normalized), ...tiles.slice(0, normalized)];
}

function roundSeed(seed: number, roundNumber: number): number {
  return (seed ^ Math.imul(roundNumber, 0x6d2b79f5)) >>> 0;
}

function createRound(
  matchSeed: number,
  roundNumber: number,
  dealerSeat: Seat,
  openingDice?: DicePair,
): { game: GameState; opening: WallOpening } {
  const seed = roundSeed(matchSeed, roundNumber);
  const dice = openingDice ?? rollDicePair(seededRandom(seed ^ 0xa5a5a5a5));
  const opening = calculateWallOpening(dealerSeat, dice);
  const shuffled = shuffle(createTileSet(), seededRandom(seed ^ 0x5a5a5a5a));
  const wallTiles = rotateWall(shuffled, opening.tileOffset);
  return {
    game: createGame({ dealerSeat, wallTiles }),
    opening,
  };
}

function cloneResult(result: RoundResult): RoundResult {
  return {
    ...result,
    fan:
      result.fan === null
        ? null
        : { ...result.fan, items: result.fan.items.map((item) => ({ ...item })) },
    payments: result.payments.map((payment) => ({ ...payment })),
  };
}

function finishRound(match: MatchState, game: GameState): MatchState {
  const result = game.result;
  if (result === null) return { ...match, game };
  const scoreDeltas = game.players.map((player) => player.score);
  const cumulativeScores = match.cumulativeScores.map(
    (score, seat) => score + (scoreDeltas[seat] ?? 0),
  );
  const record: MatchRoundRecord = {
    roundNumber: match.roundNumber,
    dealerSeat: match.dealerSeat,
    opening: { ...match.opening, dice: [...match.opening.dice] as DicePair },
    result: cloneResult(result),
    scoreDeltas,
    cumulativeScores: [...cumulativeScores],
  };
  return {
    ...match,
    game,
    cumulativeScores,
    history: [...match.history, record],
    phase: match.roundNumber >= match.maxRounds ? 'finished' : 'between-rounds',
  };
}

export function createMatch(options: CreateMatchOptions = {}): MatchState {
  const seed = options.seed ?? Date.now();
  const maxRounds = options.maxRounds ?? DEFAULT_MATCH_ROUNDS;
  if (!Number.isInteger(maxRounds) || maxRounds <= 0) {
    throw new Error('比赛局数必须是正整数');
  }
  const random = seededRandom(seed ^ 0xc3c3c3c3);
  const dealerSelection = options.dealerSeat === undefined ? selectInitialDealer(random) : null;
  const dealerSeat = options.dealerSeat ?? dealerSelection!.dealerSeat;
  const openingDice = dealerSelection?.winningRoll ?? rollDicePair(random);
  const round = createRound(seed, 1, dealerSeat, openingDice);

  return {
    seed,
    maxRounds,
    drawDealerPolicy: options.drawDealerPolicy ?? 'stay',
    phase: 'playing',
    roundNumber: 1,
    dealerSeat,
    opening: round.opening,
    dealerSelection,
    game: round.game,
    cumulativeScores: [0, 0, 0, 0],
    history: [],
  };
}

export function getMatchLegalActions(match: MatchState, seat: Seat): GameAction[] {
  return match.phase === 'playing' ? getLegalActions(match.game, seat) : [];
}

export function applyMatchAction(match: MatchState, action: GameAction): MatchState {
  if (match.phase !== 'playing') throw new Error('当前不在进行中的牌局');
  const game = applyAction(match.game, action);
  return game.result === null ? { ...match, game } : finishRound(match, game);
}

function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

function nextDealer(match: MatchState): Seat {
  const result = match.game.result;
  if (result?.winner !== null && result?.winner !== undefined) return result.winner;
  return match.drawDealerPolicy === 'stay' ? match.dealerSeat : nextSeat(match.dealerSeat);
}

export function startNextRound(match: MatchState): MatchState {
  if (match.phase !== 'between-rounds') throw new Error('当前不能开始下一局');
  const roundNumber = match.roundNumber + 1;
  const dealerSeat = nextDealer(match);
  const round = createRound(match.seed, roundNumber, dealerSeat);
  return {
    ...match,
    phase: 'playing',
    roundNumber,
    dealerSeat,
    opening: round.opening,
    game: round.game,
  };
}
