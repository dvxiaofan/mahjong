import { useState } from 'react';
import { LocalMode } from './LocalMode';
import { OnlineMode } from './online/OnlineMode';

type AppMode = 'local' | 'online';

export default function App() {
  const [mode, setMode] = useState<AppMode>('local');

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <header className="app-header">
        <div>
          <p className="eyebrow">PLAY MAHJONG · LOCAL & ONLINE</p>
          <h1>嗨！搓麻呀！</h1>
          <p className="app-subtitle">自定义麻将 · 规则权威牌桌</p>
        </div>
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
      </header>

      <main id="main-content" tabIndex={-1}>
        {mode === 'local' ? <LocalMode /> : <OnlineMode />}
      </main>

      <footer className="app-footer">
        <span>规则引擎 · 可解释 AI · 自动存档 · 隐私联网</span>
        <span>play-mahjong</span>
      </footer>
    </div>
  );
}
