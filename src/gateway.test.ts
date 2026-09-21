import { describe, expect, it } from 'vitest';
import { MultiplayerGateway } from './gateway.js';
import { RoomRegistry } from './lobby.js';

function gateway() {
  let token = 0;
  return new MultiplayerGateway(new RoomRegistry({ tokenSource: () => `${++token}` }));
}

async function fillPlayerSeats(
  target: MultiplayerGateway,
  roomId: string,
  prefix: string,
  hostConnectionId = 'player',
) {
  for (const seat of [1, 2, 3] as const) {
    await target.registry.joinRoom({
      roomId,
      connectionId: `${prefix}-${seat}`,
      displayName: `P${seat}`,
      role: 'player',
      seatPreference: seat,
    });
  }
  const started = target.registry.startMatch(hostConnectionId);
  if (!started.ok) throw new Error(`开局失败：${started.code}`);
}

const base = { protocolVersion: 1 as const };

describe('多人连接网关', () => {
  it('创建、列出、加入和离开房间', async () => {
    const target = gateway();
    const created = await target.handle('c0', {
      ...base,
      requestId: 'create',
      type: 'create-room',
      roomId: 'gateway-room',
      displayName: '房主',
      maxRounds: 4,
    });
    expect(created[0]).toMatchObject({
      type: 'room-joined',
      session: { seat: 0, isHost: true },
      lobby: { playerCount: 1 },
    });

    const listed = await target.handle('anon', { ...base, requestId: 'list', type: 'list-rooms' });
    expect(listed[0]).toMatchObject({ type: 'room-list', rooms: [{ roomId: 'gateway-room' }] });

    const joined = await target.handle('c1', {
      ...base,
      requestId: 'join',
      type: 'join-room',
      roomId: 'gateway-room',
      displayName: '玩家二',
    });
    expect(joined[0]).toMatchObject({ type: 'room-joined', session: { seat: 1 } });

    expect(await target.handle('c1', { ...base, requestId: 'leave', type: 'leave-room' })).toEqual([
      { protocolVersion: 1, requestId: 'leave', type: 'room-left', roomId: 'gateway-room' },
    ]);
  });

  it('玩家动作座位来自连接身份，观战者只能读取公开快照', async () => {
    const target = gateway();
    const directCreated = await target.registry.createRoom({
      roomId: 'play-room',
      connectionId: 'player',
      displayName: '玩家',
      matchOptions: { dealerSeat: 0, seed: 10 },
    });
    if (!directCreated.ok) throw new Error('创建房间失败');
    await fillPlayerSeats(target, 'play-room', 'play');
    const action = directCreated.snapshot.match.game.legalActions[0]!;
    const intent =
      'tile' in action ? { type: action.type, tile: action.tile } : { type: action.type };
    const result = await target.handle('player', {
      ...base,
      requestId: 'action',
      type: 'submit-action',
      expectedRevision: 0,
      action: { ...intent, seat: 3 },
    });
    expect(result[0]).toMatchObject({ type: 'action-result', result: { accepted: true } });

    const watcher = await target.handle('watcher', {
      ...base,
      requestId: 'watch',
      type: 'join-room',
      roomId: 'play-room',
      displayName: '观众',
      role: 'spectator',
    });
    expect(watcher[0]).toMatchObject({
      type: 'room-joined',
      session: { seat: null, role: 'spectator' },
    });
    const snapshot = await target.handle('watcher', {
      ...base,
      requestId: 'snap',
      type: 'get-snapshot',
    });
    expect(snapshot[0]?.type).toBe('snapshot');
    if (snapshot[0]?.type !== 'snapshot') return;
    expect(snapshot[0].snapshot.match.game.viewerSeat).toBeNull();
    expect(
      snapshot[0].snapshot.match.game.players.every((player) => player.visibility === 'public'),
    ).toBe(true);
    expect(
      await target.handle('watcher', {
        ...base,
        requestId: 'bad-action',
        type: 'submit-action',
        expectedRevision: 1,
        action: { type: 'pass' },
      }),
    ).toEqual([expect.objectContaining({ type: 'error', code: 'spectator-read-only' })]);
  });

  it('密码错误和未加入连接返回结构化错误', async () => {
    const target = gateway();
    await target.handle('owner', {
      ...base,
      requestId: 'create',
      type: 'create-room',
      roomId: 'locked-room',
      displayName: '房主',
      password: '1234',
    });
    expect(
      await target.handle('bad', {
        ...base,
        requestId: 'join',
        type: 'join-room',
        roomId: 'locked-room',
        displayName: '访客',
        password: '9999',
      }),
    ).toEqual([expect.objectContaining({ type: 'error', code: 'wrong-password' })]);
    expect(
      await target.handle('anon', {
        ...base,
        requestId: 'snapshot',
        type: 'get-snapshot',
      }),
    ).toEqual([expect.objectContaining({ type: 'error', code: 'not-joined' })]);
  });

  it('断线后可用一次性恢复令牌绑定新连接', async () => {
    const target = gateway();
    const created = await target.handle('old', {
      ...base,
      requestId: 'create',
      type: 'create-room',
      roomId: 'resume-gateway',
      displayName: '玩家',
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
      roomId: 'trustee-gateway',
      connectionId: 'player',
      displayName: '玩家',
      matchOptions: { dealerSeat: 0, seed: 20 },
    });
    await fillPlayerSeats(target, 'trustee-gateway', 'trustee');
    const updated = await target.handle('player', {
      ...base,
      requestId: 'trustee',
      type: 'set-trustee',
      enabled: true,
    });
    expect(updated[0]).toMatchObject({ type: 'trustee-updated', enabled: true });
    expect(target.tick()[0]).toMatchObject({ seat: 0, reason: 'trustee', accepted: true });
  }, 10_000);

  it('房主通过协议补机器人、开局；未开局前动作被拒绝', async () => {
    const target = gateway();
    await target.handle('host', {
      ...base,
      requestId: 'create',
      type: 'create-room',
      roomId: 'bot-room',
      displayName: '房主',
    });
    await target.handle('guest', {
      ...base,
      requestId: 'join',
      type: 'join-room',
      roomId: 'bot-room',
      displayName: '客人',
    });
    expect(await target.handle('guest', { ...base, requestId: 'g-bot', type: 'add-bot' })).toEqual([
      expect.objectContaining({ type: 'error', code: 'host-required' }),
    ]);
    expect(
      await target.handle('host', { ...base, requestId: 'early', type: 'start-match' }),
    ).toEqual([expect.objectContaining({ type: 'error', code: 'room-not-ready' })]);

    const first = await target.handle('host', { ...base, requestId: 'bot-1', type: 'add-bot' });
    expect(first[0]).toMatchObject({
      type: 'lobby-updated',
      lobby: { playerCount: 3, readyToStart: false },
    });
    if (first[0]?.type !== 'lobby-updated') return;
    const bot = first[0].lobby.participants.find((participant) => participant.bot)!;
    expect(
      await target.handle('host', {
        ...base,
        requestId: 'bot-x',
        type: 'remove-bot',
        participantId: bot.participantId,
      }),
    ).toMatchObject([{ type: 'lobby-updated', lobby: { playerCount: 2 } }]);
    await target.handle('host', { ...base, requestId: 'bot-2', type: 'add-bot' });
    const full = await target.handle('host', { ...base, requestId: 'bot-3', type: 'add-bot' });
    expect(full[0]).toMatchObject({ type: 'lobby-updated', lobby: { readyToStart: true } });

    expect(
      await target.handle('host', {
        ...base,
        requestId: 'too-early',
        type: 'submit-action',
        expectedRevision: 0,
        action: { type: 'pass' },
      }),
    ).toEqual([expect.objectContaining({ type: 'error', code: 'room-not-ready' })]);
    expect(target.tick()).toEqual([]);

    const started = await target.handle('host', { ...base, requestId: 'go', type: 'start-match' });
    expect(started[0]).toMatchObject({ type: 'lobby-updated', lobby: { started: true } });
    expect(
      await target.handle('host', { ...base, requestId: 'again', type: 'start-match' }),
    ).toEqual([expect.objectContaining({ type: 'error', code: 'match-already-started' })]);
    expect(
      await target.handle('anon', { ...base, requestId: 'anon-go', type: 'start-match' }),
    ).toEqual([expect.objectContaining({ type: 'error', code: 'not-joined' })]);
  });
});
