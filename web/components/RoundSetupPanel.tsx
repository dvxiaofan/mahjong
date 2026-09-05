import type { DealerSelection, DicePair, WallOpening } from '../../src/match.ts';
import type { Seat } from '../../src/types.ts';
import { seatLabel } from '../uiModel';

export type RoundDealerReason =
  'initial-dice' | 'previous-winner' | 'draw-stay' | 'draw-rotate' | 'assigned';

export interface RoundSetupView {
  roundNumber: number;
  dealerReason: RoundDealerReason;
  dealerSelection: DealerSelection | null;
  opening: WallOpening;
}

interface RoundSetupPanelProps extends RoundSetupView {
  viewerSeat: Seat | null;
}

const diceGlyphs = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;

const dealerReasonLabels: Record<RoundDealerReason, string> = {
  'initial-dice': '比骰最高，成为首庄',
  'previous-winner': '上局赢家接庄',
  'draw-stay': '上局荒庄，原庄留庄',
  'draw-rotate': '上局荒庄，按设置轮庄',
  assigned: '本局指定庄家',
};

function diceTotal(dice: DicePair): number {
  return dice[0] + dice[1];
}

function DicePairView({ dice }: { dice: DicePair }) {
  return (
    <span className="dice-pair" aria-label={`${dice[0]}点和${dice[1]}点`}>
      <span className="dice-face" aria-hidden="true">
        {diceGlyphs[dice[0] - 1]}
      </span>
      <span className="dice-face" aria-hidden="true">
        {diceGlyphs[dice[1] - 1]}
      </span>
      <strong>{diceTotal(dice)} 点</strong>
    </span>
  );
}

export function RoundSetupPanel({
  roundNumber,
  dealerReason,
  dealerSelection,
  opening,
  viewerSeat,
}: RoundSetupPanelProps) {
  const showDealerRolls = dealerReason === 'initial-dice' && dealerSelection !== null;
  const dealerName = seatLabel(opening.rollerSeat, viewerSeat);

  return (
    <section className="round-setup-panel" aria-label="本局定庄与开门信息">
      <header className="round-setup-heading">
        <div>
          <p className="panel-eyebrow">ROUND SETUP</p>
          <h2>{roundNumber === 1 ? '首局定庄' : `第 ${roundNumber} 局`}</h2>
        </div>
        <span className="dealer-result">
          <b>庄</b>
          {dealerName}
        </span>
      </header>

      {showDealerRolls ? (
        <div className="dealer-rolls">
          {dealerSelection.rounds.map((round, roundIndex) => (
            <div className="dealer-roll-round" key={roundIndex}>
              <span className="dice-round-label">
                {roundIndex === 0 ? '首轮比骰' : `第 ${roundIndex + 1} 轮 · 并列加赛`}
              </span>
              <div className="dealer-roll-grid">
                {round.candidates.map((seat) => {
                  const dice = round.rolls[seat];
                  if (dice === undefined) return null;
                  const isWinner =
                    roundIndex === dealerSelection.rounds.length - 1 &&
                    seat === dealerSelection.dealerSeat;
                  return (
                    <span className={isWinner ? 'dealer-roll is-winner' : 'dealer-roll'} key={seat}>
                      <small>{seatLabel(seat, viewerSeat)}</small>
                      <DicePairView dice={dice} />
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="dealer-reason-copy">{dealerReasonLabels[dealerReason]}</p>
      )}

      <div className="opening-summary">
        <span>
          <small>{dealerReasonLabels[dealerReason]}</small>
          <strong>{dealerName}坐庄</strong>
        </span>
        <span className="opening-dice">
          <small>本局开门骰</small>
          <DicePairView dice={opening.dice} />
        </span>
        <span>
          <small>开门位置</small>
          <strong>
            {seatLabel(opening.wallSeat, viewerSeat)}牌墙 · 第 {opening.stack + 1} 墩
          </strong>
        </span>
      </div>
    </section>
  );
}
