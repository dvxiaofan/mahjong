import { tileLabel, type NormalTile } from '../src/tiles.ts';
import type { GameAction, GameAudienceView, GameEventView, GameView, Seat } from '../src/types.ts';

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

export function getInteractionPrompt(view: GameView, botThinking: boolean): string {
  if (view.phase === 'finished') return '本局已经结束，可查看结算或重新发牌';
  if (view.phase === 'drawn') return '牌墙耗尽，本局荒庄';

  if (view.legalActions.length > 0) {
    if (view.phase === 'claiming' && view.pendingDiscard !== null) {
      return `请响应 ${tileLabel(view.pendingDiscard.tile)}`;
    }
    if (view.legalActions.some((action) => action.type === 'win')) {
      return '可以胡牌，请选择胡牌或继续当前操作';
    }
    if (view.legalActions.some((action) => action.type === 'draw')) {
      return '轮到你摸牌';
    }
    if (view.legalActions.some((action) => action.type === 'discard')) {
      return '轮到你出牌，直接点击一张手牌';
    }
    return '请选择一个可用动作';
  }

  if (botThinking) return '对手正在思考…';
  if (view.phase === 'claiming') return '等待其他玩家响应…';
  return `等待 ${view.currentSeat + 1} 号玩家行动`;
}

export function nonDiscardActions(actions: readonly GameAction[]): GameAction[] {
  return actions.filter((action) => action.type !== 'discard');
}
