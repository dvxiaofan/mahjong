import type { GameAudienceView, Seat } from '../../src/types.ts';
import { seatLabel } from '../uiModel';
import type { RoundSetupView } from './RoundSetupPanel';

interface TableScoreboardProps {
  view: GameAudienceView;
  roundSetup?: RoundSetupView | undefined;
}

const relativeSeatOrder = [0, 1, 2, 3] as const;

function phaseText(view: GameAudienceView): string {
  if (view.phase === 'finished') return '本局结束';
  if (view.phase === 'drawn') return '荒庄';
  if (view.phase === 'claiming') return '等待响应';
  return `${seatLabel(view.currentSeat, view.viewerSeat)}${view.phase === 'awaiting-draw' ? '摸牌' : '出牌'}`;
}

export function TableScoreboard({ view, roundSetup }: TableScoreboardProps) {
  const baseSeat = view.viewerSeat ?? 0;
  const seats = relativeSeatOrder.map((offset) => ((baseSeat + offset) % 4) as Seat);
  const activeSeat =
    view.phase === 'finished' || view.phase === 'drawn' || view.phase === 'claiming'
      ? null
      : view.currentSeat;

  return (
    <section className="table-scoreboard" aria-label="本局记分">
      <header className="scoreboard-heading">
        <div>
          <h2>本局记分</h2>
          <span>{roundSetup === undefined ? '当前对局' : `第 ${roundSetup.roundNumber} 局`}</span>
        </div>
        <span className="scoreboard-wall">
          <small>牌墙</small>
          <strong>{view.wallRemaining}</strong>
          <small>张</small>
        </span>
      </header>

      <div className="scoreboard-facts">
        <span>
          <small>庄家</small>
          <strong>{seatLabel(view.dealerSeat, view.viewerSeat)}</strong>
        </span>
        <span>
          <small>当前</small>
          <strong>{phaseText(view)}</strong>
        </span>
        {roundSetup !== undefined && (
          <span className="scoreboard-fact--wide">
            <small>开门</small>
            <strong>
              {seatLabel(roundSetup.opening.wallSeat, view.viewerSeat)}牌墙 · 第{' '}
              {roundSetup.opening.stack + 1} 墩
            </strong>
          </span>
        )}
      </div>

      <div className="scoreboard-list">
        {seats.map((seat) => {
          const player = view.players.find((entry) => entry.seat === seat);
          if (player === undefined) return null;
          const active = activeSeat === seat;
          return (
            <div className={`scoreboard-row${active ? ' scoreboard-row--active' : ''}`} key={seat}>
              <span className="scoreboard-seat">
                <span>{seatLabel(seat, view.viewerSeat)}</span>
                {view.dealerSeat === seat && <span className="scoreboard-dealer">庄</span>}
                {active && <span className="scoreboard-turn">行动</span>}
              </span>
              <span className="scoreboard-fortune">發 {player.fortuneCount}</span>
              <strong className="scoreboard-score">{player.score}</strong>
            </div>
          );
        })}
      </div>

      <p className="scoreboard-footnote">四家分数与发财计数随牌局即时更新</p>
    </section>
  );
}
