import { tileLabel } from '../../src/tiles.ts';
import type { GameView, Payment } from '../../src/types.ts';

interface ResultPanelProps {
  view: GameView;
  onReset: () => void;
}

const paymentLabels: Record<Payment['reason'], string> = {
  win: '胡牌',
  'supplement-kong': '补杠',
  'concealed-kong': '暗杠',
  'exposed-kong': '明杠',
};

function playerLabel(seat: number, viewerSeat: number): string {
  return seat === viewerSeat ? '你' : `${seat + 1}号玩家`;
}

export function ResultPanel({ view, onReset }: ResultPanelProps) {
  const result = view.result;
  if (result === null) return null;

  const winnerLabel = result.winner === null
    ? null
    : playerLabel(result.winner, view.viewerSeat);
  const title = result.outcome === 'draw'
    ? '本局荒庄'
    : result.winner === view.viewerSeat
      ? '恭喜，你胡了！'
      : `${winnerLabel}胡牌`;
  const subtitle = result.outcome === 'draw'
    ? '牌墙已经耗尽，本局杠分全部作废。'
    : `${result.winType === 'self-draw' ? '自摸' : '点炮'}${result.reason === 'gang-draw' ? ' · 杠上开花' : ''}${result.winningTile === null ? '' : ` · ${tileLabel(result.winningTile)}`}`;

  return (
    <section className="result-panel" aria-live="assertive">
      <div className="result-copy">
        <p className="panel-eyebrow">ROUND RESULT</p>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      {result.fan !== null && (
        <div className="result-block">
          <span className="result-label">番数</span>
          <strong className="result-total">{result.fan.total} 番</strong>
          <div className="fan-list">
            {result.fan.items.length > 0
              ? result.fan.items.map((item) => (
                  <span className="fan-chip" key={item.name}>{item.name} +{item.fan}</span>
                ))
              : <span className="empty-note">无额外番种</span>}
          </div>
        </div>
      )}

      <div className="result-block">
        <span className="result-label">本局得分</span>
        <div className="score-grid">
          {view.players.map((player) => (
            <span key={player.seat}>
              <small>{playerLabel(player.seat, view.viewerSeat)}</small>
              <strong className={player.score > 0 ? 'score-positive' : player.score < 0 ? 'score-negative' : ''}>
                {player.score > 0 ? '+' : ''}{player.score}
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
              {playerLabel(payment.from, view.viewerSeat)} → {playerLabel(payment.to, view.viewerSeat)} · {paymentLabels[payment.reason]} {payment.amount} 分
            </span>
          ))}
        </div>
      )}

      <button className="result-button" onClick={onReset} type="button">再来一局</button>
    </section>
  );
}
