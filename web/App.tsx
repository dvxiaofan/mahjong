import { useState } from 'react';
import { LocalMode } from './LocalMode';
import { OnlineMode } from './online/OnlineMode';

type AppMode = 'local' | 'online';

export default function App() {
  const [mode, setMode] = useState<AppMode>('local');

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">PLAY MAHJONG · LOCAL & ONLINE</p>
          <h1>嗨！搓麻呀！</h1>
          <p className="app-subtitle">自定义麻将 · 规则权威牌桌</p>
        </div>
        <div className="mode-switch" role="tablist" aria-label="游戏模式">
          <button aria-selected={mode === 'local'} className={mode === 'local' ? 'is-active' : ''} onClick={() => setMode('local')} role="tab" type="button">本地对局</button>
          <button aria-selected={mode === 'online'} className={mode === 'online' ? 'is-active' : ''} onClick={() => setMode('online')} role="tab" type="button">联网对战</button>
        </div>
      </header>

      <main>{mode === 'local' ? <LocalMode /> : <OnlineMode />}</main>

      <footer className="app-footer">
        <span>规则引擎 · 可解释 AI · 自动存档 · 隐私联网</span>
        <span>play-mahjong</span>
      </footer>
    </div>
  );
}
