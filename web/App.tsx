import { MahjongTable } from './components/MahjongTable';
import { useLocalGame } from './useLocalGame';

const DEMO_SEED = 20260904;

export default function App() {
  const { view, botThinking, dispatch, reset } = useLocalGame(DEMO_SEED);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">M2.5 · PLAY EXPERIENCE</p>
          <h1>嗨！搓麻呀！</h1>
          <p className="app-subtitle">自定义麻将 · 单局演示牌桌</p>
        </div>
        <div className="header-actions">
          <span className="demo-badge">
            <span className="demo-dot" />
            固定种子演示
          </span>
          <button className="ghost-button" type="button" onClick={reset}>
            重新发牌
          </button>
        </div>
      </header>

      <main>
        <MahjongTable
          view={view}
          botThinking={botThinking}
          onAction={dispatch}
          onReset={reset}
        />
      </main>

      <footer className="app-footer">
        <span>规则引擎已接入 · 本地 Bot 已接入</span>
        <span>Seed {DEMO_SEED}</span>
      </footer>
    </div>
  );
}
