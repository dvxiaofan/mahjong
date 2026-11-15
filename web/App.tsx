import { useEffect, useState } from 'react';
import { LocalMode } from './LocalMode';
import { tileFacesReady } from './components/MahjongTileFace';
import { OnlineMode } from './online/OnlineMode';
import { SoundToggle, TableAudioProvider } from './components/TableAudio';
import { TutorialMode } from './tutorial/TutorialMode';
import { appModeFromSearch, type AppMode } from './appMode';

export default function App() {
  return (
    <TableAudioProvider>
      <Application />
    </TableAudioProvider>
  );
}

/** Hold the table back until every tile face can paint synchronously; see tileFacesReady. */
function useTileFacesReady(): boolean {
  const [ready, setReady] = useState(() => typeof Image === 'undefined');
  useEffect(() => {
    if (ready) return undefined;
    let active = true;
    void tileFacesReady().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [ready]);
  return ready;
}

function Application() {
  const [mode, setMode] = useState<AppMode>(() =>
    typeof window === 'undefined' ? 'local' : appModeFromSearch(window.location.search),
  );
  const tilesReady = useTileFacesReady();

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
            <button
              aria-pressed={mode === 'tutorial'}
              className={mode === 'tutorial' ? 'is-active' : ''}
              onClick={() => setMode('tutorial')}
              type="button"
            >
              规则教程
            </button>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {!tilesReady ? (
          <div aria-busy="true" className="app-loading" role="status">
            正在加载牌面…
          </div>
        ) : mode === 'local' ? (
          <LocalMode onOpenTutorial={() => setMode('tutorial')} />
        ) : mode === 'tutorial' ? (
          <TutorialMode />
        ) : (
          <OnlineMode />
        )}
      </main>

      <footer className="app-footer">
        <span>自动存档 · 熟人约局</span>
        <span>play-mahjong</span>
      </footer>
    </div>
  );
}
