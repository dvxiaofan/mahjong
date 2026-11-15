import type { Seat } from '../src/types.ts';
import type { RecordedAction } from './localSession';
import { formatActionForViewer } from './uiModel';

export type ReplayMarkerKind = 'mouth' | 'pong' | 'kong' | 'win';

export interface ReplayMarker {
  key: string;
  kind: ReplayMarkerKind;
  step: number;
  beforeStep: number;
  afterStep: number;
  seat: Seat;
  label: string;
  actionText: string;
}

const kindLabels: Record<ReplayMarkerKind, string> = {
  mouth: '报嘴',
  pong: '碰牌',
  kong: '杠牌',
  win: '胡牌',
};

function markerKind(action: RecordedAction['action']): ReplayMarkerKind | null {
  if (action.type === 'declare-mouth') return 'mouth';
  if (action.type === 'pong') return 'pong';
  if (action.type === 'win') return 'win';
  if (
    action.type === 'exposed-kong' ||
    action.type === 'concealed-kong' ||
    action.type === 'supplement-kong'
  ) {
    return 'kong';
  }
  return null;
}

export function buildReplayMarkers(
  records: readonly RecordedAction[],
  viewerSeat: Seat,
): readonly ReplayMarker[] {
  return records.flatMap((record, index) => {
    const kind = markerKind(record.action);
    if (kind === null) return [];
    const step = index + 1;
    return [
      {
        key: `${kind}-${step}-${record.action.seat}`,
        kind,
        step,
        beforeStep: step - 1,
        afterStep: step,
        seat: record.action.seat,
        label: kindLabels[kind],
        actionText: formatActionForViewer(record.action, viewerSeat),
      },
    ];
  });
}
