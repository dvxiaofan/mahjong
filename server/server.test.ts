import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServerMessage } from '../src/protocol.js';
import { createMahjongServer, type MahjongServer } from './server.js';

const servers: MahjongServer[] = [];
const directories: string[] = [];

afterEach(async () => {
  while (servers.length > 0) await servers.pop()!.close();
  while (directories.length > 0) await rm(directories.pop()!, { recursive: true, force: true });
});

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolvePromise, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolvePromise(socket));
    socket.once('error', reject);
  });
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
): Promise<ServerMessage> {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('等待 WebSocket 消息超时'));
    }, 5000);
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolvePromise(message);
    };
    socket.on('message', onMessage);
  });
}

async function request(
  socket: WebSocket,
  message: Record<string, unknown>,
): Promise<ServerMessage> {
  const pending = waitForMessage(socket, (candidate) => candidate.requestId === message.requestId);
  socket.send(JSON.stringify(message));
  return pending;
}

describe('HTTP + WebSocket 服务', () => {
  it('托管页面、处理真实连接广播，并从磁盘恢复房间', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'mahjong-server-'));
    directories.push(directory);
    const stateFile = join(directory, 'rooms.json');
    const first = await createMahjongServer({
      port: 0,
      staticDir: resolve(process.cwd(), 'web'),
      stateFile,
      tickIntervalMs: 50,
    });
    servers.push(first);
    const address = await first.listen();
    const page = await fetch(address.httpUrl);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('嗨！搓麻呀！');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(page.headers.get('cache-control')).toBe('no-cache');
    const health = await fetch(`${address.httpUrl}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', protocolVersion: 1, rooms: 0 });

    const firstPlayer = await connect(address.webSocketUrl);
    const created = await request(firstPlayer, {
      protocolVersion: 1,
      requestId: 'create',
      type: 'create-room',
      roomId: 'ws-room',
      displayName: '房主',
      maxRounds: 2,
    });
    expect(created.type).toBe('room-joined');
    if (created.type !== 'room-joined') return;
    const ownerToken = created.session.resumeToken;

    const lobbyBroadcast = waitForMessage(
      firstPlayer,
      (message) => message.type === 'lobby-updated' && message.lobby.playerCount === 2,
    );
    const secondPlayer = await connect(address.webSocketUrl);
    const joined = await request(secondPlayer, {
      protocolVersion: 1,
      requestId: 'join',
      type: 'join-room',
      roomId: 'ws-room',
      displayName: '玩家二',
    });
    expect(joined.type).toBe('room-joined');
    await lobbyBroadcast;

    expect(
      await request(firstPlayer, {
        protocolVersion: 1,
        requestId: 'ping',
        type: 'ping',
        nonce: 'hello',
      }),
    ).toMatchObject({ type: 'pong', nonce: 'hello' });

    const secondToken = joined.type === 'room-joined' ? joined.session.resumeToken : '';
    await new Promise<void>((resolvePromise) => {
      secondPlayer.once('close', () => resolvePromise());
      secondPlayer.close();
    });
    const reconnected = await connect(address.webSocketUrl);
    const resumed = await request(reconnected, {
      protocolVersion: 1,
      requestId: 'resume',
      type: 'join-room',
      roomId: 'ws-room',
      displayName: '玩家二',
      resumeToken: secondToken,
    });
    expect(resumed).toMatchObject({ type: 'room-joined', session: { resumed: true, seat: 1 } });

    servers.pop();
    await first.close();
    expect((await stat(stateFile)).mode & 0o777).toBe(0o600);
    const second = await createMahjongServer({
      port: 0,
      staticDir: resolve(process.cwd(), 'web'),
      stateFile,
      tickIntervalMs: 50,
    });
    servers.push(second);
    const restoredAddress = await second.listen();
    const restoredSocket = await connect(restoredAddress.webSocketUrl);
    const restored = await request(restoredSocket, {
      protocolVersion: 1,
      requestId: 'restore-owner',
      type: 'join-room',
      roomId: 'ws-room',
      displayName: '房主',
      resumeToken: ownerToken,
    });
    expect(restored).toMatchObject({
      type: 'room-joined',
      session: { resumed: true, seat: 0 },
      lobby: { playerCount: 2 },
    });
    restoredSocket.close();
    firstPlayer.close();
    reconnected.close();
  }, 20_000);
});
