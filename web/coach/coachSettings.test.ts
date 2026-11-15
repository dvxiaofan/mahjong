import { describe, expect, it } from 'vitest';
import {
  COACH_SETTINGS_KEY,
  DEFAULT_COACH_SETTINGS,
  loadCoachSettings,
  normalizeCoachSettings,
  saveCoachSettings,
} from './coachSettings';

describe('教练本机偏好', () => {
  it('默认关闭，开启状态可保存并恢复', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    };
    expect(loadCoachSettings(storage)).toEqual(DEFAULT_COACH_SETTINGS);
    expect(saveCoachSettings(storage, { enabled: true })).toBe(true);
    expect(loadCoachSettings(storage)).toEqual({ enabled: true });
    data.set(COACH_SETTINGS_KEY, JSON.stringify({ enabled: 'true' }));
    expect(loadCoachSettings(storage)).toEqual(DEFAULT_COACH_SETTINGS);
  });

  it('损坏、拒绝访问和异常输入安全回退', () => {
    const blocked = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadCoachSettings(null)).toEqual(DEFAULT_COACH_SETTINGS);
    expect(loadCoachSettings(blocked)).toEqual(DEFAULT_COACH_SETTINGS);
    expect(saveCoachSettings(blocked, { enabled: true })).toBe(false);
    expect(normalizeCoachSettings({ enabled: 1 })).toEqual(DEFAULT_COACH_SETTINGS);
    expect(normalizeCoachSettings({ enabled: true, extra: 'ignored' })).toEqual({
      enabled: true,
    });
  });
});
