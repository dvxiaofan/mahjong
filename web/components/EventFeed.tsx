import type { GameEventView } from '../../src/types.ts';
import type { Seat } from '../../src/types.ts';
import { eventTypeLabel, formatEventForViewer } from '../uiModel';

interface EventFeedProps {
  events: readonly GameEventView[];
  viewerSeat: Seat | null;
  live?: boolean;
}

export function EventFeed({ events, viewerSeat, live = true }: EventFeedProps) {
  const recentEvents = events.slice(-8).reverse();
  return (
    <details className="table-disclosure event-disclosure">
      <summary>
        <strong>{live ? '牌局动态' : '历史动态'}</strong>
        <span>
          {recentEvents[0] === undefined
            ? '等待牌局事件'
            : formatEventForViewer(recentEvents[0], viewerSeat)}
        </span>
      </summary>
      <section className="panel event-panel">
        <div className="panel-heading">
          <h2>牌局动态</h2>
          <span className="live-indicator">
            <span />
            {live ? '实时' : '回放'}
          </span>
        </div>
        <div className="event-list">
          {recentEvents.length > 0 ? (
            recentEvents.map((event, index) => (
              <div
                className={`event-item ${index === 0 ? 'event-item--latest' : ''}`}
                key={`${event.type}-${event.seat}-${index}`}
              >
                <span className="event-tag">{eventTypeLabel(event.type)}</span>
                <span className="event-message">{formatEventForViewer(event, viewerSeat)}</span>
              </div>
            ))
          ) : (
            <span className="empty-panel-note">等待牌局事件</span>
          )}
        </div>
      </section>
    </details>
  );
}
