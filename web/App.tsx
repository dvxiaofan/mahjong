import { useState } from 'react';
import { HistoryDrawer } from './components/HistoryDrawer';
import { MahjongTable } from './components/MahjongTable';
import { useLocalGame } from './useLocalGame';

const DEMO_SEED = 20260904;

export default function App() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const {
    view,
    botThinking,
    restored,
    records,
    replayStep,
    isReplaying,
    dispatch,
    reset,
    showReplayStep,
    resumeLive,
  } = useLocalGame(DEMO_SEED);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">M2.6 · HISTORY & REPLAY</p>
          <h1>嗨！搓麻呀！</h1>
          <p className="app-subtitle">自定义麻将 · 单局演示牌桌</p>
        </div>
        <div className="header-actions">
          <span className="demo-badge">
            <span className="demo-dot" />
            {restored ? '已恢复本地牌局' : '自动保存已开启'}
          </span>
          {isReplaying && <span className="replay-badge">回放 {replayStep}/{records.length}</span>}
          <button className="ghost-button" type="button" onClick={() => setHistoryOpen(true)}>
            牌局记录 · {records.length}
          </button>
          <button className="ghost-button" type="button" onClick={reset}>
            重新发牌
          </button>
        </div>
      </header>

      <main>
        <MahjongTable
          view={view}
          botThinking={botThinking}
          isReplaying={isReplaying}
          onAction={dispatch}
          onReset={reset}
        />
      </main>

      <HistoryDrawer
        onClose={() => setHistoryOpen(false)}
        onReplayStep={showReplayStep}
        onResumeLive={resumeLive}
        open={historyOpen}
        records={records}
        replayStep={replayStep}
        view={view}
      />

      <footer className="app-footer">
        <span>规则引擎 · 本地 Bot · 自动存档 · 动作回放</span>
        <span>Seed {DEMO_SEED}</span>
      </footer>
    </div>
  );
}
