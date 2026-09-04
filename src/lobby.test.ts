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
});
