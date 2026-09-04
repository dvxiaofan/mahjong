import { AuthoritativeRoom, type CreateRoomOptions, type RoomSnapshot, type SpectatorRoomSnapshot } from './room.js';
import { SEATS, type Seat } from './types.js';

export type ParticipantRole = 'player' | 'spectator';

export interface PublicParticipant {
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  seat: Seat | null;
  connected: boolean;
  trustee: boolean;
  isHost: boolean;
}

export interface LobbyRoomView {
  roomId: string;
  passwordProtected: boolean;
  revision: number;
  matchPhase: 'playing' | 'between-rounds' | 'finished';
  participants: readonly PublicParticipant[];
  playerCount: number;
  spectatorCount: number;
}

export interface ParticipantSession {
  roomId: string;
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  seat: Seat | null;
  isHost: boolean;
  resumeToken: string;
  resumed: boolean;
}

export interface RoomConnectionIdentity {
  roomId: string;
  participantId: string;
  role: ParticipantRole;
  seat: Seat | null;
  isHost: boolean;
  trustee: boolean;
}

export type AudienceSnapshot = RoomSnapshot | SpectatorRoomSnapshot;

export type LifecycleErrorCode =
  | 'invalid-room-id'
  | 'invalid-display-name'
  | 'invalid-password'
  | 'room-exists'
  | 'room-not-found'
  | 'wrong-password'
  | 'connection-in-use'
  | 'seat-unavailable'
  | 'room-full'
  | 'spectator-limit'
  | 'invalid-resume-token';

export type LifecycleResult =
  | {
      ok: true;
      session: ParticipantSession;
      lobby: LobbyRoomView;
      snapshot: AudienceSnapshot;
    }
  | { ok: false; code: LifecycleErrorCode; message: string };

export interface CreateLobbyRoomInput {
  roomId: string;
  connectionId: string;
  displayName: string;
  password?: string;
  matchOptions?: Omit<CreateRoomOptions, 'roomId' | 'idempotencyLimit'>;
}

export interface JoinLobbyRoomInput {
  roomId: string;
  connectionId: string;
  displayName: string;
  role: ParticipantRole;
  password?: string;
  seatPreference?: Seat;
}

export interface RoomRegistryOptions {
  emptyRoomTtlMs?: number;
  spectatorLimit?: number;
  tokenSource?: () => string;
  now?: () => number;
  disconnectedGraceMs?: number;
  turnTimeoutMs?: number;
  responseTimeoutMs?: number;
}

export interface ResumeRoomInput {
  roomId: string;
  connectionId: string;
  resumeToken: string;
}

export interface TrusteeTickResult {
  roomId: string;
  participantId: string;
  seat: Seat;
  reason: 'disconnected' | 'trustee' | 'timeout';
  accepted: boolean;
  revision: number;
}

interface ManagedParticipant {
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  seat: Seat | null;
  connected: boolean;
  trustee: boolean;
  connectionId: string | null;
  disconnectedAt: number | null;
  resumeToken: string;
  joinOrder: number;
}

interface ManagedRoom {
  engine: AuthoritativeRoom;
  passwordSalt: string | null;
  passwordDigest: string | null;
  participants: Map<string, ManagedParticipant>;
  hostParticipantId: string | null;
  emptySince: number | null;
  actionDeadlineAt: number;
}

function secureToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function digestPassword(password: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function validRoomId(roomId: string): boolean {
  return roomId.trim().length >= 3 && roomId.length <= 64 && !/[\u0000-\u001f]/.test(roomId);
}

function validDisplayName(name: string): boolean {
  return name.trim().length >= 1 && name.length <= 24 && !/[\u0000-\u001f]/.test(name);
}

function validPassword(password: string | undefined): boolean {
  return password === undefined || (password.length >= 4 && password.length <= 64);
}

export class RoomRegistry {
  private readonly rooms = new Map<string, ManagedRoom>();
  private readonly connections = new Map<string, { roomId: string; participantId: string }>();
  private readonly emptyRoomTtlMs: number;
  private readonly spectatorLimit: number;
  private readonly tokenSource: () => string;
  private readonly now: () => number;
  private readonly disconnectedGraceMs: number;
  private readonly turnTimeoutMs: number;
  private readonly responseTimeoutMs: number;
  private joinSequence = 0;

  constructor(options: RoomRegistryOptions = {}) {
    this.emptyRoomTtlMs = options.emptyRoomTtlMs ?? 5 * 60_000;
    this.spectatorLimit = options.spectatorLimit ?? 32;
    this.tokenSource = options.tokenSource ?? secureToken;
    this.now = options.now ?? Date.now;
    this.disconnectedGraceMs = options.disconnectedGraceMs ?? 2 * 60_000;
    this.turnTimeoutMs = options.turnTimeoutMs ?? 30_000;
    this.responseTimeoutMs = options.responseTimeoutMs ?? 12_000;
  }

  private uniqueToken(prefix: string): string {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const token = `${prefix}_${this.tokenSource()}`;
      const collision = [...this.rooms.values()].some((room) =>
        [...room.participants.values()].some((participant) =>
          participant.participantId === token || participant.resumeToken === token,
        ),
      );
      if (!collision) return token;
    }
    throw new Error('无法生成唯一房间令牌');
  }

  private publicParticipant(room: ManagedRoom, participant: ManagedParticipant): PublicParticipant {
    return {
      participantId: participant.participantId,
      displayName: participant.displayName,
      role: participant.role,
      seat: participant.seat,
      connected: participant.connected,
      trustee: participant.trustee,
      isHost: participant.participantId === room.hostParticipantId,
    };
  }

  private roomView(roomId: string, room: ManagedRoom): LobbyRoomView {
    const participants = [...room.participants.values()]
      .sort((left, right) => left.joinOrder - right.joinOrder)
      .map((participant) => this.publicParticipant(room, participant));
    const spectator = room.engine.getSpectatorSnapshot();
    return {
      roomId,
      passwordProtected: room.passwordDigest !== null,
      revision: room.engine.getRevision(),
      matchPhase: spectator.match.phase,
      participants,
      playerCount: participants.filter((participant) => participant.role === 'player').length,
      spectatorCount: participants.filter((participant) => participant.role === 'spectator').length,
    };
  }

  private session(
    roomId: string,
    room: ManagedRoom,
    participant: ManagedParticipant,
    resumed = false,
  ): ParticipantSession {
    return {
      roomId,
      participantId: participant.participantId,
      displayName: participant.displayName,
      role: participant.role,
      seat: participant.seat,
      isHost: participant.participantId === room.hostParticipantId,
      resumeToken: participant.resumeToken,
      resumed,
    };
  }

  private snapshot(room: ManagedRoom, participant: ManagedParticipant): AudienceSnapshot {
    return participant.seat === null
      ? room.engine.getSpectatorSnapshot()
      : room.engine.getSnapshot(participant.seat);
  }

  private addParticipant(
    roomId: string,
    room: ManagedRoom,
    input: Pick<JoinLobbyRoomInput, 'connectionId' | 'displayName' | 'role'>,
    seat: Seat | null,
  ): LifecycleResult {
    const participant: ManagedParticipant = {
      participantId: this.uniqueToken('participant'),
      displayName: input.displayName.trim(),
      role: input.role,
      seat,
      connected: true,
      trustee: false,
      connectionId: input.connectionId,
      disconnectedAt: null,
      resumeToken: this.uniqueToken('resume'),
      joinOrder: this.joinSequence,
    };
    this.joinSequence += 1;
    room.participants.set(participant.participantId, participant);
    this.connections.set(input.connectionId, { roomId, participantId: participant.participantId });
    if (room.hostParticipantId === null) room.hostParticipantId = participant.participantId;
    room.emptySince = null;
    return {
      ok: true,
      session: this.session(roomId, room, participant),
      lobby: this.roomView(roomId, room),
      snapshot: this.snapshot(room, participant),
    };
  }

  async createRoom(input: CreateLobbyRoomInput): Promise<LifecycleResult> {
    if (!validRoomId(input.roomId)) return { ok: false, code: 'invalid-room-id', message: '房间 ID 长度或字符无效' };
    if (!validDisplayName(input.displayName)) return { ok: false, code: 'invalid-display-name', message: '昵称长度或字符无效' };
    if (!validPassword(input.password)) return { ok: false, code: 'invalid-password', message: '密码需为 4 到 64 个字符' };
    if (this.rooms.has(input.roomId)) return { ok: false, code: 'room-exists', message: '房间已存在' };
    if (this.connections.has(input.connectionId)) return { ok: false, code: 'connection-in-use', message: '连接已经加入房间' };

    const salt = input.password === undefined ? null : this.uniqueToken('salt');
    const room: ManagedRoom = {
      engine: new AuthoritativeRoom({ roomId: input.roomId, ...(input.matchOptions ?? {}) }),
      passwordSalt: salt,
      passwordDigest: input.password === undefined ? null : await digestPassword(input.password, salt!),
      participants: new Map(),
      hostParticipantId: null,
      emptySince: null,
      actionDeadlineAt: this.now() + this.turnTimeoutMs,
    };
    this.rooms.set(input.roomId, room);
    return this.addParticipant(input.roomId, room, {
      connectionId: input.connectionId,
      displayName: input.displayName,
      role: 'player',
    }, 0);
  }

  async joinRoom(input: JoinLobbyRoomInput): Promise<LifecycleResult> {
    const room = this.rooms.get(input.roomId);
    if (room === undefined) return { ok: false, code: 'room-not-found', message: '房间不存在' };
    if (!validDisplayName(input.displayName)) return { ok: false, code: 'invalid-display-name', message: '昵称长度或字符无效' };
    if (!validPassword(input.password)) return { ok: false, code: 'invalid-password', message: '密码需为 4 到 64 个字符' };
    if (this.connections.has(input.connectionId)) return { ok: false, code: 'connection-in-use', message: '连接已经加入房间' };
    if (room.passwordDigest !== null && room.passwordSalt !== null) {
      if (input.password === undefined) return { ok: false, code: 'wrong-password', message: '房间密码不正确' };
      const digest = await digestPassword(input.password, room.passwordSalt);
      if (!constantTimeEqual(digest, room.passwordDigest)) {
        return { ok: false, code: 'wrong-password', message: '房间密码不正确' };
      }
    }

    if (input.role === 'spectator') {
      const spectators = [...room.participants.values()].filter((participant) => participant.role === 'spectator');
      if (spectators.length >= this.spectatorLimit) {
        return { ok: false, code: 'spectator-limit', message: '观战人数已满' };
      }
      return this.addParticipant(input.roomId, room, input, null);
    }

    const occupied = new Set(
      [...room.participants.values()]
        .filter((participant) => participant.role === 'player' && participant.seat !== null)
        .map((participant) => participant.seat),
    );
    if (input.seatPreference !== undefined && occupied.has(input.seatPreference)) {
      return { ok: false, code: 'seat-unavailable', message: '指定座位已被占用' };
    }
    const seat = input.seatPreference ?? SEATS.find((candidate) => !occupied.has(candidate));
    if (seat === undefined) return { ok: false, code: 'room-full', message: '四个玩家座位已满' };
    return this.addParticipant(input.roomId, room, input, seat);
  }

  resumeRoom(input: ResumeRoomInput): LifecycleResult {
    const room = this.rooms.get(input.roomId);
    if (room === undefined) return { ok: false, code: 'room-not-found', message: '房间不存在' };
    if (this.connections.has(input.connectionId)) {
      return { ok: false, code: 'connection-in-use', message: '连接已经加入房间' };
    }
    const participant = [...room.participants.values()].find((candidate) =>
      constantTimeEqual(candidate.resumeToken, input.resumeToken),
    );
    if (participant === undefined || participant.connected) {
      return { ok: false, code: 'invalid-resume-token', message: '恢复令牌无效或已使用' };
    }

    participant.connected = true;
    participant.trustee = false;
    participant.connectionId = input.connectionId;
    participant.disconnectedAt = null;
    participant.resumeToken = this.uniqueToken('resume');
    this.connections.set(input.connectionId, {
      roomId: input.roomId,
      participantId: participant.participantId,
    });
    room.emptySince = null;
    return {
      ok: true,
      session: this.session(input.roomId, room, participant, true),
      lobby: this.roomView(input.roomId, room),
      snapshot: this.snapshot(room, participant),
    };
  }

  disconnectRoom(connectionId: string): LobbyRoomView | null {
    const connection = this.connections.get(connectionId);
    if (connection === undefined) return null;
    const room = this.rooms.get(connection.roomId);
    const participant = room?.participants.get(connection.participantId);
    if (room === undefined || participant === undefined) return null;
    this.connections.delete(connectionId);
    participant.connected = false;
    participant.connectionId = null;
    participant.disconnectedAt = this.now();
    participant.trustee = participant.role === 'player';
    return this.roomView(connection.roomId, room);
  }

  setTrustee(connectionId: string, enabled: boolean): LobbyRoomView | null {
    const connection = this.connections.get(connectionId);
    if (connection === undefined) return null;
    const room = this.rooms.get(connection.roomId);
    const participant = room?.participants.get(connection.participantId);
    if (room === undefined || participant === undefined || participant.role !== 'player') return null;
    participant.trustee = enabled;
    return this.roomView(connection.roomId, room);
  }

  private removeParticipant(room: ManagedRoom, participant: ManagedParticipant): void {
    room.participants.delete(participant.participantId);
    if (participant.connectionId !== null) this.connections.delete(participant.connectionId);
    if (room.hostParticipantId === participant.participantId) {
      room.hostParticipantId = [...room.participants.values()]
        .sort((left, right) => left.joinOrder - right.joinOrder)[0]?.participantId ?? null;
    }
    if (room.participants.size === 0) room.emptySince = this.now();
  }

  leaveRoom(connectionId: string): LobbyRoomView | null {
    const connection = this.connections.get(connectionId);
    if (connection === undefined) return null;
    const room = this.rooms.get(connection.roomId);
    if (room === undefined) return null;
    const participant = room.participants.get(connection.participantId);
    if (participant === undefined) return null;
    this.removeParticipant(room, participant);
    return this.roomView(connection.roomId, room);
  }

  noteRoomActivity(roomId: string, now = this.now()): void {
    const room = this.rooms.get(roomId);
    if (room === undefined) return;
    const phase = room.engine.getSpectatorSnapshot().match.game.phase;
    room.actionDeadlineAt = now + (phase === 'claiming' ? this.responseTimeoutMs : this.turnTimeoutMs);
  }

  processTimeouts(now = this.now()): TrusteeTickResult[] {
    const processed: TrusteeTickResult[] = [];
    for (const [roomId, room] of this.rooms) {
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const publicSnapshot = room.engine.getSpectatorSnapshot();
        if (publicSnapshot.match.phase !== 'playing') break;
        const candidates = [...room.participants.values()]
          .filter((participant): participant is ManagedParticipant & { seat: Seat } =>
            participant.role === 'player' && participant.seat !== null &&
            room.engine.getSnapshot(participant.seat).match.game.legalActions.length > 0,
          )
          .sort((left, right) => left.seat - right.seat);
        const participant = candidates.find((candidate) =>
          !candidate.connected || candidate.trustee || now >= room.actionDeadlineAt,
        );
        if (participant === undefined) break;
        const reason: TrusteeTickResult['reason'] = !participant.connected
          ? 'disconnected'
          : participant.trustee
            ? 'trustee'
            : 'timeout';
        const requestId = `server-${reason}-${room.engine.getRevision()}-${participant.seat}`;
        let accepted = false;
        let revision = room.engine.getRevision();

        if (reason === 'timeout' && publicSnapshot.match.game.phase === 'claiming') {
          const pass = room.engine.getSnapshot(participant.seat).match.game.legalActions
            .find((action) => action.type === 'pass');
          if (pass !== undefined) {
            const result = room.engine.submitAction({
              requestId,
              expectedRevision: room.engine.getRevision(),
              seat: participant.seat,
              action: pass,
            });
            accepted = result.accepted;
            revision = result.revision;
          }
        } else {
          const trustee = room.engine.submitTrusteeAction(participant.seat, requestId);
          accepted = trustee?.result.accepted ?? false;
          revision = trustee?.result.revision ?? revision;
        }
        processed.push({
          roomId,
          participantId: participant.participantId,
          seat: participant.seat,
          reason,
          accepted,
          revision,
        });
        if (!accepted) break;
        this.noteRoomActivity(roomId, now);
      }
    }
    return processed;
  }

  sweepDisconnectedParticipants(now = this.now()): string[] {
    const removed: string[] = [];
    for (const [roomId, room] of this.rooms) {
      for (const participant of [...room.participants.values()]) {
        if (!participant.connected && participant.disconnectedAt !== null &&
            now - participant.disconnectedAt >= this.disconnectedGraceMs) {
          this.removeParticipant(room, participant);
          removed.push(participant.participantId);
        }
      }
    }
    return removed;
  }

  getConnectionIdentity(connectionId: string): RoomConnectionIdentity | null {
    const connection = this.connections.get(connectionId);
    if (connection === undefined) return null;
    const room = this.rooms.get(connection.roomId);
    const participant = room?.participants.get(connection.participantId);
    if (room === undefined || participant === undefined) return null;
    return {
      roomId: connection.roomId,
      participantId: participant.participantId,
      role: participant.role,
      seat: participant.seat,
      isHost: participant.participantId === room.hostParticipantId,
      trustee: participant.trustee,
    };
  }

  getRoom(roomId: string): AuthoritativeRoom | null {
    return this.rooms.get(roomId)?.engine ?? null;
  }

  getRoomView(roomId: string): LobbyRoomView | null {
    const room = this.rooms.get(roomId);
    return room === undefined ? null : this.roomView(roomId, room);
  }

  listRooms(): LobbyRoomView[] {
    return [...this.rooms.entries()].map(([roomId, room]) => this.roomView(roomId, room));
  }

  sweepEmptyRooms(now = this.now()): string[] {
    const removed: string[] = [];
    for (const [roomId, room] of this.rooms) {
      if (room.emptySince !== null && now - room.emptySince >= this.emptyRoomTtlMs) {
        this.rooms.delete(roomId);
        removed.push(roomId);
      }
    }
    return removed;
  }
}
