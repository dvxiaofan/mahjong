export const COACH_SETTINGS_KEY = 'play-mahjong.coach.v1';

export interface CoachSettings {
  enabled: boolean;
}

export interface CoachStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEFAULT_COACH_SETTINGS: Readonly<CoachSettings> = {
  enabled: false,
};

export function normalizeCoachSettings(value: unknown): CoachSettings {
  const input =
    value !== null && typeof value === 'object' ? (value as Partial<CoachSettings>) : {};
  return {
    enabled: input.enabled === true,
  };
}

export function loadCoachSettings(storage: CoachStorage | null): CoachSettings {
  try {
    return normalizeCoachSettings(JSON.parse(storage?.getItem(COACH_SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_COACH_SETTINGS };
  }
}

export function saveCoachSettings(storage: CoachStorage | null, settings: CoachSettings): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(COACH_SETTINGS_KEY, JSON.stringify(normalizeCoachSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
