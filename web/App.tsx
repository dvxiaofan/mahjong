import { useMemo, useState } from 'react';
import {
  createGame,
  projectStateForSeat,
  type GameState,
} from '../src/index.ts';
import { MahjongTable } from './components/MahjongTable';

const DEMO_SEED = 20260904;
const VIEWER_SEAT = 0 as const;

export default function App() {
  const [state, setState] = useState<GameState>(() => createGame({ seed: DEMO_SEED }));
  const view = useMemo(
    () => projectStateForSeat(state, VIEWER_SEAT),
    [state],
  );

  function resetDemo() {
    setState(createGame({ seed: DEMO_SEED }));
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">M2.3 · UI SHELL</p>
          <h1>嗨！搓麻呀！</h1>
          <p className="app-subtitle">自定义麻将 · 单局演示牌桌</p>
        </div>
        <div className="header-actions">
          <span className="demo-badge">
            <span className="demo-dot" />
            固定种子演示
          </span>
          <button className="ghost-button" type="button" onClick={resetDemo}>
            重新发牌
          </button>
        </div>
      </header>

      <main>
        <MahjongTable view={view} />
      </main>

      <footer className="app-footer">
        <span>规则引擎已接入 · 交互动作将在 M2.4 开启</span>
        <span>Seed {DEMO_SEED}</span>
      </footer>
    </div>
  );
}
