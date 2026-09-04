import { describe, expect, it } from 'vitest';
import { AuthoritativeRoom } from './room.js';
import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  handleRoomProtocolMessage,
  parseClientMessage,
  type ClientActionIntent,
  type ServerMessage,
} from './protocol.js';
import type { GameAction } from './types.js';

function room() {
  return new AuthoritativeRoom({ roomId: 'protocol-room', seed: 10, dealerSeat: 0 });
}

function intentFromAction(action: GameAction): ClientActionIntent {
  if ('tile' in action) return { type: action.type, tile: action.tile } as ClientActionIntent;
  return { type: action.type } as ClientActionIntent;
}

describe('联网消息协议', () => {
  it('解析版本化动作意图且客户端无需提交座位', () => {
    const parsed = parseClientMessage(
      JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'action-1',
        type: 'submit-action',
        expectedRevision: 0,
        action: { type: 'discard', tile: 'm1', seat: 3 },
      }),
    );
    expect(parsed).toEqual({
      success: true,
      message: {
        protocolVersion: PROTOCOL_VERSION,
        requestId: 'action-1',
        type: 'submit-action',
        expectedRevision: 0,
        action: { type: 'discard', tile: 'm1' },
      },
    });
  });

  it('拒绝损坏 JSON、未知版本和非法动作', () => {
    expect(parseClientMessage('{broken')).toMatchObject({ success: false, code: 'invalid-json' });
    expect(
      parseClientMessage({
        protocolVersion: 99,
        requestId: 'v',
        type: 'hello',
      }),
    ).toMatchObject({ success: false, code: 'unsupported-version' });
    expect(
      parseClientMessage({
        protocolVersion: 1,
        requestId: 'bad',
        type: 'submit-action',
        expectedRevision: 0,
        action: { type: 'discard', tile: 'fortune' },
      }),
    ).toMatchObject({ success: false, code: 'invalid-message' });
  });

  it('四个连接获得各自不同的隐私快照', () => {
    const target = room();
    for (const seat of [0, 1, 2, 3] as const) {
      const messages = handleRoomProtocolMessage(
        target,
        { connectionId: `c${seat}`, seat },
        {
          protocolVersion: 1,
          requestId: `snapshot-${seat}`,
          type: 'get-snapshot',
        },
      );
      const snapshot = messages[0];
      expect(snapshot?.type).toBe('snapshot');
      if (snapshot?.type !== 'snapshot') throw new Error('缺少快照消息');
      expect(snapshot.snapshot.match.game.players[seat]!.visibility).toBe('self');
      expect(
        snapshot.snapshot.match.game.players.filter((player) => player.visibility === 'self'),
      ).toHaveLength(1);
    }
  });

  it('连接上下文注入座位并返回动作结果和事件批次', () => {
    const target = room();
    const action = target.getSnapshot(0).match.game.legalActions[0]!;
    const messages = handleRoomProtocolMessage(
      target,
      { connectionId: 'dealer', seat: 0 },
      {
        protocolVersion: 1,
        requestId: 'submit-1',
        type: 'submit-action',
        expectedRevision: 0,
        action: intentFromAction(action),
      },
    );
    expect(messages.map((message) => message.type)).toEqual(['action-result', 'event-batch']);
    expect(messages[0]).toMatchObject({
      type: 'action-result',
      result: { accepted: true, revision: 1 },
    });
    expect(messages[1]).toMatchObject({ type: 'event-batch', revision: 1 });
  });

  it('未入座、加入流程和过期动作返回结构化错误', () => {
    const target = room();
    expect(
      handleRoomProtocolMessage(
        target,
        { connectionId: 'anon', seat: null },
        {
          protocolVersion: 1,
          requestId: 'snapshot',
          type: 'get-snapshot',
        },
      )[0],
    ).toMatchObject({ type: 'error', code: 'not-joined' });
    expect(
      handleRoomProtocolMessage(
        target,
        { connectionId: 'anon', seat: null },
        {
          protocolVersion: 1,
          requestId: 'join',
          type: 'join-room',
          roomId: 'protocol-room',
          displayName: '玩家',
        },
      )[0],
    ).toMatchObject({ type: 'error', code: 'room-lifecycle-required' });

    const action = target.getSnapshot(0).match.game.legalActions[0]!;
    const messages = handleRoomProtocolMessage(
      target,
      { connectionId: 'dealer', seat: 0 },
      {
        protocolVersion: 1,
        requestId: 'stale',
        type: 'submit-action',
        expectedRevision: 3,
        action: intentFromAction(action),
      },
    );
    expect(messages[0]).toMatchObject({
      type: 'action-result',
      result: { accepted: false, code: 'stale-revision' },
    });
  });

  it('服务端消息可编码为 JSON', () => {
    const message: ServerMessage = {
      protocolVersion: PROTOCOL_VERSION,
      requestId: 'ping-1',
      type: 'pong',
      nonce: 'n',
    };
    expect(JSON.parse(encodeServerMessage(message))).toEqual(message);
  });

  it('下一局消息在错误阶段返回权威房间拒绝', () => {
    const messages = handleRoomProtocolMessage(
      room(),
      { connectionId: 'dealer', seat: 0 },
      {
        protocolVersion: 1,
        requestId: 'next-round',
        type: 'start-next-round',
        expectedRevision: 0,
      },
    );
    expect(messages[0]).toMatchObject({
      type: 'action-result',
      result: { accepted: false, code: 'round-not-ready' },
    });
  });
});
