import { createServer, type Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { MultiplayerGateway } from '../src/gateway.js';
import { RoomRegistry } from '../src/lobby.js';
import { PROTOCOL_VERSION, encodeServerMessage, type ServerMessage } from '../src/protocol.js';
import { loadRoomRegistry, saveRoomRegistry } from './persistence.js';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export interface MahjongServerOptions {
  host?: string;
  port?: number;
  staticDir?: string;
  stateFile?: string;
  gateway?: MultiplayerGateway;
  tickIntervalMs?: number;
}

export interface MahjongServerAddress {
  host: string;
  port: number;
  httpUrl: string;
  webSocketUrl: string;
}

export interface MahjongServer {
  gateway: MultiplayerGateway;
  httpServer: HttpServer;
  listen(): Promise<MahjongServerAddress>;
  close(): Promise<void>;
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(encodeServerMessage(message));
}

async function staticResponse(
  staticDir: string,
  requestPath: string,
): Promise<{ body: Buffer; type: string } | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0] ?? '/');
  } catch {
    return null;
  }
  const root = resolve(staticDir);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  let candidate = resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  try {
    const info = await stat(candidate);
    if (!info.isFile()) return null;
  } catch {
    if (extname(relative) !== '') return null;
    candidate = resolve(root, 'index.html');
  }
  try {
    return {
      body: await readFile(candidate),
      type: contentTypes[extname(candidate)] ?? 'application/octet-stream',
    };
  } catch {
    return null;
  }
}

export async function createMahjongServer(
  options: MahjongServerOptions = {},
): Promise<MahjongServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const staticDir = options.staticDir ?? resolve(process.cwd(), 'dist-web');
  const restoredRegistry =
    options.gateway === undefined && options.stateFile !== undefined
      ? await loadRoomRegistry(options.stateFile)
      : null;
  const gateway = options.gateway ?? new MultiplayerGateway(restoredRegistry ?? new RoomRegistry());
  let shuttingDown = false;
  let persistenceQueue = Promise.resolve();

  const httpServer = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    const asset = await staticResponse(staticDir, request.url ?? '/');
    if (asset === null) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': asset.type,
      'content-length': asset.body.byteLength,
      'x-content-type-options': 'nosniff',
      'cache-control': extname(request.url ?? '') === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    response.end(request.method === 'HEAD' ? undefined : asset.body);
  });
  const webSockets = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    maxPayload: 16 * 1024,
  });
  const connections = new Map<WebSocket, string>();

  const schedulePersistence = () => {
    if (options.stateFile === undefined) return;
    persistenceQueue = persistenceQueue
      .then(() => saveRoomRegistry(gateway.registry, options.stateFile!))
      .catch(() => undefined);
  };

  const broadcastRoom = (roomId: string) => {
    const room = gateway.registry.getRoom(roomId);
    const lobby = gateway.registry.getRoomView(roomId);
    if (room === null || lobby === null) return;
    for (const [socket, connectionId] of connections) {
      const identity = gateway.registry.getConnectionIdentity(connectionId);
      if (identity?.roomId !== roomId) continue;
      send(socket, {
        protocolVersion: PROTOCOL_VERSION,
        requestId: null,
        type: 'lobby-updated',
        lobby,
      });
      send(socket, {
        protocolVersion: PROTOCOL_VERSION,
        requestId: null,
        type: 'snapshot',
        snapshot:
          identity.seat === null ? room.getSpectatorSnapshot() : room.getSnapshot(identity.seat),
      });
    }
  };

  webSockets.on('connection', (socket) => {
    const connectionId = randomUUID();
    connections.set(socket, connectionId);

    socket.on('message', async (data, isBinary) => {
      if (isBinary) {
        send(socket, {
          protocolVersion: PROTOCOL_VERSION,
          requestId: null,
          type: 'error',
          code: 'invalid-message',
          message: '只接受 JSON 文本消息',
          retryable: false,
        });
        return;
      }
      const before = gateway.registry.getConnectionIdentity(connectionId)?.roomId ?? null;
      const messages = await gateway.handle(connectionId, data.toString());
      for (const message of messages) send(socket, message);
      const after = gateway.registry.getConnectionIdentity(connectionId)?.roomId ?? null;
      const changed = messages.some(
        (message) =>
          message.type === 'room-joined' ||
          message.type === 'room-left' ||
          message.type === 'trustee-updated' ||
          (message.type === 'action-result' && message.result.accepted),
      );
      if (changed) {
        if (before !== null) broadcastRoom(before);
        if (after !== null && after !== before) broadcastRoom(after);
        schedulePersistence();
      }
    });

    socket.on('close', () => {
      connections.delete(socket);
      if (shuttingDown) return;
      const roomId = gateway.registry.getConnectionIdentity(connectionId)?.roomId ?? null;
      gateway.disconnect(connectionId);
      if (roomId !== null) broadcastRoom(roomId);
      schedulePersistence();
    });
  });

  const interval = setInterval(() => {
    const processed = gateway.tick();
    for (const roomId of new Set(processed.map((entry) => entry.roomId))) broadcastRoom(roomId);
    if (processed.length > 0) schedulePersistence();
    gateway.registry.sweepDisconnectedParticipants();
    gateway.registry.sweepEmptyRooms();
  }, options.tickIntervalMs ?? 1000);
  interval.unref();

  return {
    gateway,
    httpServer,
    listen: () =>
      new Promise((resolvePromise, reject) => {
        const onError = (error: Error) => reject(error);
        httpServer.once('error', onError);
        httpServer.listen(port, host, () => {
          httpServer.off('error', onError);
          const address = httpServer.address();
          if (address === null || typeof address === 'string') {
            reject(new Error('无法读取服务监听地址'));
            return;
          }
          resolvePromise({
            host,
            port: address.port,
            httpUrl: `http://${host}:${address.port}`,
            webSocketUrl: `ws://${host}:${address.port}/ws`,
          });
        });
      }),
    close: async () => {
      shuttingDown = true;
      clearInterval(interval);
      schedulePersistence();
      await persistenceQueue;
      for (const socket of connections.keys()) socket.close();
      await new Promise<void>((resolvePromise) => webSockets.close(() => resolvePromise()));
      await new Promise<void>((resolvePromise, reject) => {
        httpServer.close((error) => (error === undefined ? resolvePromise() : reject(error)));
      });
    },
  };
}
