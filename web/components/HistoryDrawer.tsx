import { useEffect, useMemo, useState } from 'react';
import type { GameView } from '../../src/types.ts';
import type { ActionSource, RecordedAction } from '../localSession';
import {
  eventTypeLabel,
  formatActionForViewer,
  formatEventForViewer,
  matchesEventFilter,
  type EventFilter,
} from '../uiModel';

interface HistoryDrawerProps {
  open: boolean;
  view: GameView;
  records: readonly RecordedAction[];
  replayStep: number | null;
  onClose: () => void;
  onReplayStep: (step: number) => void;
  onResumeLive: () => void;
}

type HistoryMode = 'events' | 'actions';

const filterLabels: Record<EventFilter, string> = {
  all: '全部',
  flow: '摸打',
  special: '碰杠/报嘴',
  settlement: '结算',
};

const sourceLabels: Record<ActionSource, string> = {
  human: '你的选择',
  bot: 'Bot',
  'auto-pass': '自动过牌',
};

export function HistoryDrawer({
  open,
  view,
  records,
  replayStep,
  onClose,
  onReplayStep,
  onResumeLive,
}: HistoryDrawerProps) {
  const [mode, setMode] = useState<HistoryMode>('events');
  const [filter, setFilter] = useState<EventFilter>('all');
  const currentStep = replayStep ?? records.length;
  const visibleEvents = useMemo(
    () => view.events.filter((event) => matchesEventFilter(event, filter)),
    [filter, view.events],
  );

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        aria-label="牌局记录与回放"
        aria-modal="true"
        className="history-drawer"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="drawer-header">
          <div>
            <p className="panel-eyebrow">ROUND ARCHIVE</p>
            <h2>牌局记录</h2>
            <p>从动作轨迹重建任意一步，不会修改实时牌局。</p>
          </div>
          <button aria-label="关闭牌局记录" className="drawer-close" onClick={onClose} type="button">×</button>
        </header>

        <section className="replay-control" aria-label="回放控制">
          <div className="replay-heading">
            <strong>{replayStep === null ? '实时牌局' : `回放至第 ${currentStep} 步`}</strong>
            <span>{currentStep} / {records.length}</span>
          </div>
          <input
            aria-label="回放步骤"
            disabled={records.length === 0}
            max={records.length}
            min="0"
            onChange={(event) => onReplayStep(Number(event.currentTarget.value))}
            type="range"
            value={currentStep}
          />
          <div className="replay-buttons">
            <button
              disabled={currentStep === 0}
              onClick={() => onReplayStep(currentStep - 1)}
              type="button"
            >上一步</button>
            <button
              disabled={currentStep >= records.length}
              onClick={() => onReplayStep(currentStep + 1)}
              type="button"
            >下一步</button>
            <button
              className="resume-button"
              disabled={replayStep === null}
              onClick={onResumeLive}
              type="button"
            >返回实时</button>
          </div>
        </section>

        <div className="history-mode-tabs" role="tablist" aria-label="记录类型">
          <button
            aria-selected={mode === 'events'}
            className={mode === 'events' ? 'is-active' : ''}
            onClick={() => setMode('events')}
            role="tab"
            type="button"
          >事件 {view.events.length}</button>
          <button
            aria-selected={mode === 'actions'}
            className={mode === 'actions' ? 'is-active' : ''}
            onClick={() => setMode('actions')}
            role="tab"
            type="button"
          >动作 {records.length}</button>
        </div>

        {mode === 'events' && (
          <>
            <div className="history-filters" aria-label="事件筛选">
              {(Object.keys(filterLabels) as EventFilter[]).map((key) => (
                <button
                  className={filter === key ? 'is-active' : ''}
                  key={key}
                  onClick={() => setFilter(key)}
                  type="button"
                >{filterLabels[key]}</button>
              ))}
            </div>
            <div className="history-list">
              {[...visibleEvents].reverse().map((event, reverseIndex) => (
                <article className="history-entry" key={`${event.type}-${event.seat}-${reverseIndex}`}>
                  <span className="history-index">{visibleEvents.length - reverseIndex}</span>
                  <span className="event-tag">{eventTypeLabel(event.type)}</span>
                  <span>{formatEventForViewer(event, view.viewerSeat)}</span>
                </article>
              ))}
              {visibleEvents.length === 0 && <p className="empty-history">当前步骤没有这类事件。</p>}
            </div>
          </>
        )}

        {mode === 'actions' && (
          <div className="history-list action-history-list">
            {records.map((record, index) => {
              const step = index + 1;
              return (
                <button
                  className={[
                    'history-entry',
                    'action-history-entry',
                    step === currentStep ? 'is-current' : '',
                    step > currentStep ? 'is-future' : '',
                  ].filter(Boolean).join(' ')}
                  key={`${record.action.seat}-${record.action.type}-${index}`}
                  onClick={() => onReplayStep(step)}
                  type="button"
                >
                  <span className="history-index">{step}</span>
                  <span>{formatActionForViewer(record.action, view.viewerSeat)}</span>
                  <small>{sourceLabels[record.source]}</small>
                </button>
              );
            })}
            {records.length === 0 && <p className="empty-history">完成第一个动作后，这里会出现动作轨迹。</p>}
          </div>
        )}
      </aside>
    </div>
  );
}
