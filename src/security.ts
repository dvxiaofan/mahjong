export type SecurityRejectCode = 'message-too-large' | 'rate-limited' | 'temporarily-banned';

export type SecurityViolationKind =
  | 'invalid-message'
  | 'authentication-failure'
  | 'invalid-action'
  | 'identity-conflict'
  | 'rate-limit';

export interface SecurityGuardOptions {
  maxMessageBytes?: number;
  requestWindowMs?: number;
  maxRequestsPerWindow?: number;
  violationThreshold?: number;
  banMs?: number;
  now?: () => number;
}

export type SecurityCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      code: SecurityRejectCode;
      message: string;
      retryAfterMs: number;
    };

export interface SecurityAuditEntry {
  connectionId: string;
  timestamp: number;
  kind: SecurityViolationKind;
  detail: string;
  violationCount: number;
  bannedUntil: number | null;
}

export interface SecurityAuditSummary {
  totalViolations: number;
  entries: readonly SecurityAuditEntry[];
  bannedConnections: readonly { connectionId: string; bannedUntil: number }[];
}

interface ConnectionSecurityState {
  requestTimes: number[];
  violationCount: number;
  bannedUntil: number;
}

function payloadBytes(payload: string | unknown): number {
  try {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new TextEncoder().encode(serialized).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export class SecurityGuard {
  private readonly maxMessageBytes: number;
  private readonly requestWindowMs: number;
  private readonly maxRequestsPerWindow: number;
  private readonly violationThreshold: number;
  private readonly banMs: number;
  private readonly now: () => number;
  private readonly states = new Map<string, ConnectionSecurityState>();
  private readonly audit: SecurityAuditEntry[] = [];

  constructor(options: SecurityGuardOptions = {}) {
    this.maxMessageBytes = options.maxMessageBytes ?? 16 * 1024;
    this.requestWindowMs = options.requestWindowMs ?? 10_000;
    this.maxRequestsPerWindow = options.maxRequestsPerWindow ?? 60;
    this.violationThreshold = options.violationThreshold ?? 5;
    this.banMs = options.banMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  private state(connectionId: string): ConnectionSecurityState {
    const existing = this.states.get(connectionId);
    if (existing !== undefined) return existing;
    const created: ConnectionSecurityState = {
      requestTimes: [],
      violationCount: 0,
      bannedUntil: 0,
    };
    this.states.set(connectionId, created);
    return created;
  }

  inspect(connectionId: string, payload: string | unknown, now = this.now()): SecurityCheckResult {
    const state = this.state(connectionId);
    if (state.bannedUntil > now) {
      return {
        allowed: false,
        code: 'temporarily-banned',
        message: '连接因重复违规被临时限制',
        retryAfterMs: state.bannedUntil - now,
      };
    }
    if (state.bannedUntil !== 0 && state.bannedUntil <= now) {
      state.bannedUntil = 0;
      state.violationCount = 0;
    }

    if (payloadBytes(payload) > this.maxMessageBytes) {
      this.recordViolation(connectionId, 'invalid-message', 'message-size-exceeded', now);
      return {
        allowed: false,
        code: 'message-too-large',
        message: '消息体超过允许大小',
        retryAfterMs: 0,
      };
    }

    state.requestTimes = state.requestTimes.filter(
      (timestamp) => now - timestamp < this.requestWindowMs,
    );
    if (state.requestTimes.length >= this.maxRequestsPerWindow) {
      this.recordViolation(connectionId, 'rate-limit', 'request-window-exceeded', now);
      return {
        allowed: false,
        code: 'rate-limited',
        message: '请求频率过高',
        retryAfterMs: Math.max(1, this.requestWindowMs - (now - state.requestTimes[0]!)),
      };
    }
    state.requestTimes.push(now);
    return { allowed: true };
  }

  recordViolation(
    connectionId: string,
    kind: SecurityViolationKind,
    detail: string,
    now = this.now(),
  ): void {
    const state = this.state(connectionId);
    state.violationCount += 1;
    if (state.violationCount >= this.violationThreshold) {
      state.bannedUntil = now + this.banMs;
    }
    this.audit.push({
      connectionId,
      timestamp: now,
      kind,
      detail: detail.slice(0, 120),
      violationCount: state.violationCount,
      bannedUntil: state.bannedUntil > now ? state.bannedUntil : null,
    });
  }

  getAuditSummary(now = this.now()): SecurityAuditSummary {
    return {
      totalViolations: this.audit.length,
      entries: this.audit.map((entry) => ({ ...entry })),
      bannedConnections: [...this.states.entries()]
        .filter(([, state]) => state.bannedUntil > now)
        .map(([connectionId, state]) => ({ connectionId, bannedUntil: state.bannedUntil })),
    };
  }
}
