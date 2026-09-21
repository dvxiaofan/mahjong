import { useEffect, useState } from 'react';
import {
  loadHandSettings,
  needsDiscardConfirmation,
  normalizeHandSettings,
  saveHandSettings,
  type HandSettings,
  type HandStorage,
} from './handSettings';

const TOUCH_OR_NARROW = '(pointer: coarse), (max-width: 600px)';
function browserStorage(): HandStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function useHandSettings() {
  const [storage] = useState(browserStorage);
  const [settings, setSettings] = useState(() => loadHandSettings(storage));
  const [saved, setSaved] = useState(storage !== null);
  const [touchOrNarrow, setTouchOrNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(TOUCH_OR_NARROW).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(TOUCH_OR_NARROW);
    const update = () => setTouchOrNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  function update(patch: Partial<HandSettings>) {
    const next = normalizeHandSettings({ ...settings, ...patch });
    setSettings(next);
    setSaved(saveHandSettings(storage, next));
  }
  return {
    settings,
    saved,
    update,
    confirmDiscard: needsDiscardConfirmation(settings, touchOrNarrow),
  };
}
