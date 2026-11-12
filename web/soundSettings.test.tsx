import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SoundToggle, TableAudioProvider } from './components/TableAudio';
import {
  DEFAULT_SOUND_SETTINGS,
  loadSoundSettings,
  normalizeSoundSettings,
  playbackVolumes,
  saveSoundSettings,
  SOUND_STORAGE_KEY,
} from './soundSettings';

describe('声音偏好与设置面板', () => {
  it('缺失或损坏的存储回退默认值，不影响页面', () => {
    expect(loadSoundSettings(null)).toEqual(DEFAULT_SOUND_SETTINGS);
    expect(loadSoundSettings({ getItem: () => '{invalid', setItem: () => undefined })).toEqual(
      DEFAULT_SOUND_SETTINGS,
    );
    expect(
      loadSoundSettings({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => undefined,
      }),
    ).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it('保存后恢复独立开关和音量，主静音保留两路偏好', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const settings = {
      ...DEFAULT_SOUND_SETTINGS,
      enabled: true,
      voiceEnabled: false,
      voicePack: 'female' as const,
      voiceVolume: 0.55,
      effectsVolume: 0.2,
    };
    expect(saveSoundSettings(storage, settings)).toBe(true);
    expect(values.has(SOUND_STORAGE_KEY)).toBe(true);
    expect(loadSoundSettings(storage)).toEqual(settings);
    expect(playbackVolumes(settings)).toEqual({ voice: 0, effects: 0.2 });
    expect(playbackVolumes({ ...settings, enabled: false })).toEqual({ voice: 0, effects: 0 });
    expect(playbackVolumes({ ...settings, voiceEnabled: true })).toEqual({
      voice: 0.55,
      effects: 0.2,
    });
  });

  it('异常数值被规范化，保存失败可报告而不抛出', () => {
    expect(
      normalizeSoundSettings({
        enabled: 'yes',
        voiceEnabled: false,
        effectsEnabled: null,
        voicePack: 'robot',
        voiceVolume: 3,
        effectsVolume: -2,
      }),
    ).toEqual({ ...DEFAULT_SOUND_SETTINGS, voiceEnabled: false, voiceVolume: 1, effectsVolume: 0 });
    expect(normalizeSoundSettings({ voiceVolume: NaN, effectsVolume: Infinity })).toEqual(
      DEFAULT_SOUND_SETTINGS,
    );
    expect(normalizeSoundSettings({ voicePack: 'female' }).voicePack).toBe('female');
    expect(normalizeSoundSettings({ voicePack: 'robot' }).voicePack).toBe('male');
    expect(
      saveSoundSettings(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('full');
          },
        },
        { ...DEFAULT_SOUND_SETTINGS },
      ),
    ).toBe(false);
  });

  it('恢复偏好不会自动播放，设置提供键盘可达的开关、音量和试听', () => {
    const storage = {
      getItem: () =>
        JSON.stringify({ ...DEFAULT_SOUND_SETTINGS, enabled: true, voiceVolume: 0.55 }),
      setItem: vi.fn(),
    };
    const html = renderToStaticMarkup(
      <TableAudioProvider storage={storage}>
        <SoundToggle />
      </TableAudioProvider>,
    );
    expect(html).toContain('开启声音');
    expect(html).toContain('声音设置');
    expect(html).toContain('语音报牌');
    expect(html).toContain('播报音色');
    expect(html).toContain('男声 · 超文');
    expect(html).toContain('女声 · 婷婷');
    expect(html).toContain('牌桌音效');
    expect(html).toContain('aria-label="语音音量"');
    expect(html).toContain('aria-valuetext="55%"');
    expect(html).toContain('试听出牌');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
