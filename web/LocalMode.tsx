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
  // Nothing moves until the player explicitly starts; a saved game waits to be resumed too.
  const [started, setStarted] = useState(false);
  const game = useLocalGame(initialSeed, difficulty, { active: started });
  const resumable = game.restored && game.records.length > 0;

  if (!started) {
    return (
      <section className="local-start" aria-labelledby="local-start-title">
        <p className="panel-eyebrow">LOCAL TABLE</p>
        <h2 id="local-start-title">{resumable ? '继续上次的本地对局？' : '开一桌本地对局'}</h2>
        <p className="local-start-hint">
          {resumable
            ? `上次打到第 ${game.roundNumber} 局，已记录 ${game.records.length} 步。点击继续，牌局从原处接着走。`
            : '你坐 1 号位，与三位 AI 对局。点击开始后掷骰定庄、发牌，AI 才会出手。'}
        </p>
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
        <div className="local-start-actions">
          <button className="online-primary-button" onClick={() => setStarted(true)} type="button">
            {resumable ? '继续对局' : '开始对局'}
          </button>
          {resumable && (
            <button
              className="ghost-button"
              onClick={() => {
                game.reset();
                setStarted(true);
              }}
              type="button"
            >
              放弃存档，重新开始
            </button>
          )}
        </div>
      </section>
    );
  }

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
        <span className="replay-badge">第 {game.roundNumber} 局</span>
        {game.isReplaying && (
          <span className="replay-badge">
            回放 {game.replayStep}/{game.records.length}
          </span>
        )}
        <button className="ghost-button" type="button" onClick={() => setHistoryOpen(true)}>
          牌局记录 · {game.records.length}
        </button>
        <button className="ghost-button" type="button" onClick={game.reset}>
          重新开赛
        </button>
      </section>

      <MahjongTable
        view={game.view}
        botThinking={game.botThinking}
        isReplaying={game.isReplaying}
        roundKey={game.roundKey}
        onAction={game.dispatch}
        onReset={game.startNextRound}
        resetLabel="开始下一局"
        roundSetup={{
          roundNumber: game.roundNumber,
          dealerReason: game.dealerSource,
          dealerSelection: game.dealerSelection,
          opening: game.opening,
        }}
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
