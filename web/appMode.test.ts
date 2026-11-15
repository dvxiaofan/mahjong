import { describe, expect, it } from 'vitest';
import { appModeFromSearch, roomIdFromSearch } from './appMode';

describe('应用入口参数', () => {
  it('支持本地、联网和教程模式，未知值回退本地', () => {
    expect(appModeFromSearch('')).toBe('local');
    expect(appModeFromSearch('?mode=online')).toBe('online');
    expect(appModeFromSearch('?mode=tutorial')).toBe('tutorial');
    expect(appModeFromSearch('?mode=unknown')).toBe('local');
  });

  it('只接受长度合法的房间名，并保留中文和空格', () => {
    expect(roomIdFromSearch('?room=%E6%B8%85%E4%B8%80%E8%89%B2%E8%8C%B6%E6%A5%BC')).toBe(
      '清一色茶楼',
    );
    expect(roomIdFromSearch('?room=ab')).toBeNull();
    expect(roomIdFromSearch('')).toBeNull();
  });
});
