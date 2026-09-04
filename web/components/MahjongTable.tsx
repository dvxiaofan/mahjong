import { tileLabel } from '../../src/tiles.ts';
import type {
  GameAction,
  GameView,
  PlayerViewEntry,
  Seat,
} from '../../src/types.ts';
import { ActionBar } from './ActionBar';
import { EventFeed } from './EventFeed';
import { PlayerSeat } from './PlayerSeat';
import { ResultPanel } from './ResultPanel';
import {
  formatEventForViewer,
  getInteractionPrompt,
  getSeatActivity,
  seatLabel,
} from '../uiModel';

interface MahjongTableProps {
  view: GameView;
  botThinking: boolean;
  isReplaying: boolean;
  onAction: (action: GameAction) => void;
  onReset: () => void;
}

type TablePosition = 'north' | 'west' | 'east' | 'south';

const seatPositions: ReadonlyArray<{ position: TablePosition; seat: Seat }> = [
  { position: 'north', seat: 2 },
  { position: 'west', seat: 3 },
  { position: 'east', seat: 1 },
  { position: 'south', seat: 0 },
];
const phaseLabels: Record<GameView['phase'], string> = {
  'awaiting-draw': '等待摸牌',
  'awaiting-discard': '等待出牌',
  claiming: '弃牌响应中',
  finished: '本局结束',
  drawn: '荒庄',
};

function playerFor(view: GameView, seat: Seat): PlayerViewEntry {
  const player = view.players.find((entry) => entry.seat === seat);
  if (player === undefined) throw new Error(`视图缺少 ${seat} 号玩家`);
  return player;
}

export function MahjongTable({ view, botThinking, isReplaying, onAction, onReset }: MahjongTableProps) {
  const prompt = isReplaying
    ? '正在查看历史局面，返回实时牌局后才能操作'
    : getInteractionPrompt(view, botThinking);
  const latestEvent = view.events.at(-1);

  return (
    <div className="table-layout">
      <section className="felt-table" aria-label="麻将牌桌">
        <div className="felt-highlight felt-highlight--one" />
        <div className="felt-highlight felt-highlight--two" />

        {seatPositions.map(({ position, seat }) => {
          return (
            <div className={`seat-slot seat-slot--${position}`} key={position}>
              <PlayerSeat
                activity={getSeatActivity(view, seat)}
                dealer={view.dealerSeat === seat}
                lastDrawnTile={seat === view.viewerSeat ? view.lastDrawnTile : null}
                legalActions={seat === view.viewerSeat ? view.legalActions : []}
                onAction={onAction}
                player={playerFor(view, seat)}
                position={position}
              />
            </div>
          );
        })}

        <div className="center-hud">
          <div className="center-kicker">牌墙剩余</div>
          <div className="wall-count">{view.wallRemaining}</div>
          <div className="wall-caption">张</div>
          <div className="phase-pill">{phaseLabels[view.phase]}</div>
          <div className="turn-line">
            <span className="turn-dot" />
            {botThinking && view.legalActions.length === 0
              ? '对手行动中…'
              : `当前行动：${seatLabel(view.currentSeat, view.viewerSeat)}`}
          </div>
          {view.pendingDiscard !== null && (
            <div className="pending-card">
              <span>待响应</span>
              <strong>{tileLabel(view.pendingDiscard.tile)}</strong>
              <small>{view.pendingDiscard.respondedSeats.length}/3 已响应</small>
            </div>
          )}
        </div>

        <div className="table-mark table-mark--top">逆时针</div>
        <div className="table-mark table-mark--bottom">庄家 · {seatLabel(view.dealerSeat, view.viewerSeat)}</div>
      </section>

      <div className="table-status-strip" aria-live="polite">
        <span className="status-icon">{view.phase === 'finished' ? '胡' : view.phase === 'drawn' ? '荒' : '局'}</span>
        <span className="status-copy">
          <strong>{prompt}</strong>
          <small>{latestEvent === undefined
            ? '牌局准备就绪'
            : formatEventForViewer(latestEvent, view.viewerSeat)}</small>
        </span>
      </div>

      <ResultPanel view={view} onReset={onReset} />

      <section className="table-lower-grid">
        <ActionBar
          actions={view.legalActions}
          botThinking={botThinking}
          isReplaying={isReplaying}
          onAction={onAction}
          prompt={prompt}
        />
        <EventFeed events={view.events} viewerSeat={view.viewerSeat} />
      </section>
    </div>
  );
}
