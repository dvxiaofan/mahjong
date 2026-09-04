import { AuthoritativeRoom, type CreateRoomOptions, type RoomSnapshot, type SpectatorRoomSnapshot } from './room.js';
import { SEATS, type Seat } from './types.js';

export type ParticipantRole = 'player' | 'spectator';

export interface PublicParticipant {
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  seat: Seat | null;
  connected: boolean;
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
}

export interface RoomConnectionIdentity {
  roomId: string;
  participantId: string;
  role: ParticipantRole;
  seat: Seat | null;
  isHost: boolean;
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
  | 'spectator-limit';

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
}

interface ManagedParticipant {
  participantId: string;
  displayName: string;
  role: ParticipantRole;
  seat: Seat | null;
  connected: boolean;
  connectionId: string;
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
  private joinSequence = 0;

  constructor(options: RoomRegistryOptions = {}) {
    this.emptyRoomTtlMs = options.emptyRoomTtlMs ?? 5 * 60_000;
    this.spectatorLimit = options.spectatorLimit ?? 32;
    this.tokenSource = options.tokenSource ?? secureToken;
    this.now = options.now ?? Date.now;
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

  private session(roomId: string, room: ManagedRoom, participant: ManagedParticipant): ParticipantSession {
    return {
      roomId,
      participantId: participant.participantId,
      displayName: participant.displayName,
      role: participant.role,
      seat: participant.seat,
      isHost: participant.participantId === room.hostParticipantId,
      resumeToken: participant.resumeToken,
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
      connectionId: input.connectionId,
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

  leaveRoom(connectionId: string): LobbyRoomView | null {
    const connection = this.connections.get(connectionId);
    if (connection === undefined) return null;
    const room = this.rooms.get(connection.roomId);
    if (room === undefined) return null;
    const participant = room.participants.get(connection.participantId);
    if (participant === undefined) return null;
    room.participants.delete(participant.participantId);
    this.connections.delete(connectionId);

    if (room.hostParticipantId === participant.participantId) {
      room.hostParticipantId = [...room.participants.values()]
        .sort((left, right) => left.joinOrder - right.joinOrder)[0]?.participantId ?? null;
    }
    if (room.participants.size === 0) room.emptySince = this.now();
    return this.roomView(connection.roomId, room);
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
