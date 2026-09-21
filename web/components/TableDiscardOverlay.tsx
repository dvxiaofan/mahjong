import { useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { tileLabel } from '../../src/tiles.ts';
import type { Seat } from '../../src/types.ts';
import type { DiscardPresentation } from '../discardPresentation';
import { DISCARD_FLIGHT_MS, type DiscardDisplayStage } from '../useDiscardDisplay';
import { seatLabel } from '../uiModel';
import { MahjongTileFace } from './MahjongTileFace';

const FLOATING_TILE_WIDTH = 86;
const FLOATING_TILE_HEIGHT = 116;

interface TableDiscardOverlayProps {
  discard: DiscardPresentation;
  stage: DiscardDisplayStage;
  animateArrival: boolean;
  viewerSeat: Seat | null;
  isReplaying: boolean;
  centerRef: RefObject<HTMLDivElement | null>;
  targetRef: RefObject<HTMLSpanElement | null>;
}

export function TableDiscardOverlay({
  discard,
  stage,
  animateArrival,
  viewerSeat,
  isReplaying,
  centerRef,
  targetRef,
}: TableDiscardOverlayProps) {
  const [destination, setDestination] = useState({
    x: 0,
    y: 0,
    scaleX: 22 / FLOATING_TILE_WIDTH,
    scaleY: 29 / FLOATING_TILE_HEIGHT,
  });
  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const target = targetRef.current?.getBoundingClientRect();
      const center = centerRef.current?.getBoundingClientRect();
      if (target !== undefined && center !== undefined) {
        const next = {
          x: target.left + target.width / 2 - center.left,
          y: target.top + target.height / 2 - center.top,
          scaleX: target.width / FLOATING_TILE_WIDTH,
          scaleY: target.height / FLOATING_TILE_HEIGHT,
        };
        setDestination((previous) =>
          Object.keys(next).every(
            (key) => previous[key as keyof typeof next] === next[key as keyof typeof next],
          )
            ? previous
            : next,
        );
      }
      if (stage === 'flying') frame = window.requestAnimationFrame(measure);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    const table = targetRef.current?.closest('.felt-table');
    const observer = new ResizeObserver(schedule);
    if (table !== null && table !== undefined) observer.observe(table);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    measure();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [centerRef, targetRef, stage]);

  const pending = discard.outcome === 'pending';
  return (
    <div
      className="table-discard-overlay"
      data-discard-stage={stage}
      data-discard-source={discard.seat}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={
        {
          '--discard-flight-duration': `${DISCARD_FLIGHT_MS}ms`,
          '--discard-to-x': `${destination.x}px`,
          '--discard-to-y': `${destination.y}px`,
          '--discard-scale-x': destination.scaleX,
          '--discard-scale-y': destination.scaleY,
          '--discard-width': `${FLOATING_TILE_WIDTH}px`,
          '--discard-height': `${FLOATING_TILE_HEIGHT}px`,
        } as CSSProperties
      }
    >
      <span
        className={`mahjong-tile table-discard-tile${animateArrival ? ' table-discard-tile--animated' : ''}`}
        aria-hidden="true"
      >
        <MahjongTileFace tile={discard.tile} />
      </span>
      <div className="table-discard-caption">
        <strong>
          {seatLabel(discard.seat, viewerSeat)}（{discard.seat + 1}号位）打出{' '}
          {tileLabel(discard.tile)}
        </strong>
        <small>
          {isReplaying ? '回放 · ' : ''}
          {pending ? '等待响应' : '无人响应 · 收入弃牌区'}
        </small>
      </div>
    </div>
  );
}
