import type { GameAudienceView, GameEventView, Seat } from '../src/types.ts';

const actionLabels = {
  pong: '碰',
  'exposed-kong': '明杠',
  'concealed-kong': '暗杠',
  'supplement-kong': '补杠',
  win: '胡',
} as const;

export interface TableActionNotice {
  id: string;
  seat: Seat;
  kind: keyof typeof actionLabels;
  label: string;
  tile: GameEventView['tile'];
}

/** Read only public action events added after the last observed snapshot. */
export function getTableActionNotice(
  view: GameAudienceView,
  afterEvent: number,
): TableActionNotice | null {
  for (let index = view.events.length - 1; index >= afterEvent; index -= 1) {
    const event = view.events[index];
    if (event === undefined || event.seat === null || !(event.type in actionLabels)) continue;
    const kind = event.type as keyof typeof actionLabels;
    return {
      id: `${index}:${event.seat}:${kind}:${event.tile}`,
      seat: event.seat,
      kind,
      label:
        kind === 'win'
          ? view.result?.winType === 'self-draw'
            ? '自摸胡牌'
            : '胡牌'
          : actionLabels[kind],
      tile: event.tile,
    };
  }
  return null;
}
