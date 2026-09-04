import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LobbyRoomView, ParticipantRole, ParticipantSession } from '../../src/lobby.ts';
import {
  PROTOCOL_VERSION,
  type ClientActionIntent,
  type ServerMessage,
} from '../../src/protocol.ts';
import type { RoomSnapshot, SpectatorRoomSnapshot } from '../../src/room.ts';
import type { GameAction } from '../../src/types.ts';

const ONLINE_SESSION_KEY = 'play-mahjong.online-session.v1';

export type OnlineConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface StoredOnlineSession {
  roomId: string;
  displayName: string;
  resumeToken: string;
}

export interface CreateOnlineRoomInput {
  roomId: string;
  displayName: string;
  password?: string;
  maxRounds: number;
}

export interface JoinOnlineRoomInput {
  roomId: string;
  displayName: string;
  password?: string;
  role: ParticipantRole;
}

export interface OnlineGameController {
  status: OnlineConnectionStatus;
  session: ParticipantSession | null;
  lobby: LobbyRoomView | null;
  snapshot: RoomSnapshot | SpectatorRoomSnapshot | null;
  rooms: readonly LobbyRoomView[];
  error: string | null;
  createRoom(input: CreateOnlineRoomInput): void;
  joinRoom(input: JoinOnlineRoomInput): void;
  leaveRoom(): void;
  refreshRooms(): void;
  dispatch(action: GameAction): void;
  startNextRound(): void;
  setTrustee(enabled: boolean): void;
}

interface LocationLike {
  protocol: string;
  hostname: string;
  port: string;
}

export function resolveWebSocketUrl(location: LocationLike, configured?: string): string {
  if (configured !== undefined && configured.trim().length > 0) return configured;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const port = location.port === '5173' ? '8787' : location.port;
  return `${protocol}//${location.hostname}${port === '' ? '' : `:${port}`}/ws`;
}

function loadStoredSession(): StoredOnlineSession | null {
  try {
    const value = localStorage.getItem(ONLINE_SESSION_KEY);
    if (value === null) return null;
    const parsed = JSON.parse(value) as Partial<StoredOnlineSession>;
    return typeof parsed.roomId === 'string' &&
      typeof parsed.displayName === 'string' &&
      typeof parsed.resumeToken === 'string'
      ? { roomId: parsed.roomId, displayName: parsed.displayName, resumeToken: parsed.resumeToken }
      : null;
  } catch {
    return null;
  }
}

function saveStoredSession(session: ParticipantSession | null): void {
  try {
    if (session === null) localStorage.removeItem(ONLINE_SESSION_KEY);
    else
      localStorage.setItem(
        ONLINE_SESSION_KEY,
        JSON.stringify({
          roomId: session.roomId,
          displayName: session.displayName,
          resumeToken: session.resumeToken,
        }),
      );
  } catch {
    // Online play still works when storage is unavailable; only auto-resume is disabled.
  }
}

function intentFromAction(action: GameAction): ClientActionIntent {
  return 'tile' in action
    ? ({ type: action.type, tile: action.tile } as ClientActionIntent)
    : ({ type: action.type } as ClientActionIntent);
}

export function useOnlineGame(): OnlineGameController {
  const [status, setStatus] = useState<OnlineConnectionStatus>('connecting');
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [lobby, setLobby] = useState<LobbyRoomView | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | SpectatorRoomSnapshot | null>(null);
  const [rooms, setRooms] = useState<readonly LobbyRoomView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const requestSequence = useRef(0);
  const reconnectTimer = useRef<number | null>(null);

  const url = useMemo(() => {
    if (typeof window === 'undefined') return 'ws://127.0.0.1:8787/ws';
    return resolveWebSocketUrl(window.location, import.meta.env.VITE_WS_URL);
  }, []);

  const nextRequestId = useCallback(() => {
    requestSequence.current += 1;
    return `web-${Date.now().toString(36)}-${requestSequence.current}`;
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      setError('尚未连接到联网服务');
      return;
    }
    socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...message }));
  }, []);

  useEffect(() => {
    let active = true;

    const connect = () => {
      if (!active) return;
      setStatus('connecting');
      const socket = new WebSocket(url);
      socketRef.current = socket;
      socket.addEventListener('open', () => {
        if (!active) return;
        setStatus('connected');
        setError(null);
        const stored = loadStoredSession();
        if (stored !== null) {
          socket.send(
            JSON.stringify({
              protocolVersion: PROTOCOL_VERSION,
              requestId: nextRequestId(),
              type: 'join-room',
              roomId: stored.roomId,
              displayName: stored.displayName,
              resumeToken: stored.resumeToken,
            }),
          );
        } else {
          socket.send(
            JSON.stringify({
              protocolVersion: PROTOCOL_VERSION,
              requestId: nextRequestId(),
              type: 'list-rooms',
            }),
          );
        }
      });
      socket.addEventListener('message', (event) => {
        if (!active) return;
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          setError('服务端返回了无法解析的消息');
          return;
        }
        if (message.type === 'room-joined') {
          setSession(message.session);
          setLobby(message.lobby);
          setSnapshot(message.snapshot);
          saveStoredSession(message.session);
          setError(null);
        } else if (message.type === 'room-left') {
          setSession(null);
          setLobby(null);
          setSnapshot(null);
          saveStoredSession(null);
        } else if (message.type === 'room-list') {
          setRooms(message.rooms);
        } else if (message.type === 'lobby-updated') {
          setLobby(message.lobby);
        } else if (message.type === 'snapshot') {
          setSnapshot(message.snapshot);
        } else if (message.type === 'action-result') {
          setSnapshot(message.result.snapshot);
          if (!message.result.accepted) setError(message.result.message);
        } else if (message.type === 'trustee-updated') {
          setLobby(message.lobby);
        } else if (message.type === 'error') {
          setError(message.message);
          if (message.code === 'invalid-resume-token' || message.code === 'room-not-found') {
            saveStoredSession(null);
            setSession(null);
          }
        }
      });
      socket.addEventListener('close', () => {
        if (!active) return;
        setStatus('disconnected');
        socketRef.current = null;
        reconnectTimer.current = window.setTimeout(connect, 1000);
      });
      socket.addEventListener('error', () => setError('无法连接联网服务'));
    };

    connect();
    return () => {
      active = false;
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [nextRequestId, url]);

  return {
    status,
    session,
    lobby,
    snapshot,
    rooms,
    error,
    createRoom: (input) =>
      send({
        requestId: nextRequestId(),
        type: 'create-room',
        ...input,
      }),
    joinRoom: (input) =>
      send({
        requestId: nextRequestId(),
        type: 'join-room',
        ...input,
      }),
    leaveRoom: () => send({ requestId: nextRequestId(), type: 'leave-room' }),
    refreshRooms: () => send({ requestId: nextRequestId(), type: 'list-rooms' }),
    dispatch: (action) => {
      if (snapshot === null || session?.seat === null || session === null) return;
      send({
        requestId: nextRequestId(),
        type: 'submit-action',
        expectedRevision: snapshot.revision,
        action: intentFromAction(action),
      });
    },
    startNextRound: () => {
      if (snapshot === null) return;
      send({
        requestId: nextRequestId(),
        type: 'start-next-round',
        expectedRevision: snapshot.revision,
      });
    },
    setTrustee: (enabled) => send({ requestId: nextRequestId(), type: 'set-trustee', enabled }),
  };
}
