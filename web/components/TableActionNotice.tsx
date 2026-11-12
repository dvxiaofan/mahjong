import { useEffect, useRef, useState } from 'react';
import type { GameAudienceView } from '../../src/types.ts';
import { tileLabel } from '../../src/tiles.ts';
import { seatLabel } from '../uiModel';
import {
  actionNoticeGlyph,
  getTableActionNotice,
  type TableActionNotice as ActionNotice,
} from '../tableFeedback';
import { MahjongTileFace } from './MahjongTileFace';

export const ACTION_NOTICE_MS = 1400;
export const WIN_NOTICE_MS = 2200;

interface TableActionNoticeProps {
  view: GameAudienceView;
  contextKey: string;
  live: boolean;
}

export function TableActionNotice({ view, contextKey, live }: TableActionNoticeProps) {
  const context = `${contextKey}:${view.viewerSeat}:${live}`;
  const previous = useRef({ context, eventCount: view.events.length });
  const [notice, setNotice] = useState<{ context: string; action: ActionNotice } | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { context, eventCount: view.events.length };
    if (before.context !== context || view.events.length < before.eventCount) {
      setNotice(null);
      return;
    }
    if (!live || view.events.length === before.eventCount) return;
    const action = getTableActionNotice(view, before.eventCount);
    if (action !== null) setNotice({ context, action });
  }, [context, live, view]);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(
      () => setNotice(null),
      notice.action.kind === 'win' ? WIN_NOTICE_MS : ACTION_NOTICE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (notice === null || notice.context !== context) return null;
  const action = notice.action;
  return (
    <div
      className={`table-action-notice table-action-notice--${action.kind}`}
      key={action.id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-action-notice={action.kind}
    >
      <span className="table-callout-source">
        {seatLabel(action.seat, view.viewerSeat)}（{action.seat + 1}号位）
      </span>
      <div className="table-callout-face">
        <strong>{actionNoticeGlyph(action.kind)}</strong>
        {action.tile !== null && (
          <span className="mahjong-tile" aria-label={tileLabel(action.tile)}>
            <MahjongTileFace tile={action.tile} />
          </span>
        )}
      </div>
      <span className="table-callout-label">{action.label}</span>
    </div>
  );
}
