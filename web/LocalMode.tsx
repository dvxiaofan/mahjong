import { useState } from 'react';
import type { AiDifficulty } from '../src/ai-difficulty.ts';
import { HistoryDrawer } from './components/HistoryDrawer';
import { MahjongTable } from './components/MahjongTable';
import { createFreshLocalSeed } from './localSession';
import { useLocalGame } from './useLocalGame';

const difficultyLabels: Record<AiDifficulty, string> = {
  casual: '休闲',
  standard: '标准',
  advanced: '进阶',
};

export function LocalMode() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [difficulty, setDifficulty] = useState<AiDifficulty>('standard');
  const [initialSeed] = useState(() => createFreshLocalSeed());
  const game = useLocalGame(initialSeed, difficulty);

  return (
    <>
      <section className="mode-toolbar">
        <label className="difficulty-control">
          <span>AI 难度</span>
          <select
            aria-label="AI 难度"
            onChange={(event) => setDifficulty(event.currentTarget.value as AiDifficulty)}
            value={difficulty}
          >
            {(Object.keys(difficultyLabels) as AiDifficulty[]).map((value) => (
              <option key={value} value={value}>
                {difficultyLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <span className="demo-badge">
          <span className="demo-dot" />
          {game.restored ? '已恢复本地牌局' : '自动保存已开启'}
        </span>
        {game.isReplaying && (
          <span className="replay-badge">
            回放 {game.replayStep}/{game.records.length}
          </span>
        )}
        <button className="ghost-button" type="button" onClick={() => setHistoryOpen(true)}>
          牌局记录 · {game.records.length}
        </button>
        <button className="ghost-button" type="button" onClick={game.reset}>
          重新发牌
        </button>
      </section>

      <MahjongTable
        view={game.view}
        botThinking={game.botThinking}
        isReplaying={game.isReplaying}
        onAction={game.dispatch}
        onReset={game.reset}
      />

      <HistoryDrawer
        onClose={() => setHistoryOpen(false)}
        onReplayStep={game.showReplayStep}
        onResumeLive={game.resumeLive}
        open={historyOpen}
        records={game.records}
        replayStep={game.replayStep}
        view={game.view}
      />
    </>
  );
}
