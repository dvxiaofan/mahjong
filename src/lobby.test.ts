import { describe, expect, it } from 'vitest';
import { RoomRegistry } from './lobby.js';

function registry(options: { now?: () => number; spectatorLimit?: number } = {}) {
  let token = 0;
  return new RoomRegistry({
    ...options,
    tokenSource: () => `${++token}`,
  });
}

describe('房间注册表与生命周期', () => {
  it('创建者成为房主和0号座位，公开视图不暴露令牌', async () => {
    const rooms = registry();
    const result = await rooms.createRoom({
      roomId: 'room-001', connectionId: 'c1', displayName: '玩家一', matchOptions: { seed: 1 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session).toMatchObject({ role: 'player', seat: 0, isHost: true });
    expect(result.session.resumeToken).toMatch(/^resume_/);
    expect(result.lobby.playerCount).toBe(1);
    expect(JSON.stringify(result.lobby)).not.toContain(result.session.resumeToken);
  });

  it('分配偏好座位、拒绝占用座位并限制第五名玩家', async () => {
    const rooms = registry();
    await rooms.createRoom({ roomId: 'room-002', connectionId: 'c0', displayName: 'P0' });
    const preferred = await rooms.joinRoom({
      roomId: 'room-002', connectionId: 'c2', displayName: 'P2', role: 'player', seatPreference: 2,
    });
    expect(preferred.ok && preferred.session.seat).toBe(2);
    expect(await rooms.joinRoom({
      roomId: 'room-002', connectionId: 'cx', displayName: 'PX', role: 'player', seatPreference: 2,
    })).toMatchObject({ ok: false, code: 'seat-unavailable' });
    await rooms.joinRoom({ roomId: 'room-002', connectionId: 'c1', displayName: 'P1', role: 'player' });
    await rooms.joinRoom({ roomId: 'room-002', connectionId: 'c3', displayName: 'P3', role: 'player' });
    expect(await rooms.joinRoom({
      roomId: 'room-002', connectionId: 'c4', displayName: 'P4', role: 'player',
    })).toMatchObject({ ok: false, code: 'room-full' });
  });

  it('密码房间校验加盐摘要，正确密码可以加入', async () => {
    const rooms = registry();
    const created = await rooms.createRoom({
      roomId: 'secure-room', connectionId: 'owner', displayName: '房主', password: '1234',
    });
    expect(created.ok && created.lobby.passwordProtected).toBe(true);
    expect(await rooms.joinRoom({
      roomId: 'secure-room', connectionId: 'bad', displayName: '错误', role: 'player', password: '9999',
    })).toMatchObject({ ok: false, code: 'wrong-password' });
    expect(await rooms.joinRoom({
      roomId: 'secure-room', connectionId: 'good', displayName: '正确', role: 'player', password: '1234',
    })).toMatchObject({ ok: true });
  });

  it('观战者不占座位且收到全公开快照', async () => {
    const rooms = registry({ spectatorLimit: 1 });
    await rooms.createRoom({ roomId: 'watch-room', connectionId: 'owner', displayName: '房主' });
    const watcher = await rooms.joinRoom({
      roomId: 'watch-room', connectionId: 'watcher', displayName: '观众', role: 'spectator',
    });
    expect(watcher.ok).toBe(true);
    if (!watcher.ok) return;
    expect(watcher.session.seat).toBeNull();
    expect(watcher.snapshot.match.game.viewerSeat).toBeNull();
    expect(watcher.snapshot.match.game.players.every((player) => player.visibility === 'public')).toBe(true);
    expect(await rooms.joinRoom({
      roomId: 'watch-room', connectionId: 'watcher2', displayName: '观众二', role: 'spectator',
    })).toMatchObject({ ok: false, code: 'spectator-limit' });
  });

  it('房主离开时转移房主并释放座位', async () => {
    const rooms = registry();
    await rooms.createRoom({ roomId: 'host-room', connectionId: 'owner', displayName: '房主' });
    const second = await rooms.joinRoom({
      roomId: 'host-room', connectionId: 'second', displayName: '第二位', role: 'player',
    });
    expect(second.ok).toBe(true);
    const view = rooms.leaveRoom('owner');
    expect(view?.participants[0]).toMatchObject({ displayName: '第二位', isHost: true });
    const replacement = await rooms.joinRoom({
      roomId: 'host-room', connectionId: 'replacement', displayName: '补位', role: 'player', seatPreference: 0,
    });
    expect(replacement.ok && replacement.session.seat).toBe(0);
  });

  it('空房超过保留时间后被回收', async () => {
    let now = 1000;
    const rooms = new RoomRegistry({
      emptyRoomTtlMs: 500,
      now: () => now,
      tokenSource: (() => { let token = 0; return () => `${++token}`; })(),
    });
    await rooms.createRoom({ roomId: 'empty-room', connectionId: 'owner', displayName: '房主' });
    rooms.leaveRoom('owner');
    now = 1499;
    expect(rooms.sweepEmptyRooms()).toEqual([]);
    now = 1500;
    expect(rooms.sweepEmptyRooms()).toEqual(['empty-room']);
    expect(rooms.getRoomView('empty-room')).toBeNull();
  });

  it('临时断线保留座位，恢复令牌重连后轮换', async () => {
    const rooms = registry();
    const created = await rooms.createRoom({
      roomId: 'resume-room', connectionId: 'old', displayName: '玩家',
    });
    if (!created.ok) throw new Error('创建失败');
    const oldToken = created.session.resumeToken;
    const disconnected = rooms.disconnectRoom('old');
    expect(disconnected?.participants[0]).toMatchObject({ connected: false, trustee: true, seat: 0 });
    expect(rooms.getConnectionIdentity('old')).toBeNull();
    expect(await rooms.joinRoom({
      roomId: 'resume-room', connectionId: 'other', displayName: '抢座', role: 'player', seatPreference: 0,
    })).toMatchObject({ ok: false, code: 'seat-unavailable' });
    expect(rooms.resumeRoom({
      roomId: 'resume-room', connectionId: 'bad', resumeToken: 'wrong',
    })).toMatchObject({ ok: false, code: 'invalid-resume-token' });

    const resumed = rooms.resumeRoom({
      roomId: 'resume-room', connectionId: 'new', resumeToken: oldToken,
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.session).toMatchObject({ resumed: true, seat: 0 });
    expect(resumed.session.resumeToken).not.toBe(oldToken);
    expect(resumed.lobby.participants[0]).toMatchObject({ connected: true, trustee: false });
    rooms.disconnectRoom('new');
    expect(rooms.resumeRoom({
      roomId: 'resume-room', connectionId: 'replay', resumeToken: oldToken,
    })).toMatchObject({ ok: false, code: 'invalid-resume-token' });
  });

  it('断线超过保留期后释放参与者和座位', async () => {
    let now = 0;
    const rooms = new RoomRegistry({
      disconnectedGraceMs: 100,
      now: () => now,
      tokenSource: (() => { let token = 0; return () => `${++token}`; })(),
    });
    const created = await rooms.createRoom({ roomId: 'grace-room', connectionId: 'old', displayName: '玩家' });
    if (!created.ok) throw new Error('创建失败');
    rooms.disconnectRoom('old');
    now = 99;
    expect(rooms.sweepDisconnectedParticipants()).toEqual([]);
    now = 100;
    expect(rooms.sweepDisconnectedParticipants()).toEqual([created.session.participantId]);
    expect(rooms.getRoomView('grace-room')?.playerCount).toBe(0);
  });

  it('在线超时由同座 AI 行动，响应阶段超时优先过牌', async () => {
    let now = 0;
    const rooms = new RoomRegistry({
      turnTimeoutMs: 100,
      responseTimeoutMs: 50,
      now: () => now,
      tokenSource: (() => { let token = 0; return () => `${++token}`; })(),
    });
    await rooms.createRoom({
      roomId: 'timeout-room', connectionId: 'c0', displayName: 'P0',
      matchOptions: { dealerSeat: 0, seed: 10 },
    });
    await rooms.joinRoom({ roomId: 'timeout-room', connectionId: 'c1', displayName: 'P1', role: 'player' });
    await rooms.joinRoom({ roomId: 'timeout-room', connectionId: 'c2', displayName: 'P2', role: 'player' });
    await rooms.joinRoom({ roomId: 'timeout-room', connectionId: 'c3', displayName: 'P3', role: 'player' });

    now = 100;
    const turn = rooms.processTimeouts();
    expect(turn[0]).toMatchObject({ seat: 0, reason: 'timeout', accepted: true, revision: 1 });
    now = 150;
    const response = rooms.processTimeouts();
    expect(response[0]).toMatchObject({ seat: 1, reason: 'timeout', accepted: true, revision: 2 });
    expect(rooms.getRoom('timeout-room')?.getAuditLog().at(-1)?.actionType).toBe('pass');
  }, 10_000);

  it('断线或主动托管玩家在轮到时立即由 AI 接管', async () => {
    const rooms = registry();
    await rooms.createRoom({
      roomId: 'trustee-room', connectionId: 'c0', displayName: 'P0',
      matchOptions: { dealerSeat: 0, seed: 11 },
    });
    rooms.setTrustee('c0', true);
    expect(rooms.processTimeouts()[0]).toMatchObject({ seat: 0, reason: 'trustee', accepted: true });

    const disconnectedRooms = registry();
    await disconnectedRooms.createRoom({
      roomId: 'disconnect-room', connectionId: 'c0', displayName: 'P0',
      matchOptions: { dealerSeat: 0, seed: 12 },
    });
    disconnectedRooms.disconnectRoom('c0');
    expect(disconnectedRooms.processTimeouts()[0]).toMatchObject({ seat: 0, reason: 'disconnected', accepted: true });
  }, 10_000);
});
