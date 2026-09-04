import { getLegalActions } from './game.js';
import { remainingWallTiles } from './wall.js';
import type {
  GameAction,
  GameEvent,
  GameEventView,
  GameState,
  GameView,
  GangRecord,
  Meld,
  Payment,
  PendingDiscardView,
  PlayerState,
  PlayerView,
  PlayerViewEntry,
  PublicPlayerView,
  RoundResult,
  Seat,
} from './types.js';
import { SEATS } from './types.js';

function cloneMeld(meld: Meld): Meld {
  return { ...meld } as Meld;
}

function cloneGang(gang: GangRecord): GangRecord {
  return { ...gang };
}

function clonePayment(payment: Payment): Payment {
  return { ...payment };
}

function cloneAction(action: GameAction): GameAction {
  return { ...action } as GameAction;
}

function cloneResult(result: RoundResult | null): RoundResult | null {
  if (result === null) return null;
  return {
    ...result,
    fan: result.fan === null
      ? null
      : {
          ...result.fan,
          items: result.fan.items.map((item) => ({ ...item })),
        },
    payments: result.payments.map(clonePayment),
  };
}

/**
 * Convert a player to the public portion of the UI contract.
 * The returned arrays/objects are copies so a view consumer cannot mutate game state.
 */
export function toPublicPlayerView(player: PlayerState): PublicPlayerView {
  return {
    visibility: 'public',
    seat: player.seat,
    concealedTileCount: player.concealedTiles.length,
    melds: player.melds.map(cloneMeld),
    discards: [...player.discards],
    fortuneCount: player.fortuneCount,
    mouthDeclared: player.mouthDeclared,
    score: player.score,
    gangs: player.gangs.map(cloneGang),
  };
}

/** Convert the viewer's own player to the full UI contract. */
export function toPlayerView(player: PlayerState): PlayerView {
  return {
    ...toPublicPlayerView(player),
    visibility: 'self',
    concealedTiles: [...player.concealedTiles],
    lockedWaits: [...player.lockedWaits],
    mouthRequired: player.mouthRequired,
  };
}

function projectEvent(event: GameEvent, viewerSeat: Seat): GameEventView {
  const isOwnEvent = event.seat === viewerSeat;
  if (isOwnEvent || event.type === 'fortune') {
    return { ...event };
  }

  if (event.type === 'deal') {
    return {
      ...event,
      tile: null,
      message: `${event.seat}号玩家起牌`,
    };
  }

  if (event.type === 'draw') {
    return {
      ...event,
      tile: null,
      message: `${event.seat}号玩家摸牌`,
    };
  }

  if (event.type === 'replacement-draw') {
    return {
      ...event,
      tile: null,
      message: `${event.seat}号玩家补摸一张牌`,
    };
  }

  if (event.type === 'mouth-declared') {
    return {
      ...event,
      tile: null,
      message: `${event.seat}号玩家报嘴`,
    };
  }

  return { ...event };
}

function projectPendingDiscard(
  pendingDiscard: GameState['pendingDiscard'],
): PendingDiscardView | null {
  if (pendingDiscard === null) return null;
  return {
    tile: pendingDiscard.tile,
    discarder: pendingDiscard.discarder,
    respondedSeats: SEATS.filter((seat) => pendingDiscard.responses[seat] !== undefined),
  };
}

/**
 * Project complete game state into the privacy-safe contract for one seat.
 * Opponent concealed hands, private waits and response choices are omitted.
 */
export function projectStateForSeat(state: GameState, viewerSeat: Seat): GameView {
  const viewer = state.players[viewerSeat];
  if (viewer === undefined) throw new Error(`不存在 ${viewerSeat} 号玩家`);

  const players: PlayerViewEntry[] = state.players.map((player) =>
    player.seat === viewerSeat
      ? toPlayerView(player)
      : toPublicPlayerView(player),
  );

  return {
    viewerSeat,
    players,
    wallRemaining: remainingWallTiles(state.wall),
    dealerSeat: state.dealerSeat,
    currentSeat: state.currentSeat,
    phase: state.phase,
    drawMode: state.drawMode,
    lastDrawnTile: state.currentSeat === viewerSeat ? state.lastDrawnTile : null,
    pendingDiscard: projectPendingDiscard(state.pendingDiscard),
    result: cloneResult(state.result),
    events: state.events.map((event) => projectEvent(event, viewerSeat)),
    payments: state.payments.map(clonePayment),
    legalActions: getLegalActions(state, viewerSeat).map(cloneAction),
  };
}
