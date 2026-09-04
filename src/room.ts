import {
  getMatchLegalActions,
  applyMatchAction,
  createMatch,
  startNextRound as startNextMatchRound,
  type CreateMatchOptions,
  type MatchRoundRecord,
  type MatchState,
  type WallOpening,
} from './match.js';
import { projectStateForSeat, projectStateForSpectator } from './view.js';
import { decideAiAction, type AiDecision, type AiPolicy } from './ai.js';
import { strategicAiPolicy } from './ai-strategy.js';
import type { GameAction, GameView, RoundResult, Seat, SpectatorGameView } from './types.js';

export interface MatchRoundView {
  roundNumber: number;
  dealerSeat: Seat;
  opening: WallOpening;
  result: RoundResult;
  scoreDeltas: readonly number[];
  cumulativeScores: readonly number[];
}

export interface MatchView {
  phase: MatchState['phase'];
  roundNumber: number;
  maxRounds: number;
  dealerSeat: Seat;
  opening: WallOpening;
  cumulativeScores: readonly number[];
  history: readonly MatchRoundView[];
  game: GameView;
}

export interface SpectatorMatchView extends Omit<MatchView, 'game'> {
  game: SpectatorGameView;
}

export interface RoomSnapshot {
  roomId: string;
  revision: number;
  match: MatchView;
}

export interface SpectatorRoomSnapshot {
  roomId: string;
  revision: number;
  match: SpectatorMatchView;
}

export interface RoomActionCommand {
  requestId: string;
  expectedRevision: number;
  seat: Seat;
  action: GameAction;
}

export interface RoomNextRoundCommand {
  requestId: string;
  expectedRevision: number;
  seat: Seat;
}

export type RoomRejectCode =
  | 'invalid-request-id'
  | 'request-id-conflict'
  | 'stale-revision'
  | 'seat-mismatch'
  | 'round-not-playing'
  | 'round-not-ready'
  | 'illegal-action';

export type RoomActionResult =
  | {
      accepted: true;
      requestId: string;
      revision: number;
      snapshot: RoomSnapshot;
    }
  | {
      accepted: false;
      requestId: string;
      revision: number;
      code: RoomRejectCode;
      message: string;
      snapshot: RoomSnapshot;
    };

export interface RoomAuditEntry {
  requestId: string;
  seat: Seat;
  actionType: GameAction['type'] | 'start-next-round';
  revisionBefore: number;
  revisionAfter: number;
  accepted: boolean;
  rejectCode: RoomRejectCode | null;
}

export interface TrusteeActionResult {
  decision: AiDecision;
  result: RoomActionResult;
}

export interface CreateRoomOptions extends CreateMatchOptions {
  roomId: string;
  idempotencyLimit?: number;
}

export interface CachedCommand {
  fingerprint: string;
  result: RoomActionResult;
}

export interface AuthoritativeRoomPersistence {
  version: 1;
  roomId: string;
  revision: number;
  idempotencyLimit: number;
  match: MatchState;
  cachedCommands: readonly [requestId: string, command: CachedCommand][];
  auditLog: readonly RoomAuditEntry[];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sameAction(left: GameAction, right: GameAction): boolean {
  if (left.type !== right.type || left.seat !== right.seat) return false;
  if ('tile' in left || 'tile' in right) {
    return 'tile' in left && 'tile' in right && left.tile === right.tile;
  }
  return true;
}

function projectRound(record: MatchRoundRecord): MatchRoundView {
  return cloneJson(record);
}

export function projectMatchForSeat(match: MatchState, seat: Seat): MatchView {
  return {
    phase: match.phase,
    roundNumber: match.roundNumber,
    maxRounds: match.maxRounds,
    dealerSeat: match.dealerSeat,
    opening: cloneJson(match.opening),
    cumulativeScores: [...match.cumulativeScores],
    history: match.history.map(projectRound),
    game: projectStateForSeat(match.game, seat),
  };
}

export function projectMatchForSpectator(match: MatchState): SpectatorMatchView {
  return {
    phase: match.phase,
    roundNumber: match.roundNumber,
    maxRounds: match.maxRounds,
    dealerSeat: match.dealerSeat,
    opening: cloneJson(match.opening),
    cumulativeScores: [...match.cumulativeScores],
    history: match.history.map(projectRound),
    game: projectStateForSpectator(match.game),
  };
}

export class AuthoritativeRoom {
  readonly roomId: string;
  private match: MatchState;
  private revision = 0;
  private readonly idempotencyLimit: number;
  private readonly cachedCommands = new Map<string, CachedCommand>();
  private readonly auditLog: RoomAuditEntry[] = [];

  constructor(options: CreateRoomOptions) {
    if (options.roomId.trim().length === 0) throw new Error('房间 ID 不能为空');
    this.roomId = options.roomId;
    this.idempotencyLimit = options.idempotencyLimit ?? 1000;
    this.match = createMatch(options);
  }

  static restore(persistence: AuthoritativeRoomPersistence): AuthoritativeRoom {
    if (persistence.version !== 1 || persistence.roomId.trim().length === 0 ||
        !Number.isInteger(persistence.revision) || persistence.revision < 0) {
      throw new Error('权威房间持久化数据无效');
    }
    const room = new AuthoritativeRoom({
      roomId: persistence.roomId,
      seed: persistence.match.seed,
      maxRounds: persistence.match.maxRounds,
      dealerSeat: persistence.match.dealerSeat,
      idempotencyLimit: persistence.idempotencyLimit,
    });
    room.match = cloneJson(persistence.match);
    room.revision = persistence.revision;
    room.cachedCommands.clear();
    for (const [requestId, command] of persistence.cachedCommands) {
      room.cachedCommands.set(requestId, cloneJson(command));
    }
    room.auditLog.splice(0, room.auditLog.length, ...persistence.auditLog.map((entry) => ({ ...entry })));
    return room;
  }

  exportState(): AuthoritativeRoomPersistence {
    return {
      version: 1,
      roomId: this.roomId,
      revision: this.revision,
      idempotencyLimit: this.idempotencyLimit,
      match: cloneJson(this.match),
      cachedCommands: [...this.cachedCommands.entries()].map(([requestId, command]) => [
        requestId,
        cloneJson(command),
      ]),
      auditLog: this.getAuditLog(),
    };
  }

  getRevision(): number {
    return this.revision;
  }

  getSnapshot(seat: Seat): RoomSnapshot {
    return {
      roomId: this.roomId,
      revision: this.revision,
      match: projectMatchForSeat(this.match, seat),
    };
  }

  getSpectatorSnapshot(): SpectatorRoomSnapshot {
    return {
      roomId: this.roomId,
      revision: this.revision,
      match: projectMatchForSpectator(this.match),
    };
  }

  getAuditLog(): RoomAuditEntry[] {
    return this.auditLog.map((entry) => ({ ...entry }));
  }

  private cache(requestId: string, fingerprint: string, result: RoomActionResult): void {
    this.cachedCommands.set(requestId, { fingerprint, result: cloneJson(result) });
    while (this.cachedCommands.size > this.idempotencyLimit) {
      const oldest = this.cachedCommands.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.cachedCommands.delete(oldest);
    }
  }

  private reject(
    command: RoomActionCommand,
    code: RoomRejectCode,
    message: string,
    fingerprint: string,
  ): RoomActionResult {
    const result: RoomActionResult = {
      accepted: false,
      requestId: command.requestId,
      revision: this.revision,
      code,
      message,
      snapshot: this.getSnapshot(command.seat),
    };
    this.auditLog.push({
      requestId: command.requestId,
      seat: command.seat,
      actionType: command.action.type,
      revisionBefore: this.revision,
      revisionAfter: this.revision,
      accepted: false,
      rejectCode: code,
    });
    this.cache(command.requestId, fingerprint, result);
    return cloneJson(result);
  }

  submitAction(command: RoomActionCommand): RoomActionResult {
    const fingerprint = JSON.stringify(command);
    const cached = this.cachedCommands.get(command.requestId);
    if (cached !== undefined) {
      if (cached.fingerprint === fingerprint) return cloneJson(cached.result);
      return {
        accepted: false,
        requestId: command.requestId,
        revision: this.revision,
        code: 'request-id-conflict',
        message: '同一请求 ID 不能用于不同命令',
        snapshot: this.getSnapshot(command.seat),
      };
    }

    if (command.requestId.trim().length === 0) {
      return this.reject(command, 'invalid-request-id', '请求 ID 不能为空', fingerprint);
    }
    if (command.expectedRevision !== this.revision) {
      return this.reject(command, 'stale-revision', '客户端修订号已过期', fingerprint);
    }
    if (command.action.seat !== command.seat) {
      return this.reject(command, 'seat-mismatch', '动作座位与连接座位不一致', fingerprint);
    }
    if (this.match.phase !== 'playing') {
      return this.reject(command, 'round-not-playing', '当前没有进行中的单局', fingerprint);
    }
    const legal = getMatchLegalActions(this.match, command.seat)
      .some((action) => sameAction(action, command.action));
    if (!legal) {
      return this.reject(command, 'illegal-action', '动作不在当前合法动作集中', fingerprint);
    }

    const revisionBefore = this.revision;
    this.match = applyMatchAction(this.match, command.action);
    this.revision += 1;
    const result: RoomActionResult = {
      accepted: true,
      requestId: command.requestId,
      revision: this.revision,
      snapshot: this.getSnapshot(command.seat),
    };
    this.auditLog.push({
      requestId: command.requestId,
      seat: command.seat,
      actionType: command.action.type,
      revisionBefore,
      revisionAfter: this.revision,
      accepted: true,
      rejectCode: null,
    });
    this.cache(command.requestId, fingerprint, result);
    return cloneJson(result);
  }

  startNextRound(command: RoomNextRoundCommand): RoomActionResult {
    const fingerprint = JSON.stringify({ type: 'start-next-round', ...command });
    const cached = this.cachedCommands.get(command.requestId);
    if (cached !== undefined) {
      if (cached.fingerprint === fingerprint) return cloneJson(cached.result);
      return {
        accepted: false,
        requestId: command.requestId,
        revision: this.revision,
        code: 'request-id-conflict',
        message: '同一请求 ID 不能用于不同命令',
        snapshot: this.getSnapshot(command.seat),
      };
    }

    const reject = (code: RoomRejectCode, message: string): RoomActionResult => {
      const result: RoomActionResult = {
        accepted: false,
        requestId: command.requestId,
        revision: this.revision,
        code,
        message,
        snapshot: this.getSnapshot(command.seat),
      };
      this.auditLog.push({
        requestId: command.requestId,
        seat: command.seat,
        actionType: 'start-next-round',
        revisionBefore: this.revision,
        revisionAfter: this.revision,
        accepted: false,
        rejectCode: code,
      });
      this.cache(command.requestId, fingerprint, result);
      return cloneJson(result);
    };

    if (command.requestId.trim().length === 0) return reject('invalid-request-id', '请求 ID 不能为空');
    if (command.expectedRevision !== this.revision) return reject('stale-revision', '客户端修订号已过期');
    if (this.match.phase !== 'between-rounds') return reject('round-not-ready', '当前不在局间阶段');

    const revisionBefore = this.revision;
    this.match = startNextMatchRound(this.match);
    this.revision += 1;
    const result: RoomActionResult = {
      accepted: true,
      requestId: command.requestId,
      revision: this.revision,
      snapshot: this.getSnapshot(command.seat),
    };
    this.auditLog.push({
      requestId: command.requestId,
      seat: command.seat,
      actionType: 'start-next-round',
      revisionBefore,
      revisionAfter: this.revision,
      accepted: true,
      rejectCode: null,
    });
    this.cache(command.requestId, fingerprint, result);
    return cloneJson(result);
  }

  submitTrusteeAction(
    seat: Seat,
    requestId: string,
    policy: AiPolicy = strategicAiPolicy,
  ): TrusteeActionResult | null {
    if (this.match.phase !== 'playing') return null;
    const decision = decideAiAction(this.match.game, seat, policy);
    if (decision === null) return null;
    const result = this.submitAction({
      requestId,
      expectedRevision: this.revision,
      seat,
      action: decision.action,
    });
    return { decision, result };
  }
}
