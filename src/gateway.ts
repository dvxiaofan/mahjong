import { RoomRegistry, type JoinLobbyRoomInput, type LifecycleResult } from './lobby.js';
import {
  PROTOCOL_VERSION,
  createServerErrorMessage,
  handleRoomProtocolMessage,
  parseClientMessage,
  type ServerMessage,
} from './protocol.js';
import { SecurityGuard } from './security.js';

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
  readonly security: SecurityGuard;

  constructor(registry = new RoomRegistry(), security = new SecurityGuard()) {
    this.registry = registry;
    this.security = security;
  }

  async handle(connectionId: string, payload: string | unknown): Promise<ServerMessage[]> {
    const securityCheck = this.security.inspect(connectionId, payload);
    if (!securityCheck.allowed) {
      return [createServerErrorMessage(
        null,
        securityCheck.code,
        securityCheck.message,
        securityCheck.retryAfterMs > 0,
      )];
    }
    const parsed = parseClientMessage(payload);
    if (!parsed.success) {
      this.security.recordViolation(connectionId, 'invalid-message', parsed.code);
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
      if (!result.ok && result.code === 'connection-in-use') {
        this.security.recordViolation(connectionId, 'identity-conflict', result.code);
      }
      return lifecycleMessages(message.requestId, result);
    }

    if (message.type === 'join-room') {
      if (message.resumeToken !== undefined) {
        const result = this.registry.resumeRoom({
          roomId: message.roomId,
          connectionId,
          resumeToken: message.resumeToken,
        });
        if (!result.ok && result.code === 'invalid-resume-token') {
          this.security.recordViolation(connectionId, 'authentication-failure', result.code);
        }
        return lifecycleMessages(message.requestId, result);
      }
      const input: JoinLobbyRoomInput = {
        roomId: message.roomId,
        connectionId,
        displayName: message.displayName,
        role: message.role ?? 'player',
        ...(message.password === undefined ? {} : { password: message.password }),
        ...(message.seatPreference === undefined ? {} : { seatPreference: message.seatPreference }),
      };
      const result = await this.registry.joinRoom(input);
      if (!result.ok) {
        if (result.code === 'wrong-password' || result.code === 'invalid-resume-token') {
          this.security.recordViolation(connectionId, 'authentication-failure', result.code);
        } else if (result.code === 'connection-in-use') {
          this.security.recordViolation(connectionId, 'identity-conflict', result.code);
        }
      }
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

    if (message.type === 'set-trustee') {
      if (identity === null || identity.role !== 'player') {
        return [createServerErrorMessage(message.requestId, 'not-joined', '玩家连接尚未加入房间', false)];
      }
      const lobby = this.registry.setTrustee(connectionId, message.enabled);
      if (lobby === null) {
        return [createServerErrorMessage(message.requestId, 'not-joined', '无法更新托管状态', false)];
      }
      return [{
        protocolVersion: PROTOCOL_VERSION,
        requestId: message.requestId,
        type: 'trustee-updated',
        enabled: message.enabled,
        lobby,
      }];
    }

    if (identity === null) {
      return [createServerErrorMessage(message.requestId, 'not-joined', '连接尚未加入房间', true)];
    }
    const room = this.registry.getRoom(identity.roomId);
    if (room === null) {
      return [createServerErrorMessage(message.requestId, 'room-not-found', '房间不存在', false)];
    }
    const lobby = this.registry.getRoomView(identity.roomId);
    if ((message.type === 'submit-action' || message.type === 'start-next-round') &&
        (lobby?.playerCount ?? 0) < 4) {
      return [createServerErrorMessage(message.requestId, 'room-not-ready', '需要四名玩家入座后才能行动', true)];
    }
    const messages = handleRoomProtocolMessage(room, {
      connectionId,
      seat: identity.seat,
      role: identity.role,
    }, message);
    if (messages.some((candidate) =>
      candidate.type === 'action-result' && candidate.result.accepted,
    )) {
      this.registry.noteRoomActivity(identity.roomId);
    }
    for (const candidate of messages) {
      if (candidate.type !== 'action-result' || candidate.result.accepted) continue;
      if (candidate.result.code === 'illegal-action' || candidate.result.code === 'seat-mismatch' ||
          candidate.result.code === 'request-id-conflict') {
        this.security.recordViolation(connectionId, 'invalid-action', candidate.result.code);
      }
    }
    return messages;
  }

  disconnect(connectionId: string): void {
    this.registry.disconnectRoom(connectionId);
  }

  tick(now?: number) {
    return this.registry.processTimeouts(now);
  }
}
