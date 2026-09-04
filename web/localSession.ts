import { applyAction, createGame, getLegalActions } from '../src/game.ts';
import { isNormalTile } from '../src/rules.ts';
import type { AiDecisionCandidate } from '../src/ai.ts';
import { SEATS, type GameAction, type GameState, type Seat } from '../src/types.ts';

export const LOCAL_SESSION_STORAGE_KEY = 'play-mahjong.local-session.v1';
export const LOCAL_SESSION_VERSION = 1 as const;

export type ActionSource = 'human' | 'bot' | 'auto-pass';

export interface RecordedAction {
  action: GameAction;
  source: ActionSource;
  reason?: string;
  candidates?: AiDecisionCandidate[];
}

export interface RecordedActionMetadata {
  reason?: string;
  candidates?: readonly AiDecisionCandidate[];
}

export interface LocalGameSession {
  seed: number;
  state: GameState;
  records: RecordedAction[];
}

export interface SessionLoadResult {
  session: LocalGameSession;
  restored: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredSession {
  version: typeof LOCAL_SESSION_VERSION;
  seed: number;
  records: RecordedAction[];
}

function sameAction(left: GameAction, right: GameAction): boolean {
  if (left.type !== right.type || left.seat !== right.seat) return false;
  if ('tile' in left || 'tile' in right) {
    return 'tile' in left && 'tile' in right && left.tile === right.tile;
  }
  return true;
}

function isSeat(value: unknown): value is Seat {
  return typeof value === 'number' && SEATS.includes(value as Seat);
}

function isGameAction(value: unknown): value is GameAction {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (!isSeat(candidate.seat) || typeof candidate.type !== 'string') return false;

  const tileActions = ['discard', 'concealed-kong', 'supplement-kong'] as const;
  if ((tileActions as readonly string[]).includes(candidate.type)) {
    return typeof candidate.tile === 'string' && isNormalTile(candidate.tile);
  }

  return ['draw', 'win', 'pass', 'pong', 'exposed-kong', 'declare-mouth'].includes(candidate.type);
}

function isRecordedAction(value: unknown): value is RecordedAction {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const sourceValid =
    candidate.source === 'human' || candidate.source === 'bot' || candidate.source === 'auto-pass';
  const reasonValid = candidate.reason === undefined || typeof candidate.reason === 'string';
  const candidatesValid =
    candidate.candidates === undefined ||
    (Array.isArray(candidate.candidates) &&
      candidate.candidates.every((item) => {
        if (item === null || typeof item !== 'object') return false;
        const decision = item as Record<string, unknown>;
        return (
          isGameAction(decision.action) &&
          typeof decision.score === 'number' &&
          Array.isArray(decision.reasons) &&
          decision.reasons.every((reason) => typeof reason === 'string')
        );
      }));
  return sourceValid && reasonValid && candidatesValid && isGameAction(candidate.action);
}

function parseStoredSession(value: string, expectedSeed: number): StoredSession | null {
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== 'object') return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== LOCAL_SESSION_VERSION || candidate.seed !== expectedSeed) return null;
  if (!Array.isArray(candidate.records) || !candidate.records.every(isRecordedAction)) return null;
  return {
    version: LOCAL_SESSION_VERSION,
    seed: expectedSeed,
    records: candidate.records,
  };
}

export function createLocalGameSession(seed: number): LocalGameSession {
  return {
    seed,
    state: createGame({ seed }),
    records: [],
  };
}

export function replayRecordedActions(
  seed: number,
  records: readonly RecordedAction[],
  step = records.length,
): GameState {
  const target = Math.max(0, Math.min(step, records.length));
  let state = createGame({ seed });
  for (const record of records.slice(0, target)) {
    state = applyAction(state, record.action);
  }
  return state;
}

export function appendRecordedAction(
  session: LocalGameSession,
  action: GameAction,
  source: ActionSource,
  metadata: RecordedActionMetadata = {},
): LocalGameSession {
  const legal = getLegalActions(session.state, action.seat).some((candidate) =>
    sameAction(candidate, action),
  );
  if (!legal) return session;

  return {
    ...session,
    state: applyAction(session.state, action),
    records: [
      ...session.records,
      {
        action: { ...action } as GameAction,
        source,
        ...(metadata.reason === undefined ? {} : { reason: metadata.reason }),
        ...(metadata.candidates === undefined
          ? {}
          : {
              candidates: metadata.candidates.map((candidate) => ({
                action: { ...candidate.action } as GameAction,
                score: candidate.score,
                reasons: [...candidate.reasons],
              })),
            }),
      },
    ],
  };
}

/** Auto-pass only when pass is literally the viewer's sole legal response. */
export function getOnlyPassAction(state: GameState, seat: Seat): GameAction | null {
  const actions = getLegalActions(state, seat);
  return actions.length === 1 && actions[0]?.type === 'pass' ? actions[0] : null;
}

export function saveLocalGameSession(storage: StorageLike, session: LocalGameSession): boolean {
  const stored: StoredSession = {
    version: LOCAL_SESSION_VERSION,
    seed: session.seed,
    records: session.records,
  };
  try {
    storage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function loadLocalGameSession(storage: StorageLike, seed: number): SessionLoadResult {
  try {
    const raw = storage.getItem(LOCAL_SESSION_STORAGE_KEY);
    if (raw === null) return { session: createLocalGameSession(seed), restored: false };
    const stored = parseStoredSession(raw, seed);
    if (stored === null) return { session: createLocalGameSession(seed), restored: false };
    return {
      session: {
        seed,
        records: stored.records,
        state: replayRecordedActions(seed, stored.records),
      },
      restored: stored.records.length > 0,
    };
  } catch {
    return { session: createLocalGameSession(seed), restored: false };
  }
}

export function clearLocalGameSession(storage: StorageLike): void {
  try {
    storage.removeItem(LOCAL_SESSION_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy modes; a fresh in-memory game still works.
  }
}
