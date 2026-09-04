import { seededRandom } from './random.js';
import {
  createWall,
  createWallFromTiles,
  drawWithFortuneReplacement,
  remainingWallTiles,
  WallExhaustedError,
  type DrawResolved,
} from './wall.js';
import {
  NORMAL_TILE_TYPES,
  isFortuneTile,
  sortTiles,
  tileLabel,
  type NormalTile,
  type Tile,
} from './tiles.js';
import {
  calculateFan,
  canDeclareMouth,
  canWinOnDiscard,
  canWinOnSelfDraw,
  getWaitingTiles,
  isWinningHand,
} from './rules.js';
import type {
  ClaimResponse,
  CreateGameOptions,
  DrawMode,
  FanBreakdown,
  GameAction,
  GameEvent,
  GamePhase,
  GameState,
  GangRecord,
  Meld,
  Payment,
  PendingDiscard,
  PlayerState,
  RoundResult,
  Seat,
} from './types.js';
import { SEATS } from './types.js';

const BASE_WIN_SCORE = 1;

function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

function seatOrderFrom(startSeat: Seat): Seat[] {
  const order: Seat[] = [];
  let seat = startSeat;
  for (let index = 0; index < SEATS.length; index += 1) {
    order.push(seat);
    seat = nextSeat(seat);
  }
  return order;
}

/** Return the priority order for a discard: the next seat first, then counterclockwise. */
function claimOrder(discarder: Seat): Seat[] {
  return seatOrderFrom(nextSeat(discarder)).slice(0, SEATS.length - 1);
}

function playerAt(state: GameState, seat: Seat): PlayerState {
  const player = state.players[seat];
  if (player === undefined) throw new Error(`不存在 ${seat} 号玩家`);
  return player;
}

function createPlayer(seat: Seat): PlayerState {
  return {
    seat,
    concealedTiles: [],
    melds: [],
    fortuneCount: 0,
    mouthDeclared: false,
    lockedWaits: [],
    mouthRequired: false,
    score: 0,
    gangs: [],
  };
}

function cloneMeld(meld: Meld): Meld {
  return { ...meld } as Meld;
}

function clonePlayer(player: PlayerState): PlayerState {
  return {
    ...player,
    concealedTiles: [...player.concealedTiles],
    melds: player.melds.map(cloneMeld),
    lockedWaits: [...player.lockedWaits],
    gangs: player.gangs.map((gang) => ({ ...gang })),
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map(clonePlayer),
    wall: {
      ...state.wall,
      tiles: [...state.wall.tiles],
    },
    pendingDiscard: state.pendingDiscard === null
      ? null
      : {
          ...state.pendingDiscard,
          responses: { ...state.pendingDiscard.responses },
        },
    events: [...state.events],
    payments: [...state.payments],
    result: state.result === null
      ? null
      : {
          ...state.result,
          fan: state.result.fan === null
            ? null
            : {
                ...state.result.fan,
                items: state.result.fan.items.map((item) => ({ ...item })),
              },
          payments: state.result.payments.map((payment) => ({ ...payment })),
        },
  };
}

function addEvent(
  state: GameState,
  type: GameEvent['type'],
  seat: Seat | null,
  tile: NormalTile | null,
  message: string,
): void {
  state.events.push({ type, seat, tile, message });
}

function addPayment(state: GameState, payment: Payment): void {
  if (payment.amount <= 0) return;
  playerAt(state, payment.from).score -= payment.amount;
  playerAt(state, payment.to).score += payment.amount;
  state.payments.push(payment);
}

function countTile(tiles: readonly NormalTile[], tile: NormalTile): number {
  return tiles.reduce((count, current) => count + (current === tile ? 1 : 0), 0);
}

function removeTile(tiles: NormalTile[], tile: NormalTile): void {
  const index = tiles.indexOf(tile);
  if (index < 0) throw new Error(`手牌中没有 ${tileLabel(tile)}`);
  tiles.splice(index, 1);
}

function removeTiles(tiles: NormalTile[], tile: NormalTile, amount: number): void {
  for (let index = 0; index < amount; index += 1) removeTile(tiles, tile);
}

function playerHasPong(player: PlayerState, tile: NormalTile): boolean {
  return player.melds.some((meld) => meld.kind === 'pong' && meld.tile === tile);
}

function updateMouthRequirement(
  player: PlayerState,
  candidateTiles: readonly NormalTile[] = player.concealedTiles,
): void {
  if (player.mouthDeclared || player.fortuneCount < 3) {
    player.mouthRequired = false;
    return;
  }

  // 一旦达到“3财且听牌”的状态，未报嘴限制在本局持续有效；
  // 换听、碰杠或补牌不会自动解除它。
  player.mouthRequired = player.mouthRequired ||
    getWaitingTiles(candidateTiles, player.melds).length > 0;
}

function recordConsumedFortunes(
  state: GameState,
  seat: Seat,
  consumed: readonly Tile[],
): void {
  const player = playerAt(state, seat);
  for (const tile of consumed) {
    if (!isFortuneTile(tile)) continue;
    player.fortuneCount += 1;
    addEvent(state, 'fortune', seat, null, `${seat}号玩家摸到发财`);
  }
}

function drawForPlayer(state: GameState, seat: Seat, mode: DrawMode): DrawResolved | null {
  const player = playerAt(state, seat);
  let resolved: DrawResolved;
  try {
    resolved = drawWithFortuneReplacement(state.wall, mode);
  } catch (error) {
    if (!(error instanceof WallExhaustedError)) throw error;
    recordConsumedFortunes(state, seat, error.consumed);
    finishDraw(state);
    return null;
  }

  recordConsumedFortunes(state, seat, resolved.consumed);

  player.concealedTiles.push(resolved.tile);
  player.concealedTiles = sortTiles(player.concealedTiles);
  addEvent(
    state,
    resolved.fortunes > 0 || mode === 'replacement' ? 'replacement-draw' : 'draw',
    seat,
    resolved.tile,
    `${seat}号玩家补摸${tileLabel(resolved.tile)}`,
  );
  state.lastDrawnTile = resolved.tile;
  state.phase = 'awaiting-discard';
  state.drawMode = null;
  const candidateTiles = [...player.concealedTiles];
  removeTile(candidateTiles, resolved.tile);
  updateMouthRequirement(player, candidateTiles);
  return resolved;
}

function dealOne(state: GameState, seat: Seat): NormalTile | null {
  const player = playerAt(state, seat);
  let resolved: DrawResolved;
  try {
    resolved = drawWithFortuneReplacement(state.wall, 'normal');
  } catch (error) {
    if (!(error instanceof WallExhaustedError)) throw error;
    recordConsumedFortunes(state, seat, error.consumed);
    finishDraw(state);
    return null;
  }
  recordConsumedFortunes(state, seat, resolved.consumed);
  player.concealedTiles.push(resolved.tile);
  player.concealedTiles = sortTiles(player.concealedTiles);
  addEvent(state, 'deal', seat, resolved.tile, `${seat}号玩家起牌`);
  return resolved.tile;
}

function initialState(dealerSeat: Seat, wallTiles?: readonly Tile[], seed?: number): GameState {
  const random = seededRandom(seed ?? Date.now());
  const wall = wallTiles === undefined
    ? createWall(random)
    : createWallFromTiles(wallTiles);
  const state: GameState = {
    players: SEATS.map(createPlayer),
    wall,
    dealerSeat,
    currentSeat: dealerSeat,
    phase: 'awaiting-discard',
    drawMode: null,
    lastDrawnTile: null,
    pendingDiscard: null,
    result: null,
    events: [],
    payments: [],
    drawAfterGang: false,
  };

  // 四人麻将：每家13张，庄家再多起1张；从庄家开始按逆时针发牌。
  const dealOrder = seatOrderFrom(dealerSeat);
  let dealingFailed = false;
  for (let round = 0; round < 13; round += 1) {
    for (const seat of dealOrder) {
      if (dealOne(state, seat) === null) {
        dealingFailed = true;
        break;
      }
    }
    if (dealingFailed) break;
  }
  if (!dealingFailed) {
    state.lastDrawnTile = dealOne(state, dealerSeat);
    dealingFailed = state.lastDrawnTile === null;
  }
  if (dealingFailed) return state;

  state.players.forEach((player) => {
    // 庄家目前持有14张牌，报嘴资格按扣除最后一张起牌后的手牌判断；
    // 其他玩家已经持有13张牌。
    if (player.seat === dealerSeat && state.lastDrawnTile !== null) {
      const candidateTiles = [...player.concealedTiles];
      removeTile(candidateTiles, state.lastDrawnTile);
      updateMouthRequirement(player, candidateTiles);
    } else {
      updateMouthRequirement(player);
    }
  });
  return state;
}

export function createGame(options: CreateGameOptions = {}): GameState {
  return initialState(options.dealerSeat ?? 0, options.wallTiles, options.seed);
}

function concealedBeforeLastDraw(state: GameState, player: PlayerState): NormalTile[] {
  const tiles = [...player.concealedTiles];
  const drawn = state.lastDrawnTile;
  if (drawn !== null) removeTile(tiles, drawn);
  return tiles;
}

/**
 * Return the hand that is eligible for a报嘴 declaration.  In the
 * awaiting-discard phase the last tile is the just-drawn tile and will be
 * discarded after declaring; in all other phases the concealed hand already
 * has the correct 13-minus-meld-count shape.
 */
function mouthCandidateTiles(state: GameState, player: PlayerState): NormalTile[] {
  if (state.phase === 'awaiting-discard' &&
      state.currentSeat === player.seat &&
      state.lastDrawnTile !== null) {
    return concealedBeforeLastDraw(state, player);
  }
  return [...player.concealedTiles];
}

function canPlayerDeclareMouth(state: GameState, player: PlayerState): boolean {
  return canDeclareMouth(
    mouthCandidateTiles(state, player),
    player.melds,
    player.fortuneCount,
    player.mouthDeclared,
  );
}

function isWinningSelfDraw(state: GameState, player: PlayerState): boolean {
  if (state.lastDrawnTile === null) return false;
  const before = concealedBeforeLastDraw(state, player);
  return canWinOnSelfDraw(before, player.melds, player, state.lastDrawnTile);
}

function claimResponseFor(
  state: GameState,
  seat: Seat,
): GameAction[] {
  const pending = state.pendingDiscard;
  if (pending === null || seat === pending.discarder) return [];
  if (pending.responses[seat] !== undefined) return [];

  const player = playerAt(state, seat);
  const actions: GameAction[] = [];
  if (canDeclareMouth(
    player.concealedTiles,
    player.melds,
    player.fortuneCount,
    player.mouthDeclared,
  )) {
    // 规则只要求在胡牌前完成报嘴，因此在弃牌响应阶段仍可先报嘴，
    // 再决定是否胡这张牌。
    actions.push({ type: 'declare-mouth', seat });
  }
  const canWin = canWinOnDiscard(
    player.concealedTiles,
    player.melds,
    player,
    pending.tile,
  );
  if (canWin) actions.push({ type: 'win', seat });
  if (!player.mouthDeclared && countTile(player.concealedTiles, pending.tile) >= 3) {
    actions.push({ type: 'exposed-kong', seat });
  }
  if (!player.mouthDeclared && countTile(player.concealedTiles, pending.tile) >= 2) {
    actions.push({ type: 'pong', seat });
  }
  // 报嘴后点炮仍可拒绝，不能把“必须自摸胡”扩展成“必须点炮胡”。
  actions.push({ type: 'pass', seat });
  return actions;
}

export function getLegalActions(state: GameState, seat: Seat = state.currentSeat): GameAction[] {
  if (state.phase === 'finished' || state.phase === 'drawn') return [];

  if (state.phase === 'awaiting-draw') {
    if (seat !== state.currentSeat) return [];
    const player = playerAt(state, seat);
    const actions: GameAction[] = [];
    if (canPlayerDeclareMouth(state, player)) {
      actions.push({ type: 'declare-mouth', seat });
    }
    // 杠后必须先完成墙尾补牌；只有正常起手等待摸牌时，才允许
    // 直接宣布“起手即齐四张”的暗杠。
    if (!player.mouthDeclared && state.drawMode === 'normal') {
      const uniqueTiles = NORMAL_TILE_TYPES.filter((tile) => countTile(player.concealedTiles, tile) >= 4);
      for (const tile of uniqueTiles) {
        actions.push({ type: 'concealed-kong', seat, tile });
      }
    }
    actions.push({ type: 'draw', seat });
    return actions;
  }

  if (state.phase === 'awaiting-discard') {
    if (seat !== state.currentSeat) return [];
    const player = playerAt(state, seat);
    const actions: GameAction[] = [];
    if (canPlayerDeclareMouth(state, player)) {
      actions.push({ type: 'declare-mouth', seat });
    }
    if (isWinningSelfDraw(state, player)) {
      actions.push({ type: 'win', seat });
    }

    if (!player.mouthDeclared || state.lastDrawnTile === null || !isWinningSelfDraw(state, player)) {
      const discardTiles = player.mouthDeclared && state.lastDrawnTile !== null
        ? [state.lastDrawnTile]
        : player.concealedTiles;
      for (const tile of discardTiles) {
        if (!actions.some((action) => action.type === 'discard' && action.tile === tile)) {
          actions.push({ type: 'discard', seat, tile });
        }
      }
    }

    if (!player.mouthDeclared) {
      const uniqueTiles = NORMAL_TILE_TYPES.filter((tile) => countTile(player.concealedTiles, tile) >= 4);
      for (const tile of uniqueTiles) {
        actions.push({ type: 'concealed-kong', seat, tile });
      }
      if (state.lastDrawnTile !== null && playerHasPong(player, state.lastDrawnTile)) {
        actions.push({ type: 'supplement-kong', seat, tile: state.lastDrawnTile });
      }
    }
    return actions;
  }

  if (state.phase === 'claiming') {
    const pending = state.pendingDiscard;
    if (pending === null) return [];
    if (seat === pending.discarder) {
      const player = playerAt(state, seat);
      return canPlayerDeclareMouth(state, player)
        ? [{ type: 'declare-mouth', seat }]
        : [];
    }
    return claimResponseFor(state, seat);
  }

  return [];
}

function sameAction(a: GameAction, b: GameAction): boolean {
  if (a.type !== b.type || a.seat !== b.seat) return false;
  if ('tile' in a || 'tile' in b) return 'tile' in a && 'tile' in b && a.tile === b.tile;
  return true;
}

function assertLegal(state: GameState, action: GameAction): void {
  const legal = getLegalActions(state, action.seat);
  if (!legal.some((candidate) => sameAction(candidate, action))) {
    throw new Error(`非法动作：${action.type}（${action.seat}号玩家）`);
  }
}

function recordGang(
  player: PlayerState,
  kind: GangRecord['kind'],
  payer: Seat | null,
  settlement: GangRecord['settlement'],
  settled: boolean,
): GangRecord {
  const record: GangRecord = {
    kind,
    seat: player.seat,
    payer,
    amount: 1,
    settlement,
    settled,
  };
  player.gangs.push(record);
  return record;
}

function addMouth(state: GameState, seat: Seat): void {
  const player = playerAt(state, seat);
  const candidateTiles = mouthCandidateTiles(state, player);
  const waits = getWaitingTiles(candidateTiles, player.melds);
  if (!canDeclareMouth(
    candidateTiles,
    player.melds,
    player.fortuneCount,
    player.mouthDeclared,
  )) {
    throw new Error('当前不能报嘴');
  }
  player.mouthDeclared = true;
  player.mouthRequired = false;
  player.lockedWaits = waits;
  addEvent(state, 'mouth-declared', seat, null, `${seat}号玩家报嘴，听${waits.map(tileLabel).join('、')}`);
}

function settleEndGangs(state: GameState): void {
  for (const player of state.players) {
    for (const gang of player.gangs) {
      if (gang.settlement !== 'end' || gang.settled) continue;
      if (gang.kind === 'concealed') {
        for (const payer of SEATS) {
          if (payer === player.seat) continue;
          addPayment(state, {
            from: payer,
            to: player.seat,
            amount: gang.amount,
            reason: 'concealed-kong',
          });
        }
      } else if (gang.kind === 'exposed' && gang.payer !== null) {
        addPayment(state, {
          from: gang.payer,
          to: player.seat,
          amount: gang.amount,
          reason: 'exposed-kong',
        });
      }
      gang.settled = true;
      addEvent(state, 'gang-payment', player.seat, null, `${player.seat}号玩家杠分结算`);
    }
  }
}

/** Reverse every gang payment when the round ends in荒庄. */
function refundGangPayments(state: GameState): void {
  const retained: Payment[] = [];
  for (const payment of state.payments) {
    if (payment.reason !== 'supplement-kong' &&
        payment.reason !== 'concealed-kong' &&
        payment.reason !== 'exposed-kong') {
      retained.push(payment);
      continue;
    }

    playerAt(state, payment.from).score += payment.amount;
    playerAt(state, payment.to).score -= payment.amount;
    const paymentLabel = payment.reason === 'supplement-kong' ? '补杠分' : '杠分';
    addEvent(
      state,
      'gang-payment',
      payment.to,
      null,
      `${payment.to}号玩家荒庄退还${paymentLabel}${payment.amount}分`,
    );
  }
  state.payments = retained;
  for (const player of state.players) {
    for (const gang of player.gangs) {
      if (gang.kind === 'supplement' || gang.settlement === 'end') {
        gang.settled = false;
      }
    }
  }
}

function finishDraw(state: GameState): void {
  refundGangPayments(state);
  state.phase = 'drawn';
  state.drawMode = null;
  state.pendingDiscard = null;
  state.lastDrawnTile = null;
  state.drawAfterGang = false;
  state.result = {
    outcome: 'draw',
    winner: null,
    winType: null,
    winningTile: null,
    fan: null,
    payments: [...state.payments],
    reason: 'wall-exhausted',
  };
  addEvent(state, 'round-draw', null, null, '牌墙摸完，荒庄');
}

function finishWin(
  state: GameState,
  winner: Seat,
  winType: 'self-draw' | 'discard',
  winningTile: NormalTile,
  discarder: Seat | null,
): void {
  const player = playerAt(state, winner);
  const concealedWithoutWinning = winType === 'self-draw'
    ? concealedBeforeLastDraw(state, player)
    : [...player.concealedTiles];
  const completedConcealed = [...concealedWithoutWinning, winningTile];
  const fan = calculateFan({
    concealedTiles: completedConcealed,
    melds: player.melds,
    fortuneCount: player.fortuneCount,
  });

  // 点炮胡的牌正式并入胡牌者暗手，保持终局状态与结算牌型一致。
  if (winType === 'discard') {
    player.concealedTiles.push(winningTile);
    player.concealedTiles = sortTiles(player.concealedTiles);
  }

  settleEndGangs(state);
  const amount = BASE_WIN_SCORE + fan.total;
  if (winType === 'self-draw') {
    for (const payer of SEATS) {
      if (payer === winner) continue;
      addPayment(state, { from: payer, to: winner, amount, reason: 'win' });
    }
  } else if (discarder !== null) {
    addPayment(state, { from: discarder, to: winner, amount, reason: 'win' });
  }

  const reason = state.drawAfterGang ? 'gang-draw' : 'normal';
  state.phase = 'finished';
  state.drawMode = null;
  state.pendingDiscard = null;
  state.result = {
    outcome: 'win',
    winner,
    winType,
    winningTile,
    fan,
    payments: [...state.payments],
    reason,
  };
  addEvent(state, 'win', winner, winningTile, `${winner}号玩家胡牌：${tileLabel(winningTile)}`);
}

function allResponsesReceived(pending: PendingDiscard): boolean {
  return SEATS.filter((seat) => seat !== pending.discarder)
    .every((seat) => pending.responses[seat] !== undefined);
}

function resolvePendingDiscard(state: GameState): void {
  const pending = state.pendingDiscard;
  if (pending === null || !allResponsesReceived(pending)) return;

  const order = claimOrder(pending.discarder);
  const responseEntries = order
    .map((seat) => ({ seat, response: pending.responses[seat] }))
    .filter((entry): entry is { seat: Seat; response: ClaimResponse } => entry.response !== undefined);

  // 最新规则确定：同一弃牌上的所有动作都从弃牌者下家开始，
  // 沿逆时针依次竞争，不再额外使用“胡 > 杠 > 碰”的动作等级。
  const claim = responseEntries.find((entry) => entry.response.type !== 'pass');

  state.pendingDiscard = null;
  state.lastDrawnTile = null;
  state.drawAfterGang = false;

  if (claim === undefined) {
    state.currentSeat = nextSeat(pending.discarder);
    state.phase = 'awaiting-draw';
    state.drawMode = 'normal';
    return;
  }

  if (claim.response.type === 'win') {
    finishWin(state, claim.seat, 'discard', pending.tile, pending.discarder);
    return;
  }

  const claimant = playerAt(state, claim.seat);
  if (claim.response.type === 'pong') {
    removeTiles(claimant.concealedTiles, pending.tile, 2);
    claimant.melds.push({ kind: 'pong', tile: pending.tile, fromSeat: pending.discarder });
    updateMouthRequirement(claimant);
    state.currentSeat = claim.seat;
    state.phase = 'awaiting-discard';
    state.drawMode = null;
    addEvent(state, 'pong', claim.seat, pending.tile, `${claim.seat}号玩家碰${tileLabel(pending.tile)}`);
    return;
  }

  removeTiles(claimant.concealedTiles, pending.tile, 3);
  claimant.melds.push({ kind: 'exposed-kong', tile: pending.tile, fromSeat: pending.discarder });
  recordGang(claimant, 'exposed', pending.discarder, 'end', false);
  updateMouthRequirement(claimant);
  state.currentSeat = claim.seat;
  state.phase = 'awaiting-draw';
  state.drawMode = 'replacement';
  state.drawAfterGang = true;
  addEvent(state, 'exposed-kong', claim.seat, pending.tile, `${claim.seat}号玩家明杠${tileLabel(pending.tile)}`);
}

function registerClaimResponse(state: GameState, action: GameAction): void {
  const pending = state.pendingDiscard;
  if (pending === null) throw new Error('当前没有待响应的弃牌');
  if (action.type !== 'pass' && action.type !== 'pong' && action.type !== 'exposed-kong' && action.type !== 'win') {
    throw new Error('不是弃牌响应动作');
  }
  const response: ClaimResponse = { type: action.type };
  pending.responses[action.seat] = response;
  resolvePendingDiscard(state);
}

export function applyAction(state: GameState, action: GameAction): GameState {
  assertLegal(state, action);
  const next = cloneState(state);
  const player = playerAt(next, action.seat);

  if (action.type === 'draw') {
    drawForPlayer(next, action.seat, next.drawMode ?? 'normal');
    return next;
  }

  if (action.type === 'declare-mouth') {
    addMouth(next, action.seat);
    return next;
  }

  if (action.type === 'win') {
    if (next.phase === 'awaiting-discard') {
      if (next.lastDrawnTile === null) throw new Error('当前没有自摸牌');
      finishWin(next, action.seat, 'self-draw', next.lastDrawnTile, null);
      return next;
    }
    if (next.phase === 'claiming' && next.pendingDiscard !== null) {
      // 抢同一张弃牌的动作必须先登记，待三家都回应后按固定起牌顺序决胜。
      registerClaimResponse(next, action);
      return next;
    }
    throw new Error('当前不能胡牌');
  }

  if (action.type === 'discard') {
    removeTile(player.concealedTiles, action.tile);
    next.lastDrawnTile = null;
    next.drawAfterGang = false;
    updateMouthRequirement(player);
    next.pendingDiscard = {
      tile: action.tile,
      discarder: action.seat,
      responses: {},
    };
    next.phase = 'claiming';
    next.drawMode = null;
    addEvent(next, 'discard', action.seat, action.tile, `${action.seat}号玩家打出${tileLabel(action.tile)}`);
    return next;
  }

  if (action.type === 'pass' || action.type === 'pong' || action.type === 'exposed-kong') {
    registerClaimResponse(next, action);
    return next;
  }

  if (action.type === 'concealed-kong') {
    removeTiles(player.concealedTiles, action.tile, 4);
    player.melds.push({ kind: 'concealed-kong', tile: action.tile });
    recordGang(player, 'concealed', null, 'end', false);
    updateMouthRequirement(player);
    next.lastDrawnTile = null;
    next.currentSeat = action.seat;
    next.phase = 'awaiting-draw';
    next.drawMode = 'replacement';
    next.drawAfterGang = true;
    addEvent(next, 'concealed-kong', action.seat, action.tile, `${action.seat}号玩家暗杠${tileLabel(action.tile)}`);
    return next;
  }

  if (action.type === 'supplement-kong') {
    if (next.lastDrawnTile !== action.tile) throw new Error('补杠必须使用本次摸到的牌');
    const meldIndex = player.melds.findIndex((meld) => meld.kind === 'pong' && meld.tile === action.tile);
    if (meldIndex < 0) throw new Error('没有对应的碰牌，不能补杠');
    removeTile(player.concealedTiles, action.tile);
    const pong = player.melds[meldIndex];
    if (pong === undefined || pong.kind !== 'pong') throw new Error('对应面子不是碰牌');
    player.melds[meldIndex] = { kind: 'added-kong', tile: action.tile, fromSeat: pong.fromSeat };
    const payer = pong.fromSeat;
    recordGang(player, 'supplement', payer, 'immediate', true);
    addPayment(next, { from: payer, to: action.seat, amount: 1, reason: 'supplement-kong' });
    addEvent(next, 'supplement-kong', action.seat, action.tile, `${action.seat}号玩家补杠${tileLabel(action.tile)}`);
    updateMouthRequirement(player);
    next.lastDrawnTile = null;
    next.currentSeat = action.seat;
    next.phase = 'awaiting-draw';
    next.drawMode = 'replacement';
    next.drawAfterGang = true;
    return next;
  }

  return next;
}

export function getPlayer(state: GameState, seat: Seat): PlayerState {
  return playerAt(state, seat);
}

export function getRemainingWallCount(state: GameState): number {
  return remainingWallTiles(state.wall);
}

export function getCurrentWaitingTiles(state: GameState, seat: Seat = state.currentSeat): NormalTile[] {
  const player = playerAt(state, seat);
  if (player.mouthDeclared) return [...player.lockedWaits];
  return getWaitingTiles(mouthCandidateTiles(state, player), player.melds);
}

export function getCurrentFanIfWinning(
  state: GameState,
  seat: Seat,
  winningTile: NormalTile,
  winType: 'self-draw' | 'discard',
): FanBreakdown | null {
  const player = playerAt(state, seat);
  let concealed: NormalTile[];
  if (winType === 'self-draw') {
    concealed = state.currentSeat === seat && state.lastDrawnTile !== null
      ? concealedBeforeLastDraw(state, player)
      : [...player.concealedTiles];
  } else {
    const alreadyCompleted = state.result?.outcome === 'win' &&
      state.result.winner === seat &&
      state.result.winType === 'discard' &&
      state.result.winningTile === winningTile;
    concealed = [...player.concealedTiles];
    if (alreadyCompleted) removeTile(concealed, winningTile);
  }
  const completed = [...concealed, winningTile];
  return isWinningHand(completed, player.melds)
    ? calculateFan({ concealedTiles: completed, melds: player.melds, fortuneCount: player.fortuneCount })
    : null;
}
