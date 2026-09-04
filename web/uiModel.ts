import { tileLabel, type NormalTile } from '../src/tiles.ts';
import type { GameAction, GameView, Seat } from '../src/types.ts';

export type SeatActivity = 'active' | 'waiting' | 'responded' | 'discarder' | 'idle';

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

export function getSeatActivity(view: GameView, seat: Seat): SeatActivity {
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
