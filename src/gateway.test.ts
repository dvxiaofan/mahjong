import { describe, expect, it } from 'vitest';
import { MultiplayerGateway } from './gateway.js';
import { RoomRegistry } from './lobby.js';

function gateway() {
  let token = 0;
  return new MultiplayerGateway(new RoomRegistry({ tokenSource: () => `${++token}` }));
}

const base = { protocolVersion: 1 as const };

describe('多人连接网关', () => {
  it('创建、列出、加入和离开房间', async () => {
    const target = gateway();
    const created = await target.handle('c0', {
      ...base, requestId: 'create', type: 'create-room', roomId: 'gateway-room', displayName: '房主', maxRounds: 4,
    });
    expect(created[0]).toMatchObject({
      type: 'room-joined',
      session: { seat: 0, isHost: true },
      lobby: { playerCount: 1 },
    });

    const listed = await target.handle('anon', { ...base, requestId: 'list', type: 'list-rooms' });
    expect(listed[0]).toMatchObject({ type: 'room-list', rooms: [{ roomId: 'gateway-room' }] });

    const joined = await target.handle('c1', {
      ...base, requestId: 'join', type: 'join-room', roomId: 'gateway-room', displayName: '玩家二',
    });
    expect(joined[0]).toMatchObject({ type: 'room-joined', session: { seat: 1 } });

    expect(await target.handle('c1', { ...base, requestId: 'leave', type: 'leave-room' }))
      .toEqual([{ protocolVersion: 1, requestId: 'leave', type: 'room-left', roomId: 'gateway-room' }]);
  });

  it('玩家动作座位来自连接身份，观战者只能读取公开快照', async () => {
    const target = gateway();
    const directCreated = await target.registry.createRoom({
      roomId: 'play-room', connectionId: 'player', displayName: '玩家',
      matchOptions: { dealerSeat: 0, seed: 10 },
    });
    if (!directCreated.ok) throw new Error('创建房间失败');
    const action = directCreated.snapshot.match.game.legalActions[0]!;
    const intent = 'tile' in action ? { type: action.type, tile: action.tile } : { type: action.type };
    const result = await target.handle('player', {
      ...base, requestId: 'action', type: 'submit-action', expectedRevision: 0, action: { ...intent, seat: 3 },
    });
    expect(result[0]).toMatchObject({ type: 'action-result', result: { accepted: true } });

    const watcher = await target.handle('watcher', {
      ...base, requestId: 'watch', type: 'join-room', roomId: 'play-room', displayName: '观众', role: 'spectator',
    });
    expect(watcher[0]).toMatchObject({ type: 'room-joined', session: { seat: null, role: 'spectator' } });
    const snapshot = await target.handle('watcher', { ...base, requestId: 'snap', type: 'get-snapshot' });
    expect(snapshot[0]?.type).toBe('snapshot');
    if (snapshot[0]?.type !== 'snapshot') return;
    expect(snapshot[0].snapshot.match.game.viewerSeat).toBeNull();
    expect(snapshot[0].snapshot.match.game.players.every((player) => player.visibility === 'public')).toBe(true);
    expect(await target.handle('watcher', {
      ...base, requestId: 'bad-action', type: 'submit-action', expectedRevision: 1, action: { type: 'pass' },
    })).toEqual([expect.objectContaining({ type: 'error', code: 'spectator-read-only' })]);
  });

  it('密码错误和未加入连接返回结构化错误', async () => {
    const target = gateway();
    await target.handle('owner', {
      ...base, requestId: 'create', type: 'create-room', roomId: 'locked-room', displayName: '房主', password: '1234',
    });
    expect(await target.handle('bad', {
      ...base, requestId: 'join', type: 'join-room', roomId: 'locked-room', displayName: '访客', password: '9999',
    })).toEqual([expect.objectContaining({ type: 'error', code: 'wrong-password' })]);
    expect(await target.handle('anon', {
      ...base, requestId: 'snapshot', type: 'get-snapshot',
    })).toEqual([expect.objectContaining({ type: 'error', code: 'not-joined' })]);
  });

  it('断线后可用一次性恢复令牌绑定新连接', async () => {
    const target = gateway();
    const created = await target.handle('old', {
      ...base, requestId: 'create', type: 'create-room', roomId: 'resume-gateway', displayName: '玩家',
    });
    if (created[0]?.type !== 'room-joined') throw new Error('创建失败');
    const token = created[0].session.resumeToken;
    target.disconnect('old');
    const resumed = await target.handle('new', {
      ...base,
      requestId: 'resume',
      type: 'join-room',
      roomId: 'resume-gateway',
      displayName: '玩家',
      resumeToken: token,
    });
    expect(resumed[0]).toMatchObject({
      type: 'room-joined',
      session: { resumed: true, seat: 0 },
    });
    if (resumed[0]?.type !== 'room-joined') return;
    expect(resumed[0].session.resumeToken).not.toBe(token);
  });

  it('玩家可以通过协议开启托管', async () => {
    const target = gateway();
    await target.registry.createRoom({
      roomId: 'trustee-gateway', connectionId: 'player', displayName: '玩家',
      matchOptions: { dealerSeat: 0, seed: 20 },
    });
    const updated = await target.handle('player', {
      ...base, requestId: 'trustee', type: 'set-trustee', enabled: true,
    });
    expect(updated[0]).toMatchObject({ type: 'trustee-updated', enabled: true });
    expect(target.tick()[0]).toMatchObject({ seat: 0, reason: 'trustee', accepted: true });
  }, 10_000);
});
