import { describe, expect, it } from 'vitest';
import { getLegalActions } from '../src/game.js';
import {
  LOCAL_SESSION_STORAGE_KEY,
  appendRecordedAction,
  createFreshLocalSeed,
  createLocalGameSession,
  getOnlyPassAction,
  loadLocalGameSession,
  replayRecordedActions,
  saveLocalGameSession,
  type StorageLike,
} from './localSession';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('本地牌局会话', () => {
  it('记录动作并可以重建任意回放步骤', () => {
    let session = createLocalGameSession(20260904);
    const firstAction = getLegalActions(session.state, 0)[0];
    if (firstAction === undefined) throw new Error('开局没有动作');
    session = appendRecordedAction(session, firstAction, 'human');

    expect(session.records).toEqual([{ action: firstAction, source: 'human' }]);
    expect(replayRecordedActions(session.seed, session.records, 0).events).toEqual(
      createLocalGameSession(session.seed).state.events,
    );
    expect(replayRecordedActions(session.seed, session.records, 1)).toEqual(session.state);
  });

  it('保存后可以从动作轨迹恢复当前局面', () => {
    const storage = new MemoryStorage();
    let session = createLocalGameSession(17);
    const action = getLegalActions(session.state, 0)[0];
    if (action === undefined) throw new Error('开局没有动作');
    session = appendRecordedAction(session, action, 'human', {
      reason: '测试选择原因',
      candidates: [{ action, score: 42, reasons: ['测试备选评分'] }],
    });

    expect(saveLocalGameSession(storage, session)).toBe(true);
    const loaded = loadLocalGameSession(storage, 17);
    expect(loaded.restored).toBe(true);
    expect(loaded.session).toEqual(session);
    expect(loaded.session.records[0]?.reason).toBe('测试选择原因');
  });

  it('每次新开局生成不同种子和牌墙', () => {
    const previousSeed = 17;
    const nextSeed = createFreshLocalSeed(previousSeed, previousSeed);

    expect(nextSeed).not.toBe(previousSeed);
    expect(createFreshLocalSeed(undefined, 0)).not.toBe(0);
    expect(createLocalGameSession(nextSeed).state.wall.tiles).not.toEqual(
      createLocalGameSession(previousSeed).state.wall.tiles,
    );
  });

  it('损坏数据安全回退，而有效存档使用自身实际种子恢复', () => {
    const storage = new MemoryStorage();
    storage.setItem(LOCAL_SESSION_STORAGE_KEY, '{broken');
    expect(loadLocalGameSession(storage, 4).restored).toBe(false);

    storage.setItem(
      LOCAL_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        seed: 9,
        records: [],
      }),
    );
    const loaded = loadLocalGameSession(storage, 4);
    expect(loaded.restored).toBe(true);
    expect(loaded.session.seed).toBe(9);
    expect(loaded.session.state).toEqual(createLocalGameSession(9).state);
  });

  it('我方仅有过牌动作时自动过，有其他选择时等待用户', () => {
    const session = createLocalGameSession(5);
    session.state.phase = 'claiming';
    session.state.pendingDiscard = { tile: 'm1', discarder: 1, responses: {} };
    session.state.players[0]!.concealedTiles = [];
    expect(getOnlyPassAction(session.state, 0)).toEqual({ type: 'pass', seat: 0 });

    session.state.players[0]!.concealedTiles = ['m1', 'm1'];
    expect(getOnlyPassAction(session.state, 0)).toBeNull();
  });
});
