import type { GameEventView, Seat } from '../../src/types.ts';
import { eventTypeLabel, formatEventForViewer } from '../uiModel';

interface TableEventRailProps {
  events: readonly GameEventView[];
  viewerSeat: Seat | null;
  live?: boolean;
}

export function TableEventRail({ events, viewerSeat, live = true }: TableEventRailProps) {
  const recentEvents = events.slice(-10).reverse();

  return (
    <section className="table-event-rail" aria-label="牌局动态">
      <header className="event-rail-heading">
        <div>
          <h2>{live ? '牌局动态' : '历史动态'}</h2>
          <span>{live ? '最近动作与响应' : '回放中的动作记录'}</span>
        </div>
        <span className="event-rail-live">
          <span />
          {live ? '实时' : '回放'}
        </span>
      </header>

      <div className="event-rail-list">
        {recentEvents.length > 0 ? (
          recentEvents.map((event, index) => (
            <div
              className={`event-item${index === 0 ? ' event-item--latest' : ''}`}
              key={`${event.type}-${event.seat}-${index}`}
            >
              <span className="event-tag">{eventTypeLabel(event.type)}</span>
              <span className="event-message">{formatEventForViewer(event, viewerSeat)}</span>
            </div>
          ))
        ) : (
          <p className="event-rail-empty">等待牌局事件</p>
        )}
      </div>

      <footer className="event-rail-footer">
        {recentEvents.length > 0 ? `显示最近 ${recentEvents.length} 条` : '开局后记录在这里'}
      </footer>
    </section>
  );
}
