import { isNormalTile } from './rules.js';
import type { GameAction, GameEventView, Seat } from './types.js';
import { SEATS } from './types.js';
import {
  AuthoritativeRoom,
  type RoomActionResult,
  type RoomSnapshot,
  type SpectatorRoomSnapshot,
} from './room.js';
import type {
  LifecycleErrorCode,
  LobbyRoomView,
  ParticipantRole,
  ParticipantSession,
} from './lobby.js';
import type { SecurityRejectCode } from './security.js';

export const PROTOCOL_VERSION = 1 as const;

// Extracting tile through a helper keeps ActionIntent independent from a client-provided seat.
type TileIntent = Extract<GameAction, { tile: unknown }>['tile'];

export type ClientActionIntent =
  | { type: 'draw' }
  | { type: 'discard'; tile: TileIntent }
  | { type: 'win' }
  | { type: 'pass' }
  | { type: 'pong' }
  | { type: 'exposed-kong' }
  | { type: 'concealed-kong'; tile: TileIntent }
  | { type: 'supplement-kong'; tile: TileIntent }
  | { type: 'declare-mouth' };

interface ClientEnvelope {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string;
}

export type ClientMessage =
  | (ClientEnvelope & { type: 'hello' })
  | (ClientEnvelope & {
      type: 'create-room';
      roomId: string;
      displayName: string;
      password?: string;
      maxRounds?: number;
    })
  | (ClientEnvelope & {
      type: 'join-room';
      roomId: string;
      displayName: string;
      role?: ParticipantRole;
      password?: string;
      seatPreference?: Seat;
      resumeToken?: string;
    })
  | (ClientEnvelope & { type: 'get-snapshot' })
  | (ClientEnvelope & { type: 'list-rooms' })
  | (ClientEnvelope & { type: 'leave-room' })
  | (ClientEnvelope & { type: 'set-trustee'; enabled: boolean })
  | (ClientEnvelope & {
      type: 'submit-action';
      expectedRevision: number;
      action: ClientActionIntent;
    })
  | (ClientEnvelope & {
      type: 'start-next-round';
      expectedRevision: number;
    })
  | (ClientEnvelope & { type: 'ping'; nonce: string });

interface ServerEnvelope {
  protocolVersion: typeof PROTOCOL_VERSION;
  requestId: string | null;
}

export type ServerErrorCode =
  | 'invalid-json'
  | 'invalid-message'
  | 'unsupported-version'
  | 'not-joined'
  | 'room-lifecycle-required'
  | 'spectator-read-only'
  | 'room-not-ready'
  | LifecycleErrorCode
  | SecurityRejectCode;

export type ServerMessage =
  | (ServerEnvelope & {
      type: 'welcome';
      roomId: string | null;
      revision: number | null;
    })
  | (ServerEnvelope & { type: 'snapshot'; snapshot: RoomSnapshot | SpectatorRoomSnapshot })
  | (ServerEnvelope & {
      type: 'room-joined';
      session: ParticipantSession;
      lobby: LobbyRoomView;
      snapshot: RoomSnapshot | SpectatorRoomSnapshot;
    })
  | (ServerEnvelope & { type: 'room-left'; roomId: string })
  | (ServerEnvelope & { type: 'room-list'; rooms: readonly LobbyRoomView[] })
  | (ServerEnvelope & { type: 'lobby-updated'; lobby: LobbyRoomView })
  | (ServerEnvelope & { type: 'trustee-updated'; enabled: boolean; lobby: LobbyRoomView })
  | (ServerEnvelope & { type: 'action-result'; result: RoomActionResult })
  | (ServerEnvelope & {
      type: 'event-batch';
      roomId: string;
      revision: number;
      events: readonly GameEventView[];
    })
  | (ServerEnvelope & { type: 'pong'; nonce: string })
  | (ServerEnvelope & {
      type: 'error';
      code: ServerErrorCode;
      message: string;
      retryable: boolean;
    });

export type ClientMessageParseResult =
  | { success: true; message: ClientMessage }
  | { success: false; code: ServerErrorCode; message: string; requestId: string | null };

export interface RoomProtocolContext {
  connectionId: string;
  seat: Seat | null;
  role?: ParticipantRole;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validRequestId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
}

function validRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validSeat(value: unknown): value is Seat {
  return typeof value === 'number' && SEATS.includes(value as Seat);
}

function parseActionIntent(value: unknown): ClientActionIntent | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  if (
    value.type === 'discard' ||
    value.type === 'concealed-kong' ||
    value.type === 'supplement-kong'
  ) {
    if (typeof value.tile !== 'string' || !isNormalTile(value.tile)) return null;
    return { type: value.type, tile: value.tile };
  }
  if (['draw', 'win', 'pass', 'pong', 'exposed-kong', 'declare-mouth'].includes(value.type)) {
    return { type: value.type } as ClientActionIntent;
  }
  return null;
}

function invalid(
  code: ServerErrorCode,
  message: string,
  requestId: string | null,
): ClientMessageParseResult {
  return { success: false, code, message, requestId };
}

export function parseClientMessage(payload: string | unknown): ClientMessageParseResult {
  let value: unknown = payload;
  if (typeof payload === 'string') {
    try {
      value = JSON.parse(payload) as unknown;
    } catch {
      return invalid('invalid-json', '消息不是有效 JSON', null);
    }
  }
  if (!isRecord(value)) return invalid('invalid-message', '消息必须是对象', null);
  const requestId = validRequestId(value.requestId) ? value.requestId : null;
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    return invalid('unsupported-version', '客户端协议版本不受支持', requestId);
  }
  if (requestId === null || typeof value.type !== 'string') {
    return invalid('invalid-message', '缺少合法的消息类型或请求 ID', requestId);
  }
  const base = { protocolVersion: PROTOCOL_VERSION, requestId } as const;

  if (value.type === 'hello') return { success: true, message: { ...base, type: 'hello' } };
  if (value.type === 'ping') {
    return typeof value.nonce === 'string' && value.nonce.length <= 128
      ? { success: true, message: { ...base, type: 'ping', nonce: value.nonce } }
      : invalid('invalid-message', 'ping nonce 无效', requestId);
  }
  if (value.type === 'get-snapshot') {
    return { success: true, message: { ...base, type: 'get-snapshot' } };
  }
  if (value.type === 'list-rooms' || value.type === 'leave-room') {
    return { success: true, message: { ...base, type: value.type } };
  }
  if (value.type === 'set-trustee') {
    return typeof value.enabled === 'boolean'
      ? { success: true, message: { ...base, type: 'set-trustee', enabled: value.enabled } }
      : invalid('invalid-message', '托管开关无效', requestId);
  }
  if (value.type === 'submit-action') {
    const action = parseActionIntent(value.action);
    if (!validRevision(value.expectedRevision) || action === null) {
      return invalid('invalid-message', '动作或修订号无效', requestId);
    }
    return {
      success: true,
      message: { ...base, type: 'submit-action', expectedRevision: value.expectedRevision, action },
    };
  }
  if (value.type === 'start-next-round') {
    return validRevision(value.expectedRevision)
      ? {
          success: true,
          message: { ...base, type: 'start-next-round', expectedRevision: value.expectedRevision },
        }
      : invalid('invalid-message', '下一局修订号无效', requestId);
  }
  if (value.type === 'join-room') {
    if (
      typeof value.roomId !== 'string' ||
      value.roomId.trim().length === 0 ||
      value.roomId.length > 64 ||
      typeof value.displayName !== 'string' ||
      value.displayName.trim().length === 0 ||
      value.displayName.length > 24 ||
      (value.role !== undefined && value.role !== 'player' && value.role !== 'spectator') ||
      (value.password !== undefined && typeof value.password !== 'string') ||
      (value.seatPreference !== undefined && !validSeat(value.seatPreference)) ||
      (value.resumeToken !== undefined && typeof value.resumeToken !== 'string')
    ) {
      return invalid('invalid-message', '加入房间参数无效', requestId);
    }
    return {
      success: true,
      message: {
        ...base,
        type: 'join-room',
        roomId: value.roomId,
        displayName: value.displayName,
        ...(value.role === undefined ? {} : { role: value.role as ParticipantRole }),
        ...(value.password === undefined ? {} : { password: value.password }),
        ...(value.seatPreference === undefined ? {} : { seatPreference: value.seatPreference }),
        ...(value.resumeToken === undefined ? {} : { resumeToken: value.resumeToken }),
      },
    };
  }
  if (value.type === 'create-room') {
    if (
      typeof value.roomId !== 'string' ||
      value.roomId.trim().length === 0 ||
      value.roomId.length > 64 ||
      typeof value.displayName !== 'string' ||
      value.displayName.trim().length === 0 ||
      value.displayName.length > 24 ||
      (value.password !== undefined && typeof value.password !== 'string') ||
      (value.maxRounds !== undefined &&
        (!Number.isInteger(value.maxRounds) ||
          (value.maxRounds as number) <= 0 ||
          (value.maxRounds as number) > 100))
    ) {
      return invalid('invalid-message', '创建房间参数无效', requestId);
    }
    return {
      success: true,
      message: {
        ...base,
        type: 'create-room',
        roomId: value.roomId,
        displayName: value.displayName,
        ...(value.password === undefined ? {} : { password: value.password }),
        ...(value.maxRounds === undefined ? {} : { maxRounds: value.maxRounds as number }),
      },
    };
  }
  return invalid('invalid-message', '未知消息类型', requestId);
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

export function createServerErrorMessage(
  requestId: string | null,
  code: ServerErrorCode,
  message: string,
  retryable: boolean,
): ServerMessage {
  return { protocolVersion: PROTOCOL_VERSION, requestId, type: 'error', code, message, retryable };
}

function actionFromIntent(intent: ClientActionIntent, seat: Seat): GameAction {
  return { ...intent, seat } as GameAction;
}

/** Transport-neutral handler used by WebSocket, HTTP tests, or local adapters. */
export function handleRoomProtocolMessage(
  room: AuthoritativeRoom,
  context: RoomProtocolContext,
  payload: string | unknown,
): ServerMessage[] {
  const parsed = parseClientMessage(payload);
  if (!parsed.success) {
    return [createServerErrorMessage(parsed.requestId, parsed.code, parsed.message, false)];
  }
  const message = parsed.message;
  if (message.type === 'hello') {
    return [
      {
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        type: 'welcome',
        roomId: room.roomId,
        revision: room.getRevision(),
      },
    ];
  }
  if (message.type === 'ping') {
    return [
      {
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        type: 'pong',
        nonce: message.nonce,
      },
    ];
  }
  if (
    message.type === 'join-room' ||
    message.type === 'create-room' ||
    message.type === 'list-rooms' ||
    message.type === 'leave-room' ||
    message.type === 'set-trustee'
  ) {
    return [
      createServerErrorMessage(
        message.requestId,
        'room-lifecycle-required',
        '房间生命周期消息由网关处理',
        true,
      ),
    ];
  }
  if (message.type === 'get-snapshot') {
    if (context.seat === null && context.role !== 'spectator') {
      return [createServerErrorMessage(message.requestId, 'not-joined', '连接尚未加入房间', true)];
    }
    return [
      {
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        type: 'snapshot',
        snapshot:
          context.seat === null ? room.getSpectatorSnapshot() : room.getSnapshot(context.seat),
      },
    ];
  }
  if (context.seat === null) {
    return [
      createServerErrorMessage(
        message.requestId,
        context.role === 'spectator' ? 'spectator-read-only' : 'not-joined',
        context.role === 'spectator' ? '观战连接不能提交动作' : '连接尚未加入座位',
        false,
      ),
    ];
  }

  const result =
    message.type === 'submit-action'
      ? room.submitAction({
          requestId: message.requestId,
          expectedRevision: message.expectedRevision,
          seat: context.seat,
          action: actionFromIntent(message.action, context.seat),
        })
      : room.startNextRound({
          requestId: message.requestId,
          expectedRevision: message.expectedRevision,
          seat: context.seat,
        });
  const messages: ServerMessage[] = [
    {
      protocolVersion: PROTOCOL_VERSION,
      requestId: message.requestId,
      type: 'action-result',
      result,
    },
  ];
  if (result.accepted) {
    messages.push({
      protocolVersion: PROTOCOL_VERSION,
      requestId: null,
      type: 'event-batch',
      roomId: room.roomId,
      revision: result.revision,
      events: result.snapshot.match.game.events,
    });
  }
  return messages;
}
