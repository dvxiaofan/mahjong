import { describe, expect, it } from 'vitest';
import { MultiplayerGateway } from './gateway.js';
import { RoomRegistry } from './lobby.js';
import { SecurityGuard } from './security.js';

describe('联网安全守卫', () => {
  it('拒绝超大消息且审计不保存原始消息体', () => {
    const guard = new SecurityGuard({ maxMessageBytes: 16 });
    const secret = 'super-secret-password';
    expect(guard.inspect('c1', secret)).toMatchObject({ allowed: false, code: 'message-too-large' });
    const report = guard.getAuditSummary();
    expect(report.totalViolations).toBe(1);
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it('滑动窗口限制请求频率', () => {
    let now = 0;
    const guard = new SecurityGuard({
      maxRequestsPerWindow: 2,
      requestWindowMs: 100,
      now: () => now,
    });
    expect(guard.inspect('c1', '{}').allowed).toBe(true);
    expect(guard.inspect('c1', '{}').allowed).toBe(true);
    expect(guard.inspect('c1', '{}')).toMatchObject({ allowed: false, code: 'rate-limited' });
    now = 101;
    expect(guard.inspect('c1', '{}').allowed).toBe(true);
  });

  it('重复违规触发临时封禁，过期后恢复', () => {
    let now = 10;
    const guard = new SecurityGuard({ violationThreshold: 2, banMs: 100, now: () => now });
    guard.recordViolation('attacker', 'invalid-action', 'illegal-action');
    guard.recordViolation('attacker', 'invalid-action', 'illegal-action');
    expect(guard.inspect('attacker', '{}')).toMatchObject({ allowed: false, code: 'temporarily-banned' });
    expect(guard.getAuditSummary().bannedConnections).toHaveLength(1);
    now = 111;
    expect(guard.inspect('attacker', '{}').allowed).toBe(true);
  });

  it('网关累计错误密码但不在安全报告中泄露密码或令牌', async () => {
    let token = 0;
    const guard = new SecurityGuard({ violationThreshold: 2, banMs: 1000 });
    const gateway = new MultiplayerGateway(
      new RoomRegistry({ tokenSource: () => `${++token}` }),
      guard,
    );
    await gateway.handle('owner', {
      protocolVersion: 1, requestId: 'create', type: 'create-room',
      roomId: 'secure-gateway', displayName: '房主', password: 'correct-secret',
    });
    for (const requestId of ['bad-1', 'bad-2']) {
      await gateway.handle('attacker', {
        protocolVersion: 1, requestId, type: 'join-room',
        roomId: 'secure-gateway', displayName: '攻击者', password: 'wrong-secret',
      });
    }
    expect(await gateway.handle('attacker', {
      protocolVersion: 1, requestId: 'hello', type: 'hello',
    })).toEqual([expect.objectContaining({ type: 'error', code: 'temporarily-banned' })]);
    const report = JSON.stringify(guard.getAuditSummary());
    expect(report).not.toContain('correct-secret');
    expect(report).not.toContain('wrong-secret');
    expect(report).not.toContain('resume_');
  });

  it('重复非法动作进入违规计数', async () => {
    let token = 0;
    const guard = new SecurityGuard({ violationThreshold: 3 });
    const gateway = new MultiplayerGateway(
      new RoomRegistry({ tokenSource: () => `${++token}` }),
      guard,
    );
    await gateway.registry.createRoom({
      roomId: 'action-security', connectionId: 'player', displayName: '玩家',
      matchOptions: { dealerSeat: 0, seed: 1 },
    });
    for (const seat of [1, 2, 3] as const) {
      await gateway.registry.joinRoom({
        roomId: 'action-security', connectionId: `player-${seat}`,
        displayName: `玩家${seat}`, role: 'player', seatPreference: seat,
      });
    }
    for (let index = 0; index < 3; index += 1) {
      await gateway.handle('player', {
        protocolVersion: 1,
        requestId: `illegal-${index}`,
        type: 'submit-action',
        expectedRevision: 0,
        action: { type: 'pass' },
      });
    }
    expect(guard.getAuditSummary().entries.filter((entry) => entry.kind === 'invalid-action')).toHaveLength(3);
    expect(await gateway.handle('player', {
      protocolVersion: 1, requestId: 'after-ban', type: 'get-snapshot',
    })).toEqual([expect.objectContaining({ type: 'error', code: 'temporarily-banned' })]);
  });
});
