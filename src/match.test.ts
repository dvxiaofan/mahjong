import { describe, expect, it } from 'vitest';
import {
  applyMatchAction,
  calculateWallOpening,
  createMatch,
  selectInitialDealer,
  startNextRound,
} from './match.js';

const winningBeforeSelfDraw = [
  'm1',
  'm1',
  'm1',
  'm2',
  'm2',
  'm2',
  'm3',
  'm3',
  'm3',
  'p1',
  'p1',
  'p1',
  's1',
] as const;

function makeCurrentDealerWin(match: ReturnType<typeof createMatch>) {
  const seat = match.dealerSeat;
  match.game.currentSeat = seat;
  match.game.phase = 'awaiting-discard';
  match.game.lastDrawnTile = 's1';
  match.game.players[seat]!.concealedTiles = [...winningBeforeSelfDraw, 's1'];
  match.game.players[seat]!.fortuneCount = 0;
  match.game.players[seat]!.melds = [];
  match.game.players.forEach((player) => {
    player.score = 0;
  });
  return applyMatchAction(match, { type: 'win', seat });
}

describe('多局会话层', () => {
  it('同一种子生成相同庄家、骰子、开门位置和牌墙', () => {
    const first = createMatch({ seed: 20260905 });
    const second = createMatch({ seed: 20260905 });
    expect(second.dealerSelection).toEqual(first.dealerSelection);
    expect(second.opening).toEqual(first.opening);
    expect(second.game.wall.tiles).toEqual(first.game.wall.tiles);
  });

  it('首局四家比骰，并列最高时只由并列者继续加赛', () => {
    const dice = [6, 6, 6, 6, 2, 2, 1, 1, 3, 3, 5, 5];
    let index = 0;
    const selection = selectInitialDealer(() => ((dice[index++] ?? 1) - 0.5) / 6);

    expect(selection.dealerSeat).toBe(1);
    expect(selection.winningRoll).toEqual([5, 5]);
    expect(selection.rounds).toHaveLength(2);
    expect(selection.rounds[0]?.candidates).toEqual([0, 1, 2, 3]);
    expect(selection.rounds[1]?.candidates).toEqual([0, 1]);
  });

  it('骰子按每边15墩映射到确定开门偏移', () => {
    expect(calculateWallOpening(0, [3, 4])).toEqual({
      rollerSeat: 0,
      dice: [3, 4],
      total: 7,
      wallSeat: 2,
      stack: 6,
      tileOffset: 72,
    });
  });

  it('终局累计分数并由赢家成为下一局庄家', () => {
    let match = createMatch({ seed: 1, maxRounds: 2, dealerSeat: 0 });
    match = makeCurrentDealerWin(match);
    expect(match.phase).toBe('between-rounds');
    expect(match.history).toHaveLength(1);
    expect(match.cumulativeScores).toEqual([6, -2, -2, -2]);

    match = startNextRound(match);
    expect(match.roundNumber).toBe(2);
    expect(match.dealerSeat).toBe(0);
    expect(match.game.players.map((player) => player.score)).toEqual([0, 0, 0, 0]);
    expect(match.cumulativeScores).toEqual([6, -2, -2, -2]);

    match = makeCurrentDealerWin(match);
    expect(match.phase).toBe('finished');
    expect(match.history).toHaveLength(2);
  });

  it('荒庄默认原庄保留，也可配置为轮庄', () => {
    for (const policy of ['stay', 'rotate'] as const) {
      let match = createMatch({ seed: 2, maxRounds: 2, dealerSeat: 1, drawDealerPolicy: policy });
      match.game.currentSeat = 1;
      match.game.phase = 'awaiting-draw';
      match.game.drawMode = 'normal';
      match.game.wall.drawIndex = 1;
      match.game.wall.replacementIndex = 0;
      match = applyMatchAction(match, { type: 'draw', seat: 1 });
      expect(match.phase).toBe('between-rounds');
      match = startNextRound(match);
      expect(match.dealerSeat).toBe(policy === 'stay' ? 1 : 2);
    }
  });

  it('局间和比赛结束后不能继续提交单局动作', () => {
    let match = createMatch({ seed: 3, maxRounds: 1, dealerSeat: 0 });
    match = makeCurrentDealerWin(match);
    expect(match.phase).toBe('finished');
    expect(() => applyMatchAction(match, { type: 'draw', seat: 0 })).toThrow(
      '当前不在进行中的牌局',
    );
    expect(() => startNextRound(match)).toThrow('当前不能开始下一局');
  });
});
