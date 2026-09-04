import type { GameEventView } from '../../src/types.ts';

interface EventFeedProps {
  events: readonly GameEventView[];
}

const eventLabels: Record<GameEventView['type'], string> = {
  deal: '起牌',
  draw: '摸牌',
  fortune: '发财',
  'replacement-draw': '补牌',
  discard: '出牌',
  pong: '碰',
  'exposed-kong': '明杠',
  'concealed-kong': '暗杠',
  'supplement-kong': '补杠',
  'mouth-declared': '报嘴',
  win: '胡牌',
  'gang-payment': '杠分',
  'round-draw': '荒庄',
};

export function EventFeed({ events }: EventFeedProps) {
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
                <span className="event-tag">{eventLabels[event.type]}</span>
                <span className="event-message">{event.message}</span>
              </div>
            ))
          : <span className="empty-panel-note">等待牌局事件</span>}
      </div>
    </section>
  );
}
