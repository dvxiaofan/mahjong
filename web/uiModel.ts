import { tileLabel, type NormalTile } from '../src/tiles.ts';
import type { GameAction, GameAudienceView, GameEventView, Seat } from '../src/types.ts';

export type SeatActivity = 'active' | 'waiting' | 'responded' | 'discarder' | 'idle';
export type EventFilter = 'all' | 'flow' | 'special' | 'settlement';

const actionNames: Record<GameAction['type'], string> = {
  draw: '摸牌',
  discard: '打出',
  win: '胡牌',
  pass: '过牌',
  pong: '碰',
  'exposed-kong': '明杠',
  'concealed-kong': '暗杠',
  'supplement-kong': '补杠',
  'declare-mouth': '报嘴',
};

const eventNames: Record<GameEventView['type'], string> = {
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

export function eventTypeLabel(type: GameEventView['type']): string {
  return eventNames[type];
}

export function seatLabel(seat: Seat, viewerSeat: Seat | null): string {
  if (viewerSeat === null) return `${seat + 1}号玩家`;
  const delta = (seat - viewerSeat + 4) % 4;
  if (delta === 0) return '你';
  if (delta === 1) return '下家';
  if (delta === 2) return '对家';
  return '上家';
}

export function formatEventForViewer(event: GameEventView, viewerSeat: Seat | null): string {
  if (event.seat === null) return event.message;
  const prefix = `${event.seat}号玩家`;
  const readable = seatLabel(event.seat, viewerSeat);
  return event.message.includes(prefix)
    ? event.message.replace(prefix, readable)
    : `${readable}：${event.message}`;
}

export function formatActionForViewer(action: GameAction, viewerSeat: Seat | null): string {
  const actor = seatLabel(action.seat, viewerSeat);
  return 'tile' in action
    ? `${actor}${actionNames[action.type]} ${tileLabel(action.tile)}`
    : `${actor}${actionNames[action.type]}`;
}

export function matchesEventFilter(event: GameEventView, filter: EventFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'flow') {
    return ['deal', 'draw', 'replacement-draw', 'discard'].includes(event.type);
  }
  if (filter === 'special') {
    return [
      'fortune',
      'pong',
      'exposed-kong',
      'concealed-kong',
      'supplement-kong',
      'mouth-declared',
    ].includes(event.type);
  }
  return ['win', 'gang-payment', 'round-draw'].includes(event.type);
}

export function findDiscardAction(
  actions: readonly GameAction[],
  tile: NormalTile,
): Extract<GameAction, { type: 'discard' }> | null {
  const action = actions.find(
    (candidate): candidate is Extract<GameAction, { type: 'discard' }> =>
      candidate.type === 'discard' && candidate.tile === tile,
  );
  return action ?? null;
}

export function getSeatActivity(view: GameAudienceView, seat: Seat): SeatActivity {
  if (view.phase === 'finished' || view.phase === 'drawn') return 'idle';

  if (view.phase === 'claiming' && view.pendingDiscard !== null) {
    if (seat === view.pendingDiscard.discarder) return 'discarder';
    return view.pendingDiscard.respondedSeats.includes(seat) ? 'responded' : 'waiting';
  }

  return view.currentSeat === seat ? 'active' : 'idle';
}

export function getSeatActivityLabel(
  view: GameAudienceView,
  seat: Seat,
  isReplaying = false,
): string | undefined {
  const activity = getSeatActivity(view, seat);
  if (activity === 'active') return view.phase === 'awaiting-draw' ? '待摸牌' : '待出牌';
  if (activity === 'discarder') return '出牌者';
  if (activity === 'responded') return '已响应';
  if (activity === 'waiting') {
    return seat === view.viewerSeat && !isReplaying && view.legalActions.length > 0
      ? '等你响应'
      : '待响应';
  }
  return undefined;
}

export interface LatestDiscard {
  seat: Seat;
  tile: NormalTile;
  eventIndex: number;
}

/** Only public discard events may supply the most recent played tile. */
export function getLatestDiscard(view: GameAudienceView): LatestDiscard | null {
  let latest: LatestDiscard | null = null;
  for (let eventIndex = view.events.length - 1; eventIndex >= 0; eventIndex -= 1) {
    const event = view.events[eventIndex]!;
    if (event.type === 'discard' && event.seat !== null && event.tile !== null) {
      latest = { seat: event.seat, tile: event.tile, eventIndex };
      break;
    }
  }
  const pending = view.phase === 'claiming' ? view.pendingDiscard : null;
  if (pending !== null) {
    return {
      seat: pending.discarder,
      tile: pending.tile,
      eventIndex:
        latest?.seat === pending.discarder && latest.tile === pending.tile ? latest.eventIndex : -1,
    };
  }
  return latest;
}

export function getTurnLabel(view: GameAudienceView): string {
  if (view.phase === 'finished') return '本局已结束';
  if (view.phase === 'drawn') return '本局荒庄';
  if (view.phase === 'claiming') return '等待各家响应';
  return `${seatLabel(view.currentSeat, view.viewerSeat)}${view.phase === 'awaiting-draw' ? '摸牌' : '出牌'}`;
}

export function getInteractionPrompt(
  view: GameAudienceView,
  botThinking: boolean,
  confirmDiscard = false,
): string {
  if (view.viewerSeat === null) return `正在观战 · ${getTurnLabel(view)}`;
  if (view.phase === 'finished') return '本局已经结束，可查看结算或重新发牌';
  if (view.phase === 'drawn') return '牌墙耗尽，本局荒庄';

  if (view.phase === 'claiming' && view.pendingDiscard !== null) {
    const pending = view.pendingDiscard;
    const source = `${seatLabel(pending.discarder, view.viewerSeat)}打出的 ${tileLabel(pending.tile)}`;
    if (view.legalActions.length > 0) return `请响应${source}`;
    if (pending.discarder === view.viewerSeat) return '你已出牌，等待其他玩家响应';
    if (pending.respondedSeats.includes(view.viewerSeat)) return '你已响应，等待其他玩家';
    return `等待各家响应${source}`;
  }

  if (view.legalActions.length > 0) {
    if (view.legalActions.some((action) => action.type === 'win')) {
      return '可以胡牌，请选择胡牌或继续当前操作';
    }
    if (view.legalActions.some((action) => action.type === 'draw')) {
      return '轮到你摸牌';
    }
    if (view.legalActions.some((action) => action.type === 'discard')) {
      return confirmDiscard ? '轮到你出牌，选牌后按“打出”确认' : '轮到你出牌，直接点击一张手牌';
    }
    return '请选择一个可用动作';
  }

  return `等待${getTurnLabel(view)}${botThinking ? '…' : ''}`;
}

export function nonDiscardActions(actions: readonly GameAction[]): GameAction[] {
  return actions.filter((action) => action.type !== 'discard');
}
