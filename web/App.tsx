import { useState } from 'react';
import { LocalMode } from './LocalMode';
import { OnlineMode } from './online/OnlineMode';
import { SoundToggle, TableAudioProvider } from './components/TableAudio';

type AppMode = 'local' | 'online';

export default function App() {
  return (
    <TableAudioProvider>
      <Application />
    </TableAudioProvider>
  );
}

function Application() {
  const [mode, setMode] = useState<AppMode>('local');

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="app-header">
        <div>
          <h1>嗨！搓麻呀！</h1>
          <p className="app-subtitle">自定义玩法 · 和牌友搓一局</p>
        </div>
        <div className="header-controls">
          <SoundToggle />
          <nav className="mode-switch" aria-label="游戏模式">
            <button
              aria-pressed={mode === 'local'}
              className={mode === 'local' ? 'is-active' : ''}
              onClick={() => setMode('local')}
              type="button"
            >
              本地对局
            </button>
            <button
              aria-pressed={mode === 'online'}
              className={mode === 'online' ? 'is-active' : ''}
              onClick={() => setMode('online')}
              type="button"
            >
              联网对战
            </button>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {mode === 'local' ? <LocalMode /> : <OnlineMode />}
      </main>

      <footer className="app-footer">
        <span>自动存档 · 熟人约局</span>
        <span>play-mahjong</span>
      </footer>
    </div>
  );
}
