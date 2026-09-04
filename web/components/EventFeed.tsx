import type { GameEventView } from '../../src/types.ts';
import type { Seat } from '../../src/types.ts';
import { eventTypeLabel, formatEventForViewer } from '../uiModel';

interface EventFeedProps {
  events: readonly GameEventView[];
  viewerSeat: Seat | null;
}

export function EventFeed({ events, viewerSeat }: EventFeedProps) {
  const recentEvents = events.slice(-8).reverse();
  return (
    <section className="panel event-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-eyebrow">LIVE LOG</p>
          <h2>牌局动态</h2>
        </div>
        <span className="live-indicator"><span />实时</span>
      </div>
      <div className="event-list">
        {recentEvents.length > 0
          ? recentEvents.map((event, index) => (
              <div
                className={`event-item ${index === 0 ? 'event-item--latest' : ''}`}
                key={`${event.type}-${event.seat}-${index}`}
              >
                <span className="event-tag">{eventTypeLabel(event.type)}</span>
                <span className="event-message">{formatEventForViewer(event, viewerSeat)}</span>
              </div>
            ))
          : <span className="empty-panel-note">等待牌局事件</span>}
      </div>
    </section>
  );
}
