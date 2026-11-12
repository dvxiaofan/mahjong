import { tileLabel } from '../../src/tiles.ts';
import type { GameAudienceView, Payment } from '../../src/types.ts';
import { seatLabel } from '../uiModel';
import { getWinningHandGroups } from '../../src/rules.ts';
import { HandGroups } from './HandGroups';

interface ResultPanelProps {
  view: GameAudienceView;
  onReset: () => void;
  resetLabel?: string;
  resetDisabled?: boolean;
}

const paymentLabels: Record<Payment['reason'], string> = {
  win: '胡牌',
  'supplement-kong': '补杠',
  'concealed-kong': '暗杠',
  'exposed-kong': '明杠',
};

export function ResultPanel({
  view,
  onReset,
  resetLabel = '再来一局',
  resetDisabled = false,
}: ResultPanelProps) {
  const result = view.result;
  if (result === null) return null;

  const winnerLabel = result.winner === null ? null : seatLabel(result.winner, view.viewerSeat);
  const winner = view.players.find((player) => player.seat === result.winner);
  const groups =
    result.outcome === 'win' && winner !== undefined && 'concealedTiles' in winner
      ? getWinningHandGroups(winner.concealedTiles, winner.melds)
      : null;
  const title =
    result.outcome === 'draw'
      ? '本局荒庄'
      : result.winner === view.viewerSeat
        ? '恭喜，你胡了！'
        : `${winnerLabel}胡牌`;
  const subtitle =
    result.outcome === 'draw'
      ? '牌墙已经耗尽，本局杠分全部作废。'
      : `${result.winType === 'self-draw' ? '自摸' : '点炮'}${result.reason === 'gang-draw' ? ' · 杠上开花' : ''}${result.winningTile === null ? '' : ` · ${tileLabel(result.winningTile)}`}`;

  return (
    <section className="result-panel" aria-live="assertive">
      <div className="result-copy">
        <h2>{title}</h2>
        <p>{subtitle}</p>
        {result.outcome === 'win' && (
          <p className="showdown-note">四家手牌已亮出，胡牌张在赢家手牌末尾标出。</p>
        )}
      </div>

      {result.fan !== null && (
        <div className="result-block">
          <span className="result-label">番数</span>
          <strong className="result-total">{result.fan.total} 番</strong>
          <div className="fan-list">
            {result.fan.items.length > 0 ? (
              result.fan.items.map((item) => (
                <span className="fan-chip" key={item.name}>
                  {item.name} +{item.fan}
                </span>
              ))
            ) : (
              <span className="empty-note">无额外番种</span>
            )}
          </div>
        </div>
      )}

      <div className="result-block">
        <span className="result-label">本局得分</span>
        <div className="score-grid">
          {view.players.map((player) => (
            <span key={player.seat}>
              <small>{seatLabel(player.seat, view.viewerSeat)}</small>
              <strong
                className={
                  player.score > 0 ? 'score-positive' : player.score < 0 ? 'score-negative' : ''
                }
              >
                {player.score > 0 ? '+' : ''}
                {player.score}
              </strong>
            </span>
          ))}
        </div>
      </div>

      {result.payments.length > 0 && (
        <div className="result-block payment-summary">
          <span className="result-label">支付流水</span>
          {result.payments.map((payment, index) => (
            <span key={`${payment.from}-${payment.to}-${payment.reason}-${index}`}>
              {seatLabel(payment.from, view.viewerSeat)} → {seatLabel(payment.to, view.viewerSeat)}{' '}
              · {paymentLabels[payment.reason]} {payment.amount} 分
            </span>
          ))}
        </div>
      )}

      <button className="result-button" disabled={resetDisabled} onClick={onReset} type="button">
        {resetLabel}
      </button>
      {groups !== null && (
        <div className="winning-hand-explanation" aria-label="胡牌牌型拆解">
          <div className="hand-explanation-heading">
            <strong>{winnerLabel}的胡牌组成</strong>
            <span>4 组面子 + 1 对将牌</span>
          </div>
          <HandGroups groups={groups} />
          <small>顺子是同一门的连续三张，刻子是三张同牌；每副碰或杠算一组面子。</small>
        </div>
      )}
    </section>
  );
}
