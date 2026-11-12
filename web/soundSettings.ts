export const SOUND_STORAGE_KEY = 'play-mahjong.sound.v1';

export type VoicePack = 'male' | 'female';

export interface SoundSettings {
  enabled: boolean;
  voiceEnabled: boolean;
  effectsEnabled: boolean;
  voicePack: VoicePack;
  voiceVolume: number;
  effectsVolume: number;
}

export interface SoundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_SOUND_SETTINGS: Readonly<SoundSettings> = {
  enabled: false,
  voiceEnabled: true,
  effectsEnabled: true,
  voicePack: 'male',
  voiceVolume: 0.8,
  effectsVolume: 0.35,
};

function volume(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

export function normalizeSoundSettings(value: unknown): SoundSettings {
  const input =
    value !== null && typeof value === 'object' ? (value as Partial<SoundSettings>) : {};
  return {
    enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SOUND_SETTINGS.enabled,
    voiceEnabled:
      typeof input.voiceEnabled === 'boolean'
        ? input.voiceEnabled
        : DEFAULT_SOUND_SETTINGS.voiceEnabled,
    effectsEnabled:
      typeof input.effectsEnabled === 'boolean'
        ? input.effectsEnabled
        : DEFAULT_SOUND_SETTINGS.effectsEnabled,
    voicePack: input.voicePack === 'female' ? 'female' : 'male',
    voiceVolume: volume(input.voiceVolume, DEFAULT_SOUND_SETTINGS.voiceVolume),
    effectsVolume: volume(input.effectsVolume, DEFAULT_SOUND_SETTINGS.effectsVolume),
  };
}

export function loadSoundSettings(storage: SoundStorage | null): SoundSettings {
  try {
    return normalizeSoundSettings(JSON.parse(storage?.getItem(SOUND_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

export function saveSoundSettings(storage: SoundStorage | null, settings: SoundSettings): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(SOUND_STORAGE_KEY, JSON.stringify(normalizeSoundSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function playbackVolumes(settings: SoundSettings): { voice: number; effects: number } {
  return {
    voice: settings.enabled && settings.voiceEnabled ? settings.voiceVolume : 0,
    effects: settings.enabled && settings.effectsEnabled ? settings.effectsVolume : 0,
  };
}
