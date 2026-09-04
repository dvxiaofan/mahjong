import { RoomRegistry, type JoinLobbyRoomInput, type LifecycleResult } from './lobby.js';
import {
  PROTOCOL_VERSION,
  createServerErrorMessage,
  handleRoomProtocolMessage,
  parseClientMessage,
  type ServerMessage,
} from './protocol.js';

function lifecycleMessages(requestId: string, result: LifecycleResult): ServerMessage[] {
  if (!result.ok) {
    return [createServerErrorMessage(requestId, result.code, result.message, false)];
  }
  return [{
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    type: 'room-joined',
    session: result.session,
    lobby: result.lobby,
    snapshot: result.snapshot,
  }];
}

/** Connection-aware, transport-neutral multiplayer gateway. */
export class MultiplayerGateway {
  readonly registry: RoomRegistry;

  constructor(registry = new RoomRegistry()) {
    this.registry = registry;
  }

  async handle(connectionId: string, payload: string | unknown): Promise<ServerMessage[]> {
    const parsed = parseClientMessage(payload);
    if (!parsed.success) {
      return [createServerErrorMessage(parsed.requestId, parsed.code, parsed.message, false)];
    }
    const message = parsed.message;
    const identity = this.registry.getConnectionIdentity(connectionId);

    if (message.type === 'hello') {
      const room = identity === null ? null : this.registry.getRoom(identity.roomId);
      return [{
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        type: 'welcome',
        roomId: identity?.roomId ?? null,
        revision: room?.getRevision() ?? null,
      }];
    }

    if (message.type === 'list-rooms') {
      return [{
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        type: 'room-list',
        rooms: this.registry.listRooms(),
      }];
    }

    if (message.type === 'create-room') {
      const result = await this.registry.createRoom({
        roomId: message.roomId,
        connectionId,
        displayName: message.displayName,
        ...(message.password === undefined ? {} : { password: message.password }),
        ...(message.maxRounds === undefined ? {} : { matchOptions: { maxRounds: message.maxRounds } }),
      });
      return lifecycleMessages(message.requestId, result);
    }

    if (message.type === 'join-room') {
      const input: JoinLobbyRoomInput = {
        roomId: message.roomId,
        connectionId,
        displayName: message.displayName,
        role: message.role ?? 'player',
        ...(message.password === undefined ? {} : { password: message.password }),
        ...(message.seatPreference === undefined ? {} : { seatPreference: message.seatPreference }),
      };
      const result = await this.registry.joinRoom(input);
      return lifecycleMessages(message.requestId, result);
    }

    if (message.type === 'leave-room') {
      if (identity === null) {
        return [createServerErrorMessage(message.requestId, 'not-joined', '连接尚未加入房间', false)];
      }
      this.registry.leaveRoom(connectionId);
      return [{
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        type: 'room-left',
        roomId: identity.roomId,
      }];
    }

    if (identity === null) {
      return [createServerErrorMessage(message.requestId, 'not-joined', '连接尚未加入房间', true)];
    }
    const room = this.registry.getRoom(identity.roomId);
    if (room === null) {
      return [createServerErrorMessage(message.requestId, 'room-not-found', '房间不存在', false)];
    }
    return handleRoomProtocolMessage(room, {
      connectionId,
      seat: identity.seat,
      role: identity.role,
    }, message);
  }
}
