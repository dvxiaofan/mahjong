import { canDeclareMouth, getWinBlockReason, type WinBlockReason } from '../src/rules.ts';
import type { NormalTile } from '../src/tiles.ts';
import type { GameAudienceView, PlayerView, WinType } from '../src/types.ts';

export type WinExplanationStatus =
  | WinBlockReason
  | 'can-win'
  | 'waiting-draw'
  | 'waiting-replacement'
  | 'other-turn'
  | 'own-discard'
  | 'already-responded'
  | 'no-drawn-tile'
  | 'missing-candidate';

export interface WinExplanation {
  status: WinExplanationStatus;
  player: PlayerView;
  /** Own tiles plus the public candidate, exactly once. */
  tiles: readonly NormalTile[];
  candidateTile: NormalTile | null;
  winType: WinType | null;
  canDeclareMouth: boolean;
}

/** Uses only the privacy projection, including in replay where legal actions are removed. */
export function getWinExplanation(view: GameAudienceView): WinExplanation | null {
  if (view.viewerSeat === null || view.phase === 'finished' || view.phase === 'drawn') return null;
  const player = view.players.find(
    (entry): entry is PlayerView => entry.seat === view.viewerSeat && entry.visibility === 'self',
  );
  if (player === undefined) return null;

  let before = [...player.concealedTiles];
  const result: WinExplanation = {
    status: 'missing-candidate',
    player,
    tiles: before,
    candidateTile: null,
    winType: null,
    canDeclareMouth: false,
  };

  if (view.phase === 'claiming') {
    const pending = view.pendingDiscard;
    if (pending === null) return result;
    if (pending.discarder === player.seat) return { ...result, status: 'own-discard' };
    result.candidateTile = pending.tile;
    result.winType = 'discard';
    result.tiles = [...before, pending.tile];
    if (pending.respondedSeats.includes(player.seat)) {
      return { ...result, status: 'already-responded' };
    }
  } else {
    if (view.currentSeat !== player.seat) return { ...result, status: 'other-turn' };
    if (view.phase === 'awaiting-draw') {
      return {
        ...result,
        status: view.drawMode === 'replacement' ? 'waiting-replacement' : 'waiting-draw',
      };
    }
    if (view.lastDrawnTile === null) return { ...result, status: 'no-drawn-tile' };
    const index = before.lastIndexOf(view.lastDrawnTile);
    if (index < 0) return result;
    before = before.filter((_, tileIndex) => tileIndex !== index);
    result.candidateTile = view.lastDrawnTile;
    result.winType = 'self-draw';
  }

  result.status =
    getWinBlockReason(before, player.melds, player, result.candidateTile, result.winType) ??
    'can-win';
  if (result.status === 'mouth-required') {
    result.canDeclareMouth = canDeclareMouth(
      before,
      player.melds,
      player.fortuneCount,
      player.mouthDeclared,
    );
  }
  return result;
}

export function winExplanationCopy(explanation: WinExplanation): [string, string] {
  switch (explanation.status) {
    case 'can-win':
      return [
        explanation.winType === 'self-draw' ? '已满足自摸条件' : '已满足接炮条件',
        explanation.winType === 'self-draw' && explanation.player.mouthDeclared
          ? '报嘴后自摸到锁定听口，必须胡牌。'
          : '这张牌能组成四组面子和一对将牌，胡牌资格也已满足。',
      ];
    case 'incomplete-hand':
      return ['牌型还未组成', '加入这张牌后，仍不能组成四组面子和一对将牌。'];
    case 'no-fortune':
      return ['没有发财，只能自摸', '接炮至少需要一张发财；即使牌型已经组成，也不能胡别人的弃牌。'];
    case 'outside-locked-waits':
      return ['这张牌不在报嘴听口内', '报嘴后只能胡当时锁定的听口，不能改用其他牌成胡。'];
    case 'mouth-required':
      return [
        '接炮前需要先报嘴',
        explanation.canDeclareMouth
          ? '当前已经听牌，可以在这次响应中先报嘴，再选择胡这张弃牌。'
          : '尚未满足报嘴条件；仍可等待自摸，接炮前必须完成报嘴。',
      ];
    case 'waiting-draw':
      return ['本回合还没摸牌', '先完成本回合摸牌，再判断这张摸牌能否自摸。'];
    case 'waiting-replacement':
      return ['正在等待补牌', '杠后需要先从牌墙尾部补牌，完成摸牌后才能判断能否自摸。'];
    case 'other-turn':
      return ['当前轮到其他玩家', '现在没有可供你胡牌的新摸牌或待响应弃牌。'];
    case 'own-discard':
      return ['这是你自己打出的牌', '不能胡自己的弃牌，正在等待其他玩家响应。'];
    case 'already-responded':
      return [
        '这张弃牌已经响应过了',
        '同一张弃牌只能响应一次，不能再次改选胡牌；请等待本轮响应结果。',
      ];
    case 'no-drawn-tile':
      return ['当前没有可自摸的摸牌', '碰牌后需要先出牌；自摸必须使用本回合刚摸到的牌。'];
    case 'missing-candidate':
      return ['暂无法判断这次胡牌', '当前局面缺少对应的摸牌或弃牌信息。'];
  }
}

export function fortuneEligibilityText(player: PlayerView): string {
  const count = `你有 ${player.fortuneCount} 张发财`;
  if (player.fortuneCount < 1) return `${count}：只能自摸，不能接炮。`;
  if (player.mouthDeclared) return `${count}，已报嘴：只能胡锁定听口，自摸成胡必须胡。`;
  if (player.fortuneCount >= 3 || player.mouthRequired) {
    return `${count}，尚未报嘴：可以自摸，接炮须先报嘴。`;
  }
  return `${count}：牌型组成后，可以自摸或接炮。`;
}
