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
      roomId: 'room-001',
      connectionId: 'c1',
      displayName: '玩家一',
      matchOptions: { seed: 1 },
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
      roomId: 'room-002',
      connectionId: 'c2',
      displayName: 'P2',
      role: 'player',
      seatPreference: 2,
    });
    expect(preferred.ok && preferred.session.seat).toBe(2);
    expect(
      await rooms.joinRoom({
        roomId: 'room-002',
        connectionId: 'cx',
        displayName: 'PX',
        role: 'player',
        seatPreference: 2,
      }),
    ).toMatchObject({ ok: false, code: 'seat-unavailable' });
    await rooms.joinRoom({
      roomId: 'room-002',
      connectionId: 'c1',
      displayName: 'P1',
      role: 'player',
    });
    await rooms.joinRoom({
      roomId: 'room-002',
      connectionId: 'c3',
      displayName: 'P3',
      role: 'player',
    });
    expect(
      await rooms.joinRoom({
        roomId: 'room-002',
        connectionId: 'c4',
        displayName: 'P4',
        role: 'player',
      }),
    ).toMatchObject({ ok: false, code: 'room-full' });
  });

  it('密码房间校验加盐摘要，正确密码可以加入', async () => {
    const rooms = registry();
    const created = await rooms.createRoom({
      roomId: 'secure-room',
      connectionId: 'owner',
      displayName: '房主',
      password: '1234',
    });
    expect(created.ok && created.lobby.passwordProtected).toBe(true);
    expect(
      await rooms.joinRoom({
        roomId: 'secure-room',
        connectionId: 'bad',
        displayName: '错误',
        role: 'player',
        password: '9999',
      }),
    ).toMatchObject({ ok: false, code: 'wrong-password' });
    expect(
      await rooms.joinRoom({
        roomId: 'secure-room',
        connectionId: 'good',
        displayName: '正确',
        role: 'player',
        password: '1234',
      }),
    ).toMatchObject({ ok: true });
  });

  it('观战者不占座位且收到全公开快照', async () => {
    const rooms = registry({ spectatorLimit: 1 });
    await rooms.createRoom({ roomId: 'watch-room', connectionId: 'owner', displayName: '房主' });
    const watcher = await rooms.joinRoom({
      roomId: 'watch-room',
      connectionId: 'watcher',
      displayName: '观众',
      role: 'spectator',
    });
    expect(watcher.ok).toBe(true);
    if (!watcher.ok) return;
    expect(watcher.session.seat).toBeNull();
    expect(watcher.snapshot.match.game.viewerSeat).toBeNull();
    expect(
      watcher.snapshot.match.game.players.every((player) => player.visibility === 'public'),
    ).toBe(true);
    expect(
      await rooms.joinRoom({
        roomId: 'watch-room',
        connectionId: 'watcher2',
        displayName: '观众二',
        role: 'spectator',
      }),
    ).toMatchObject({ ok: false, code: 'spectator-limit' });
  });

  it('房主离开时转移房主并释放座位', async () => {
    const rooms = registry();
    await rooms.createRoom({ roomId: 'host-room', connectionId: 'owner', displayName: '房主' });
    const second = await rooms.joinRoom({
      roomId: 'host-room',
      connectionId: 'second',
      displayName: '第二位',
      role: 'player',
    });
    expect(second.ok).toBe(true);
    const view = rooms.leaveRoom('owner');
    expect(view?.participants[0]).toMatchObject({ displayName: '第二位', isHost: true });
    const replacement = await rooms.joinRoom({
      roomId: 'host-room',
      connectionId: 'replacement',
      displayName: '补位',
      role: 'player',
      seatPreference: 0,
    });
    expect(replacement.ok && replacement.session.seat).toBe(0);
  });

  it('空房超过保留时间后被回收', async () => {
    let now = 1000;
    const rooms = new RoomRegistry({
      emptyRoomTtlMs: 500,
      now: () => now,
      tokenSource: (() => {
        let token = 0;
        return () => `${++token}`;
      })(),
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
      roomId: 'resume-room',
      connectionId: 'old',
      displayName: '玩家',
    });
    if (!created.ok) throw new Error('创建失败');
    const oldToken = created.session.resumeToken;
    const disconnected = rooms.disconnectRoom('old');
    expect(disconnected?.participants[0]).toMatchObject({
      connected: false,
      trustee: true,
      seat: 0,
    });
    expect(rooms.getConnectionIdentity('old')).toBeNull();
    expect(
      await rooms.joinRoom({
        roomId: 'resume-room',
        connectionId: 'other',
        displayName: '抢座',
        role: 'player',
        seatPreference: 0,
      }),
    ).toMatchObject({ ok: false, code: 'seat-unavailable' });
    expect(
      rooms.resumeRoom({
        roomId: 'resume-room',
        connectionId: 'bad',
        resumeToken: 'wrong',
      }),
    ).toMatchObject({ ok: false, code: 'invalid-resume-token' });

    const resumed = rooms.resumeRoom({
      roomId: 'resume-room',
      connectionId: 'new',
      resumeToken: oldToken,
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.session).toMatchObject({ resumed: true, seat: 0 });
    expect(resumed.session.resumeToken).not.toBe(oldToken);
    expect(resumed.lobby.participants[0]).toMatchObject({ connected: true, trustee: false });
    rooms.disconnectRoom('new');
    expect(
      rooms.resumeRoom({
        roomId: 'resume-room',
        connectionId: 'replay',
        resumeToken: oldToken,
      }),
    ).toMatchObject({ ok: false, code: 'invalid-resume-token' });
  });

  it('断线超过保留期后释放参与者和座位', async () => {
    let now = 0;
    const rooms = new RoomRegistry({
      disconnectedGraceMs: 100,
      now: () => now,
      tokenSource: (() => {
        let token = 0;
        return () => `${++token}`;
      })(),
    });
    const created = await rooms.createRoom({
      roomId: 'grace-room',
      connectionId: 'old',
      displayName: '玩家',
    });
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
      tokenSource: (() => {
        let token = 0;
        return () => `${++token}`;
      })(),
    });
    await rooms.createRoom({
      roomId: 'timeout-room',
      connectionId: 'c0',
      displayName: 'P0',
      matchOptions: { dealerSeat: 0, seed: 10 },
    });
    await rooms.joinRoom({
      roomId: 'timeout-room',
      connectionId: 'c1',
      displayName: 'P1',
      role: 'player',
    });
    await rooms.joinRoom({
      roomId: 'timeout-room',
      connectionId: 'c2',
      displayName: 'P2',
      role: 'player',
    });
    await rooms.joinRoom({
      roomId: 'timeout-room',
      connectionId: 'c3',
      displayName: 'P3',
      role: 'player',
    });
    expect(rooms.startMatch('c0').ok).toBe(true);

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
      roomId: 'trustee-room',
      connectionId: 'c0',
      displayName: 'P0',
      matchOptions: { dealerSeat: 0, seed: 11 },
    });
    for (const seat of [1, 2, 3] as const) {
      await rooms.joinRoom({
        roomId: 'trustee-room',
        connectionId: `c${seat}`,
        displayName: `P${seat}`,
        role: 'player',
        seatPreference: seat,
      });
    }
    expect(rooms.startMatch('c0').ok).toBe(true);
    rooms.setTrustee('c0', true);
    expect(rooms.processTimeouts()[0]).toMatchObject({
      seat: 0,
      reason: 'trustee',
      accepted: true,
    });

    const disconnectedRooms = registry();
    await disconnectedRooms.createRoom({
      roomId: 'disconnect-room',
      connectionId: 'c0',
      displayName: 'P0',
      matchOptions: { dealerSeat: 0, seed: 12 },
    });
    for (const seat of [1, 2, 3] as const) {
      await disconnectedRooms.joinRoom({
        roomId: 'disconnect-room',
        connectionId: `d${seat}`,
        displayName: `P${seat}`,
        role: 'player',
        seatPreference: seat,
      });
    }
    expect(disconnectedRooms.startMatch('c0').ok).toBe(true);
    disconnectedRooms.disconnectRoom('c0');
    expect(disconnectedRooms.processTimeouts()[0]).toMatchObject({
      seat: 0,
      reason: 'disconnected',
      accepted: true,
    });
  }, 10_000);

  it('服务重启后保留房间、修订号、座位和恢复令牌', async () => {
    let token = 0;
    const source = () => `${++token}`;
    const rooms = new RoomRegistry({ tokenSource: source, now: () => 100 });
    const created = await rooms.createRoom({
      roomId: 'persist-room',
      connectionId: 'old',
      displayName: '玩家',
      password: '1234',
      matchOptions: { dealerSeat: 0, seed: 30 },
    });
    if (!created.ok) throw new Error('创建失败');
    const action = rooms.getRoom('persist-room')!.getSnapshot(0).match.game.legalActions[0]!;
    rooms.getRoom('persist-room')!.submitAction({
      requestId: 'before-restart',
      expectedRevision: 0,
      seat: 0,
      action,
    });
    const persistence = JSON.parse(JSON.stringify(rooms.exportState()));
    const restored = RoomRegistry.restore(persistence, { tokenSource: source, now: () => 200 });

    expect(restored.getRoomView('persist-room')).toMatchObject({
      revision: 1,
      passwordProtected: true,
      participants: [expect.objectContaining({ seat: 0, connected: false, trustee: true })],
    });
    const resumed = restored.resumeRoom({
      roomId: 'persist-room',
      connectionId: 'new',
      resumeToken: created.session.resumeToken,
    });
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.snapshot.revision).toBe(1);
    expect(resumed.snapshot.match.game.viewerSeat).toBe(0);
  });
});

describe('房主开局与机器人补位', () => {
  async function seatedRoom(count: 1 | 2 | 3 | 4, options: { now?: () => number } = {}) {
    const rooms = registry(options);
    await rooms.createRoom({
      roomId: 'host-room',
      connectionId: 'c0',
      displayName: '房主',
      matchOptions: { dealerSeat: 0, seed: 21 },
    });
    for (const seat of [1, 2, 3] as const) {
      if (seat >= count) break;
      await rooms.joinRoom({
        roomId: 'host-room',
        connectionId: `c${seat}`,
        displayName: `P${seat}`,
        role: 'player',
        seatPreference: seat,
      });
    }
    return rooms;
  }

  it('新房间处于未开局状态，满员前不能开局，满员后只有房主能开局', async () => {
    const rooms = await seatedRoom(3);
    expect(rooms.getRoomView('host-room')).toMatchObject({
      started: false,
      readyToStart: false,
      playerCount: 3,
    });
    expect(rooms.startMatch('c0')).toMatchObject({ ok: false, code: 'room-not-ready' });
    await rooms.joinRoom({
      roomId: 'host-room',
      connectionId: 'c3',
      displayName: 'P3',
      role: 'player',
    });
    expect(rooms.getRoomView('host-room')).toMatchObject({ started: false, readyToStart: true });
    expect(rooms.startMatch('c1')).toMatchObject({ ok: false, code: 'host-required' });
    expect(rooms.startMatch('stranger')).toMatchObject({ ok: false, code: 'not-joined' });
    const started = rooms.startMatch('c0');
    expect(started).toMatchObject({ ok: true, lobby: { started: true, readyToStart: false } });
    expect(rooms.startMatch('c0')).toMatchObject({ ok: false, code: 'match-already-started' });
  });

  it('未开局时不会超时代打，开局后才从开局时刻计时', async () => {
    let now = 0;
    const rooms = await seatedRoom(4, { now: () => now });
    now = 60_000;
    expect(rooms.processTimeouts()).toEqual([]);
    expect(rooms.startMatch('c0').ok).toBe(true);
    now = 60_000 + 29_000;
    expect(rooms.processTimeouts()).toEqual([]);
    now = 60_000 + 30_000;
    expect(rooms.processTimeouts()[0]).toMatchObject({
      seat: 0,
      reason: 'timeout',
      accepted: true,
    });
  });

  it('房主可以补入和移走机器人，其他人不能', async () => {
    const rooms = await seatedRoom(2);
    expect(rooms.addBot('c1')).toMatchObject({ ok: false, code: 'host-required' });
    const first = rooms.addBot('c0');
    expect(first).toMatchObject({ ok: true, lobby: { playerCount: 3, started: false } });
    if (!first.ok) return;
    const bot = first.lobby.participants.find((participant) => participant.bot);
    expect(bot).toMatchObject({
      role: 'player',
      seat: 2,
      trustee: true,
      connected: true,
      isHost: false,
    });
    expect(bot?.displayName).toBe('机器人甲');
    expect(rooms.addBot('c0')).toMatchObject({
      ok: true,
      lobby: { playerCount: 4, readyToStart: true },
    });
    expect(rooms.addBot('c0')).toMatchObject({ ok: false, code: 'room-full' });
    expect(rooms.removeBot('c1', bot!.participantId)).toMatchObject({
      ok: false,
      code: 'host-required',
    });
    expect(rooms.removeBot('c0', 'nobody')).toMatchObject({
      ok: false,
      code: 'participant-not-found',
    });
    expect(rooms.removeBot('c0', bot!.participantId)).toMatchObject({
      ok: true,
      lobby: { playerCount: 3, readyToStart: false },
    });
    expect(
      rooms
        .getRoomView('host-room')
        ?.participants.some((p) => p.participantId === bot!.participantId),
    ).toBe(false);
  });

  it('机器人在开局后由服务端代打，真人加入时顶替最晚补入的机器人', async () => {
    const rooms = await seatedRoom(1);
    for (let count = 0; count < 3; count += 1) expect(rooms.addBot('c0').ok).toBe(true);
    const human = await rooms.joinRoom({
      roomId: 'host-room',
      connectionId: 'c9',
      displayName: '真人',
      role: 'player',
    });
    expect(human).toMatchObject({ ok: true, session: { seat: 3 }, lobby: { playerCount: 4 } });
    if (!human.ok) return;
    expect(human.lobby.participants.filter((participant) => participant.bot)).toHaveLength(2);
    expect(rooms.startMatch('c0').ok).toBe(true);
    // Seat 0 (the human host) discards first; then the bots act on their own turns.
    expect(rooms.processTimeouts()).toEqual([]);
    const room = rooms.getRoom('host-room')!;
    const discard = room.getSnapshot(0).match.game.legalActions.find((a) => a.type === 'discard')!;
    room.submitAction({
      requestId: 'h1',
      expectedRevision: room.getRevision(),
      seat: 0,
      action: discard,
    });
    const botTurns = rooms.processTimeouts();
    expect(botTurns.length).toBeGreaterThan(0);
    expect(botTurns.every((entry) => entry.reason === 'trustee' && entry.accepted)).toBe(true);
    expect(botTurns.map((entry) => entry.seat)).toContain(1);
  });

  it('开局后不能移走机器人，但房主可以给空座补机器人解除卡局', async () => {
    const rooms = await seatedRoom(4);
    expect(rooms.startMatch('c0').ok).toBe(true);
    rooms.leaveRoom('c3');
    expect(rooms.getRoomView('host-room')?.playerCount).toBe(3);
    const filled = rooms.addBot('c0');
    expect(filled).toMatchObject({ ok: true, lobby: { playerCount: 4, started: true } });
    if (!filled.ok) return;
    const bot = filled.lobby.participants.find((participant) => participant.bot)!;
    expect(bot.seat).toBe(3);
    expect(rooms.removeBot('c0', bot.participantId)).toMatchObject({
      ok: false,
      code: 'match-already-started',
    });
  });

  it('房主离开时房主身份不会落到机器人头上；开局状态与机器人可持久化恢复', async () => {
    let token = 0;
    const source = () => `${++token}`;
    const rooms = new RoomRegistry({ tokenSource: source, now: () => 100 });
    await rooms.createRoom({ roomId: 'persist-bot', connectionId: 'c0', displayName: '房主' });
    expect(rooms.addBot('c0').ok).toBe(true);
    await rooms.joinRoom({
      roomId: 'persist-bot',
      connectionId: 'c1',
      displayName: 'P1',
      role: 'player',
    });
    expect(rooms.addBot('c0').ok).toBe(true);
    expect(rooms.startMatch('c0').ok).toBe(true);
    rooms.leaveRoom('c0');
    const view = rooms.getRoomView('persist-bot')!;
    expect(view.participants.find((participant) => participant.isHost)?.displayName).toBe('P1');

    const restored = RoomRegistry.restore(JSON.parse(JSON.stringify(rooms.exportState())), {
      tokenSource: source,
      now: () => 100 + 10 * 60_000,
    });
    const restoredView = restored.getRoomView('persist-bot')!;
    expect(restoredView.started).toBe(true);
    expect(restoredView.participants.filter((participant) => participant.bot)).toHaveLength(2);
    expect(restored.sweepDisconnectedParticipants()).not.toContain(
      restoredView.participants.find((participant) => participant.bot)!.participantId,
    );
    expect(restored.getRoomView('persist-bot')?.participants.filter((p) => p.bot)).toHaveLength(2);
  });

  it('旧版持久化数据缺少开局与机器人字段时按已开局、非机器人恢复', async () => {
    const rooms = registry();
    await rooms.createRoom({ roomId: 'legacy', connectionId: 'c0', displayName: '房主' });
    const exported = JSON.parse(JSON.stringify(rooms.exportState())) as {
      rooms: Array<Record<string, unknown> & { participants: Array<Record<string, unknown>> }>;
    };
    for (const room of exported.rooms) {
      delete room.started;
      for (const participant of room.participants) delete participant.bot;
    }
    const restored = RoomRegistry.restore(exported as never);
    expect(restored.getRoomView('legacy')).toMatchObject({ started: true, readyToStart: false });
    expect(restored.getRoomView('legacy')?.participants[0]?.bot).toBe(false);
  });
});
