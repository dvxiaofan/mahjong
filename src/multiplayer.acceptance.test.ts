import { describe, expect, it } from 'vitest';
import { MultiplayerGateway } from './gateway.js';
import { RoomRegistry } from './lobby.js';
import { SecurityGuard } from './security.js';
import type { ClientActionIntent, ServerMessage } from './protocol.js';
import type { GameAction, Seat } from './types.js';

const envelope = { protocolVersion: 1 as const };

function actionIntent(action: GameAction): ClientActionIntent {
  return 'tile' in action
    ? { type: action.type, tile: action.tile } as ClientActionIntent
    : { type: action.type } as ClientActionIntent;
}

function joinedMessage(messages: readonly ServerMessage[]) {
  const joined = messages.find((message) => message.type === 'room-joined');
  if (joined?.type !== 'room-joined') throw new Error('连接未成功加入房间');
  return joined;
}

describe('M4 联网端到端验收', () => {
  it('四个独立连接完成一局、并发响应、重连、观战和下一局', async () => {
    let token = 0;
    const registry = new RoomRegistry({ tokenSource: () => `${++token}` });
    const gateway = new MultiplayerGateway(
      registry,
      new SecurityGuard({ maxRequestsPerWindow: 100_000, violationThreshold: 100 }),
    );
    const creator = await registry.createRoom({
      roomId: 'acceptance-room',
      connectionId: 'seat-0',
      displayName: 'P0',
      matchOptions: { dealerSeat: 0, seed: 20260905, maxRounds: 2 },
    });
    if (!creator.ok) throw new Error('验收房间创建失败');

    const connections: Record<Seat, string> = { 0: 'seat-0', 1: 'seat-1', 2: 'seat-2', 3: 'seat-3' };
    const resumeTokens: Partial<Record<Seat, string>> = { 0: creator.session.resumeToken };
    for (const seat of [1, 2, 3] as const) {
      const joined = joinedMessage(await gateway.handle(connections[seat], {
        ...envelope,
        requestId: `join-${seat}`,
        type: 'join-room',
        roomId: 'acceptance-room',
        displayName: `P${seat}`,
        role: 'player',
        seatPreference: seat,
      }));
      resumeTokens[seat] = joined.session.resumeToken;
    }
    joinedMessage(await gateway.handle('spectator', {
      ...envelope,
      requestId: 'join-spectator',
      type: 'join-room',
      roomId: 'acceptance-room',
      displayName: 'Watcher',
      role: 'spectator',
    }));

    let request = 0;
    let actions = 0;
    let concurrentResponseExercised = false;
    let reconnectExercised = false;

    while (actions < 2000) {
      const room = registry.getRoom('acceptance-room')!;
      const publicMatch = room.getSpectatorSnapshot().match;
      if (publicMatch.phase !== 'playing') break;

      const snapshots = await Promise.all(([0, 1, 2, 3] as const).map(async (seat) => {
        const messages = await gateway.handle(connections[seat], {
          ...envelope,
          requestId: `snapshot-${request++}`,
          type: 'get-snapshot',
        });
        const snapshotMessage = messages[0];
        if (snapshotMessage?.type !== 'snapshot') throw new Error('玩家快照获取失败');
        const game = snapshotMessage.snapshot.match.game;
        expect(game.players.filter((player) => player.visibility === 'self')).toHaveLength(1);
        expect(game.players[seat]!.visibility).toBe('self');
        expect(game.players.every((player) => player.seat === seat || !('concealedTiles' in player))).toBe(true);
        return { seat, snapshot: snapshotMessage.snapshot };
      }));

      if (actions % 20 === 0) {
        const spectatorMessages = await gateway.handle('spectator', {
          ...envelope,
          requestId: `spectator-${request++}`,
          type: 'get-snapshot',
        });
        const spectatorSnapshot = spectatorMessages[0];
        if (spectatorSnapshot?.type !== 'snapshot') throw new Error('观战快照获取失败');
        expect(spectatorSnapshot.snapshot.match.game.viewerSeat).toBeNull();
        expect(spectatorSnapshot.snapshot.match.game.players.every((player) => player.visibility === 'public')).toBe(true);
      }

      const actionable = snapshots.filter(({ snapshot }) => snapshot.match.game.legalActions.length > 0);
      if (actionable.length === 0) throw new Error('进行中牌局没有任何连接可行动');

      if (!concurrentResponseExercised && publicMatch.game.phase === 'claiming' && actionable.length >= 2) {
        const revision = room.getRevision();
        const simultaneous = await Promise.all(actionable.slice(0, 2).map(({ seat, snapshot }, index) =>
          gateway.handle(connections[seat], {
            ...envelope,
            requestId: `concurrent-${index}`,
            type: 'submit-action',
            expectedRevision: revision,
            action: actionIntent(snapshot.match.game.legalActions[0]!),
          }),
        ));
        const results = simultaneous.map((messages) => messages[0])
          .filter((message): message is Extract<ServerMessage, { type: 'action-result' }> => message?.type === 'action-result');
        expect(results.filter((message) => message.result.accepted)).toHaveLength(1);
        expect(results.filter((message) => !message.result.accepted && message.result.code === 'stale-revision')).toHaveLength(1);
        concurrentResponseExercised = true;
        actions += 1;
        continue;
      }

      const actor = actionable[0]!;
      const action = actor.snapshot.match.game.legalActions[0]!;
      const messages = await gateway.handle(connections[actor.seat], {
        ...envelope,
        requestId: `action-${request++}`,
        type: 'submit-action',
        expectedRevision: actor.snapshot.revision,
        action: actionIntent(action),
      });
      expect(messages[0]).toMatchObject({ type: 'action-result', result: { accepted: true } });
      actions += 1;

      if (!reconnectExercised && actions >= 10) {
        const oldConnection = connections[2];
        const oldToken = resumeTokens[2]!;
        gateway.disconnect(oldConnection);
        connections[2] = 'seat-2-reconnected';
        const resumed = joinedMessage(await gateway.handle(connections[2], {
          ...envelope,
          requestId: 'resume-seat-2',
          type: 'join-room',
          roomId: 'acceptance-room',
          displayName: 'P2',
          resumeToken: oldToken,
        }));
        expect(resumed.session).toMatchObject({ resumed: true, seat: 2 });
        resumeTokens[2] = resumed.session.resumeToken;
        reconnectExercised = true;
      }
    }

    const room = registry.getRoom('acceptance-room')!;
    expect(actions).toBeLessThan(2000);
    expect(room.getSpectatorSnapshot().match.phase).toBe('between-rounds');
    expect(concurrentResponseExercised).toBe(true);
    expect(reconnectExercised).toBe(true);

    const nextRound = await gateway.handle(connections[0], {
      ...envelope,
      requestId: 'next-round',
      type: 'start-next-round',
      expectedRevision: room.getRevision(),
    });
    expect(nextRound[0]).toMatchObject({
      type: 'action-result',
      result: { accepted: true, snapshot: { match: { roundNumber: 2, phase: 'playing' } } },
    });
  }, 30_000);
});
