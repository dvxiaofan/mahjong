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

interface MahjongTableProps {
  view: GameView;
  botThinking: boolean;
  onAction: (action: GameAction) => void;
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

export function MahjongTable({ view, botThinking, onAction }: MahjongTableProps) {
  return (
    <div className="table-layout">
      <section className="felt-table" aria-label="麻将牌桌">
        <div className="felt-highlight felt-highlight--one" />
        <div className="felt-highlight felt-highlight--two" />

        {seatPositions.map(({ position, seat }) => {
          return (
            <div className={`seat-slot seat-slot--${position}`} key={position}>
              <PlayerSeat
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
            {botThinking ? '对手响应中…' : `当前行动：${view.currentSeat + 1} 号玩家`}
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
        <div className="table-mark table-mark--bottom">东家起牌</div>
      </section>

      <section className="table-lower-grid">
        <ActionBar actions={view.legalActions} onAction={onAction} />
        <EventFeed events={view.events} />
      </section>
    </div>
  );
}
