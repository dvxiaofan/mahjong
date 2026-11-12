import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { GameAudienceView } from '../../src/types.ts';
import { TableAudioPlayer, TableSoundCursor, type VoiceClip } from '../tableAudio';
import {
  DEFAULT_SOUND_SETTINGS,
  loadSoundSettings,
  normalizeSoundSettings,
  playbackVolumes,
  saveSoundSettings,
  type SoundSettings,
  type SoundStorage,
} from '../soundSettings';

interface TableAudioContextValue {
  enabled: boolean;
  visible: boolean;
  settings: SoundSettings;
  saved: boolean;
  status: 'off' | 'waiting' | 'loading' | 'ready' | 'unavailable';
  message: string | null;
  enable: () => Promise<boolean>;
  mute: () => void;
  update: (patch: Partial<SoundSettings>) => void;
  preview: () => Promise<void>;
  play: (clip: VoiceClip) => void;
  stop: () => void;
}

const AudioContext = createContext<TableAudioContextValue>({
  enabled: false,
  visible: true,
  settings: { ...DEFAULT_SOUND_SETTINGS },
  saved: true,
  status: 'off',
  message: null,
  enable: async () => false,
  mute: () => undefined,
  update: () => undefined,
  preview: async () => undefined,
  play: () => undefined,
  stop: () => undefined,
});

function browserStorage(): SoundStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function TableAudioProvider({
  children,
  storage: suppliedStorage,
}: {
  children: ReactNode;
  storage?: SoundStorage | null;
}) {
  const [storage] = useState(() =>
    suppliedStorage === undefined ? browserStorage() : suppliedStorage,
  );
  const [settings, setSettings] = useState(() => loadSoundSettings(storage));
  const settingsRef = useRef(settings);
  const player = useRef<TableAudioPlayer | null>(null);
  const [saved, setSaved] = useState(storage !== null);
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  const [status, setStatus] = useState<TableAudioContextValue['status']>(
    settings.enabled ? 'waiting' : 'off',
  );
  const [message, setMessage] = useState<string | null>(null);
  const activation = useRef(0);
  const playback = useRef(0);

  const stop = useCallback(() => {
    playback.current++;
    player.current?.stop();
  }, []);
  const update = useCallback(
    (patch: Partial<SoundSettings>) => {
      const next = normalizeSoundSettings({ ...settingsRef.current, ...patch });
      const packChanged =
        patch.voicePack !== undefined && patch.voicePack !== settingsRef.current.voicePack;
      settingsRef.current = next;
      setSettings(next);
      if (packChanged) stop();
      player.current?.setVoicePack(next.voicePack);
      player.current?.setVolumes(playbackVolumes(next));
      setSaved(saveSoundSettings(storage, next));
    },
    [stop, storage],
  );
  const mute = useCallback(() => {
    activation.current++;
    update({ enabled: false });
    setStatus('off');
    setMessage(null);
    stop();
  }, [stop, update]);
  const enable = useCallback(async () => {
    const attempt = ++activation.current;
    update({ enabled: true });
    setStatus('loading');
    setMessage(null);
    const current = (player.current ??= new TableAudioPlayer());
    current.setVoicePack(settingsRef.current.voicePack);
    current.setVolumes(playbackVolumes(settingsRef.current));
    try {
      await current.enable();
      if (attempt !== activation.current) return false;
      setStatus('ready');
      return true;
    } catch {
      if (attempt !== activation.current) return false;
      setStatus('unavailable');
      setMessage('声音暂时无法开启，点击重试即可。');
      return false;
    }
  }, [update]);
  const play = useCallback((clip: VoiceClip) => {
    const current = player.current;
    if (current === null || !settingsRef.current.enabled) return;
    const attempt = ++playback.current;
    void current
      .play(clip)
      .then(() => {
        if (attempt === playback.current) setMessage(null);
      })
      .catch(() => {
        if (attempt === playback.current) setMessage('部分声音暂时无法加载，牌局可继续操作。');
      });
  }, []);
  const preview = useCallback(async () => {
    if (await enable()) play('m7');
  }, [enable, play]);

  useEffect(() => {
    if (status !== 'waiting') return;
    const unlock = () => {
      void enable();
    };
    document.addEventListener('pointerdown', unlock, { once: true, capture: true });
    document.addEventListener('keydown', unlock, { once: true, capture: true });
    return () => {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    };
  }, [status, enable]);

  useEffect(() => {
    const updateVisibility = () => {
      const active = document.visibilityState !== 'hidden';
      setVisible(active);
      if (!active) {
        activation.current++;
        stop();
      }
      if (settingsRef.current.enabled)
        setStatus(active && player.current?.running ? 'ready' : 'waiting');
    };
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      document.removeEventListener('visibilitychange', updateVisibility);
      activation.current++;
      playback.current++;
      player.current?.dispose();
      player.current = null;
    };
  }, [stop]);

  return (
    <AudioContext.Provider
      value={{
        enabled: settings.enabled && status === 'ready',
        visible,
        settings,
        saved,
        status,
        message,
        enable,
        mute,
        update,
        preview,
        play,
        stop,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function SoundToggle() {
  const sound = useContext(AudioContext);
  const label =
    sound.status === 'loading'
      ? '正在开启声音…'
      : sound.enabled
        ? '声音已开启 · 静音'
        : sound.status === 'unavailable'
          ? '重试声音'
          : '开启声音';
  return (
    <div className="sound-control">
      <button
        type="button"
        className="ghost-button"
        aria-pressed={sound.enabled}
        disabled={sound.status === 'loading'}
        onClick={() => (sound.enabled ? sound.mute() : void sound.enable())}
      >
        {label}
      </button>
      <details
        className="sound-settings"
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.currentTarget.open = false;
        }}
      >
        <summary>声音设置</summary>
        <div className="sound-settings-panel">
          <strong>声音偏好</strong>
          <label className="sound-switch">
            <input
              type="checkbox"
              checked={sound.settings.voiceEnabled}
              onChange={(event) => sound.update({ voiceEnabled: event.currentTarget.checked })}
            />
            语音报牌
          </label>
          <label className="sound-voice-pack">
            <span>播报音色</span>
            <select
              aria-label="播报音色"
              value={sound.settings.voicePack}
              onChange={(event) =>
                sound.update({
                  voicePack: event.currentTarget.value === 'female' ? 'female' : 'male',
                })
              }
            >
              <option value="male">男声 · 超文</option>
              <option value="female">女声 · 婷婷</option>
            </select>
          </label>
          <label className="sound-volume">
            <span>
              语音音量 <output>{Math.round(sound.settings.voiceVolume * 100)}%</output>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              aria-label="语音音量"
              aria-valuetext={`${Math.round(sound.settings.voiceVolume * 100)}%`}
              value={Math.round(sound.settings.voiceVolume * 100)}
              onChange={(event) =>
                sound.update({ voiceVolume: Number(event.currentTarget.value) / 100 })
              }
            />
          </label>
          <label className="sound-switch">
            <input
              type="checkbox"
              checked={sound.settings.effectsEnabled}
              onChange={(event) => sound.update({ effectsEnabled: event.currentTarget.checked })}
            />
            牌桌音效
          </label>
          <label className="sound-volume">
            <span>
              音效音量 <output>{Math.round(sound.settings.effectsVolume * 100)}%</output>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              aria-label="音效音量"
              aria-valuetext={`${Math.round(sound.settings.effectsVolume * 100)}%`}
              value={Math.round(sound.settings.effectsVolume * 100)}
              onChange={(event) =>
                sound.update({ effectsVolume: Number(event.currentTarget.value) / 100 })
              }
            />
          </label>
          <button
            className="ghost-button"
            type="button"
            disabled={
              sound.status === 'loading' ||
              (!sound.settings.voiceEnabled && !sound.settings.effectsEnabled)
            }
            onClick={() => void sound.preview()}
          >
            试听出牌
          </button>
          <small>
            {sound.saved
              ? '设置保存在本机，下次继续使用。'
              : '本次设置有效，当前浏览器无法保存偏好。'}
          </small>
          <small>只播报公开动作，暗牌和听口不外放。</small>
          <small>男声为离线神经网络合成，不读取麦克风。</small>
        </div>
      </details>
      {sound.message !== null && (
        <span className="sound-message" role="status">
          {sound.message}
        </span>
      )}
    </div>
  );
}

export function TableSounds({
  view,
  roundKey,
  live,
}: {
  view: GameAudienceView;
  roundKey: string;
  live: boolean;
}) {
  const { enabled, visible, play, stop } = useContext(AudioContext);
  const cursor = useRef(new TableSoundCursor());
  const active = live && enabled && visible;
  const context = `${roundKey}:${view.viewerSeat}`;

  useEffect(() => {
    const clip = cursor.current.observe(view, roundKey, active);
    if (clip !== null) play(clip);
  }, [view, roundKey, active, play]);

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    return () => stop();
  }, [context, active, stop]);
  return null;
}
