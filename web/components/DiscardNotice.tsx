import { tileLabel } from '../../src/tiles.ts';
import { SEATS, type GameAudienceView } from '../../src/types.ts';
import { getSeatActivity, seatLabel } from '../uiModel';
import { getDiscardPresentation } from '../discardPresentation';
import { MahjongTileFace } from './MahjongTileFace';

interface DiscardNoticeProps {
  view: GameAudienceView;
  isReplaying: boolean;
}

export function DiscardNotice({ view, isReplaying }: DiscardNoticeProps) {
  const discard = getDiscardPresentation(view);
  if (discard === null) return null;
  const pending = view.phase === 'claiming' && view.pendingDiscard !== null;
  const needsResponse = pending && !isReplaying && view.legalActions.length > 0;

  return (
    <div
      className={`discard-notice${needsResponse ? ' discard-notice--attention' : ''}`}
      aria-label="出牌提示"
    >
      <span className="mahjong-tile notice-tile" aria-label={tileLabel(discard.tile)}>
        <MahjongTileFace tile={discard.tile} />
      </span>
      <div className="discard-notice-copy">
        <small>
          {isReplaying ? '回放 · ' : ''}
          {pending ? '待响应出牌' : '最近出牌'}
          {discard.claimedBy !== null &&
            ` · 已被${seatLabel(discard.claimedBy, view.viewerSeat)}${discard.outcome === 'pong' ? '碰' : discard.outcome === 'exposed-kong' ? '杠' : '胡'}`}
        </small>
        <strong>
          {seatLabel(discard.seat, view.viewerSeat)}（{discard.seat + 1}号位）打出{' '}
          {tileLabel(discard.tile)}
        </strong>
      </div>
      {pending && (
        <details className="response-details">
          <summary>响应 {view.pendingDiscard!.respondedSeats.length}/3</summary>
          <ul className="response-progress" aria-label="各家响应进度">
            {SEATS.map((seat) => {
              const activity = getSeatActivity(view, seat);
              return (
                <li className={`response-seat response-seat--${activity}`} key={seat}>
                  {seatLabel(seat, view.viewerSeat)} ·{' '}
                  {activity === 'discarder'
                    ? '出牌者'
                    : activity === 'responded'
                      ? '已响应'
                      : '待响应'}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
