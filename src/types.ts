import type { NormalTile, Tile } from './tiles.js';

export const SEATS = [0, 1, 2, 3] as const;
export type Seat = (typeof SEATS)[number];

export type MeldKind = 'pong' | 'exposed-kong' | 'concealed-kong' | 'added-kong';

export type Meld =
  | {
      kind: 'pong';
      tile: NormalTile;
      fromSeat: Seat;
    }
  | {
      kind: 'exposed-kong';
      tile: NormalTile;
      fromSeat: Seat;
    }
  | {
      kind: 'concealed-kong';
      tile: NormalTile;
    }
  | {
      kind: 'added-kong';
      tile: NormalTile;
      fromSeat: Seat;
    };

export type GangKind = 'supplement' | 'concealed' | 'exposed';

export interface GangRecord {
  kind: GangKind;
  seat: Seat;
  payer: Seat | null;
  amount: 1;
  settlement: 'immediate' | 'end';
  settled: boolean;
}

export interface PlayerState {
  seat: Seat;
  concealedTiles: NormalTile[];
  melds: Meld[];
  /** 当前仍留在桌面上的弃牌；被碰、杠或胡的牌会从此处移除。 */
  discards: NormalTile[];
  fortuneCount: number;
  mouthDeclared: boolean;
  lockedWaits: NormalTile[];
  /** True once the player has reached 3+发财 and听牌 without报嘴.
   * The flag remains active until报嘴; self-draw is allowed, discard wins are not. */
  mouthRequired: boolean;
  score: number;
  gangs: GangRecord[];
}

export interface WallState {
  tiles: Tile[];
  /** Next tile taken during normal play/dealing. */
  drawIndex: number;
  /** Next tile taken for发财/杠补牌, moving backwards. */
  replacementIndex: number;
}

export type GamePhase =
  | 'awaiting-draw'
  | 'awaiting-discard'
  | 'claiming'
  | 'finished'
  | 'drawn';

export type DrawMode = 'normal' | 'replacement';

export type ClaimResponse =
  | { type: 'pass' }
  | { type: 'win' }
  | { type: 'pong' }
  | { type: 'exposed-kong' };

export interface PendingDiscard {
  tile: NormalTile;
  discarder: Seat;
  responses: Partial<Record<Seat, ClaimResponse>>;
}

export type WinType = 'self-draw' | 'discard';

export interface FanItem {
  name: string;
  fan: number;
}

export interface FanBreakdown {
  total: number;
  items: FanItem[];
}

export interface Payment {
  from: Seat;
  to: Seat;
  amount: number;
  reason: 'win' | 'supplement-kong' | 'concealed-kong' | 'exposed-kong';
}

export interface RoundResult {
  outcome: 'win' | 'draw';
  winner: Seat | null;
  winType: WinType | null;
  winningTile: NormalTile | null;
  fan: FanBreakdown | null;
  payments: Payment[];
  reason: 'normal' | 'gang-draw' | 'wall-exhausted';
}

export interface GameEvent {
  type:
    | 'deal'
    | 'draw'
    | 'fortune'
    | 'replacement-draw'
    | 'discard'
    | 'pong'
    | 'exposed-kong'
    | 'concealed-kong'
    | 'supplement-kong'
    | 'mouth-declared'
    | 'win'
    | 'gang-payment'
    | 'round-draw';
  seat: Seat | null;
  tile: NormalTile | null;
  message: string;
}

export interface GameState {
  players: PlayerState[];
  wall: WallState;
  /** 本局由骰子确定的庄家/起牌位置；弃牌争抢顺序以弃牌者下家为起点。 */
  dealerSeat: Seat;
  currentSeat: Seat;
  phase: GamePhase;
  drawMode: DrawMode | null;
  lastDrawnTile: NormalTile | null;
  pendingDiscard: PendingDiscard | null;
  result: RoundResult | null;
  events: GameEvent[];
  payments: Payment[];
  drawAfterGang: boolean;
}

export type GameAction =
  | { type: 'draw'; seat: Seat }
  | { type: 'discard'; seat: Seat; tile: NormalTile }
  | { type: 'win'; seat: Seat }
  | { type: 'pass'; seat: Seat }
  | { type: 'pong'; seat: Seat }
  | { type: 'exposed-kong'; seat: Seat }
  | { type: 'concealed-kong'; seat: Seat; tile: NormalTile }
  | { type: 'supplement-kong'; seat: Seat; tile: NormalTile }
  | { type: 'declare-mouth'; seat: Seat };

export interface CreateGameOptions {
  dealerSeat?: Seat;
  seed?: number;
  wallTiles?: readonly Tile[];
}

interface CommonPlayerView {
  seat: Seat;
  concealedTileCount: number;
  melds: readonly Meld[];
  discards: readonly NormalTile[];
  fortuneCount: number;
  mouthDeclared: boolean;
  score: number;
  gangs: readonly GangRecord[];
}

/** Public information for a player other than the viewer. */
export interface PublicPlayerView extends CommonPlayerView {
  visibility: 'public';
}

/** Full information for the viewer's own player. */
export interface PlayerView extends CommonPlayerView {
  visibility: 'self';
  concealedTiles: readonly NormalTile[];
  lockedWaits: readonly NormalTile[];
  mouthRequired: boolean;
}

export type PlayerViewEntry = PlayerView | PublicPlayerView;

/** Safe representation of a pending discard; individual response choices stay private. */
export interface PendingDiscardView {
  tile: NormalTile;
  discarder: Seat;
  respondedSeats: readonly Seat[];
}

/** Event shape reserved for projected UI data; messages/tiles may be redacted. */
export interface GameEventView {
  type: GameEvent['type'];
  seat: Seat | null;
  tile: NormalTile | null;
  message: string;
}

/** UI-facing contract. It contains one full player entry and public entries for everyone else. */
export interface GameView {
  viewerSeat: Seat;
  players: readonly PlayerViewEntry[];
  wallRemaining: number;
  currentSeat: Seat;
  phase: GamePhase;
  drawMode: DrawMode | null;
  /** Only the viewer's own most recent draw; null for other players. */
  lastDrawnTile: NormalTile | null;
  pendingDiscard: PendingDiscardView | null;
  result: RoundResult | null;
  events: readonly GameEventView[];
  payments: readonly Payment[];
  /** Actions for viewerSeat only. */
  legalActions: readonly GameAction[];
}
