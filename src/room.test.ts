import { describe, expect, it } from 'vitest';
import { AuthoritativeRoom } from './room.js';

function createRoom() {
  return new AuthoritativeRoom({ roomId: 'room-test', seed: 20260905, dealerSeat: 0 });
}

describe('服务端权威房间', () => {
  it('玩家和观战快照公开同一份首局定庄骰子结果', () => {
    const room = new AuthoritativeRoom({ roomId: 'dice-room', seed: 31 });
    const playerSelection = room.getSnapshot(0).match.dealerSelection;
    const spectatorSelection = room.getSpectatorSnapshot().match.dealerSelection;

    expect(playerSelection?.dealerSeat).toBe(room.getSnapshot(0).match.dealerSeat);
    expect(playerSelection?.rounds[0]?.candidates).toEqual([0, 1, 2, 3]);
    expect(spectatorSelection).toEqual(playerSelection);
  });

  it('每个座位只收到自己的暗手和合法动作', () => {
    const room = createRoom();
    for (const seat of [0, 1, 2, 3] as const) {
      const snapshot = room.getSnapshot(seat);
      expect(snapshot.match.game.players[seat]!.visibility).toBe('self');
      for (const player of snapshot.match.game.players) {
        if (player.seat !== seat) expect('concealedTiles' in player).toBe(false);
      }
      expect('wall' in snapshot.match.game).toBe(false);
      expect(snapshot.match.game.legalActions.every((action) => action.seat === seat)).toBe(true);
    }
  });

  it('合法动作由服务端验证并递增修订号', () => {
    const room = createRoom();
    const action = room.getSnapshot(0).match.game.legalActions[0]!;
    const result = room.submitAction({
      requestId: 'request-1',
      expectedRevision: 0,
      seat: 0,
      action,
    });
    expect(result.accepted).toBe(true);
    expect(result.revision).toBe(1);
    expect(room.getRevision()).toBe(1);
    expect(room.getAuditLog()).toContainEqual(
      expect.objectContaining({
        requestId: 'request-1',
        accepted: true,
        revisionBefore: 0,
        revisionAfter: 1,
      }),
    );
  });

  it('相同请求可幂等重试且返回副本', () => {
    const room = createRoom();
    const command = {
      requestId: 'same-request',
      expectedRevision: 0,
      seat: 0 as const,
      action: room.getSnapshot(0).match.game.legalActions[0]!,
    };
    const first = room.submitAction(command);
    (first.snapshot.match.cumulativeScores as number[])[0] = 999;
    const repeated = room.submitAction(command);
    expect(repeated.accepted).toBe(true);
    expect(repeated.revision).toBe(1);
    expect(repeated.snapshot.match.cumulativeScores[0]).toBe(0);
    expect(room.getRevision()).toBe(1);
  });

  it('拒绝过期修订号、座位冒用和非法动作', () => {
    const staleRoom = createRoom();
    expect(
      staleRoom.submitAction({
        requestId: 'stale',
        expectedRevision: 1,
        seat: 0,
        action: staleRoom.getSnapshot(0).match.game.legalActions[0]!,
      }),
    ).toMatchObject({ accepted: false, code: 'stale-revision' });

    const mismatchRoom = createRoom();
    expect(
      mismatchRoom.submitAction({
        requestId: 'mismatch',
        expectedRevision: 0,
        seat: 1,
        action: mismatchRoom.getSnapshot(0).match.game.legalActions[0]!,
      }),
    ).toMatchObject({ accepted: false, code: 'seat-mismatch' });

    const illegalRoom = createRoom();
    expect(
      illegalRoom.submitAction({
        requestId: 'illegal',
        expectedRevision: 0,
        seat: 0,
        action: { type: 'pass', seat: 0 },
      }),
    ).toMatchObject({ accepted: false, code: 'illegal-action' });
  });

  it('相同请求 ID 携带不同命令会被识别为冲突', () => {
    const room = createRoom();
    const action = room.getSnapshot(0).match.game.legalActions[0]!;
    room.submitAction({ requestId: 'conflict', expectedRevision: 0, seat: 0, action });
    const conflict = room.submitAction({
      requestId: 'conflict',
      expectedRevision: 1,
      seat: 0,
      action: { type: 'pass', seat: 0 },
    });
    expect(conflict).toMatchObject({ accepted: false, code: 'request-id-conflict' });
  });

  it('服务端快照恢复修订号、状态、幂等缓存和审计', () => {
    const original = createRoom();
    const action = original.getSnapshot(0).match.game.legalActions[0]!;
    const command = {
      requestId: 'persisted-action',
      expectedRevision: 0,
      seat: 0 as const,
      action,
    };
    const accepted = original.submitAction(command);
    const restored = AuthoritativeRoom.restore(original.exportState());

    expect(restored.getRevision()).toBe(1);
    expect(restored.getSnapshot(0)).toEqual(original.getSnapshot(0));
    expect(restored.getAuditLog()).toEqual(original.getAuditLog());
    expect(restored.submitAction(command)).toEqual(accepted);
    expect(restored.getRevision()).toBe(1);
  });
});
