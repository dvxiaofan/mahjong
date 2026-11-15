import { useEffect, useState } from 'react';
import {
  formatCoachPercent,
  type CoachOpponent,
  type CoachReview,
  type CoachTileRisk,
} from '../../src/coach.ts';
import { tileLabel } from '../../src/tiles.ts';
import { MahjongTileFace } from '../components/MahjongTileFace';
import type { CoachModel, CoachPanelMode } from './useCoach';

interface CoachPanelProps {
  model: CoachModel;
  compact?: boolean;
}

const modeLabels: Record<CoachPanelMode, string> = {
  situation: '局势',
  risk: '出牌风险',
  review: '出牌点评',
};

function RiskFace({ risk }: { risk: CoachTileRisk }) {
  return (
    <span className="coach-risk-face" aria-hidden="true">
      <MahjongTileFace tile={risk.tile} />
    </span>
  );
}

function OpponentRow({ opponent }: { opponent: CoachOpponent }) {
  return (
    <li className={`coach-opponent coach-opponent--${opponent.status}`}>
      <span className="coach-opponent-dot" aria-hidden="true" />
      <span className="coach-opponent-copy">
        <b>{opponent.label}</b>
        <small>
          {opponent.statusText}
          {opponent.meldCount > 0 ? ` · 副露 ${opponent.meldCount} 组` : ''}
        </small>
      </span>
      <strong>
        {opponent.status === 'declared' ? '听牌' : formatCoachPercent(opponent.tenpaiProbability)}
      </strong>
    </li>
  );
}

function RiskRows({ risks, limit }: { risks: readonly CoachTileRisk[]; limit?: number }) {
  const shown = limit === undefined ? risks : risks.slice(0, limit);
  if (shown.length === 0) {
    return <p className="coach-empty">当前没有估算到需要标出的危险牌。</p>;
  }
  return (
    <ol className="coach-risk-list">
      {shown.map((risk) => (
        <li className="coach-risk-row" key={risk.tile}>
          <RiskFace risk={risk} />
          <span className="coach-risk-copy">
            <b>{tileLabel(risk.tile)}</b>
            <small>{risk.reasons[0] ?? '按当前公开信息估算'}</small>
          </span>
          <strong>{formatCoachPercent(risk.probability)}</strong>
        </li>
      ))}
    </ol>
  );
}

function SituationBody({ model }: CoachPanelProps) {
  const noRisk = model.analysis.handRisks.length === 0;
  return (
    <div className="coach-mode coach-mode--situation">
      <div className="coach-section-heading">
        <h3>三家状态</h3>
        <span>听牌概率</span>
      </div>
      <ul className="coach-opponent-list">
        {model.analysis.opponents.map((opponent) => (
          <OpponentRow key={opponent.seat} opponent={opponent} />
        ))}
      </ul>
      <div className="coach-section-heading coach-section-heading--risks">
        <h3>手里最危险</h3>
        <span>按公开信息</span>
      </div>
      {noRisk ? (
        <p className="coach-empty">
          {model.analysis.opponents.every((opponent) => !opponent.canRon)
            ? '三家都没有接炮资格，手里暂时没有危险牌。'
            : '手里暂时没有危险牌。'}
        </p>
      ) : (
        <RiskRows risks={model.analysis.handRisks} limit={3} />
      )}
    </div>
  );
}

function RiskBody({ model }: CoachPanelProps) {
  const opponents = model.analysis.opponents;
  const remaining = model.analysis.handRisks.length - 3;
  const noRon = opponents.every((opponent) => !opponent.canRon);
  return (
    <div className="coach-mode coach-mode--risk">
      <div className="coach-opponent-strip">
        {opponents.map((opponent) => (
          <span
            className={`coach-opponent-mini coach-opponent-mini--${opponent.status}`}
            key={opponent.seat}
          >
            <b>{opponent.label}</b>
            <strong>
              {opponent.status === 'declared'
                ? '报嘴'
                : formatCoachPercent(opponent.tenpaiProbability)}
            </strong>
          </span>
        ))}
      </div>
      <div className="coach-section-heading">
        <h3>这巡打出去后</h3>
        <span>放炮风险</span>
      </div>
      {noRon ? (
        <p className="coach-empty">三家都没有接炮资格，这巡出牌风险为 0。</p>
      ) : (
        <RiskRows risks={model.analysis.handRisks} limit={3} />
      )}
      {remaining > 0 && !noRon && (
        <p className="coach-more-risks">
          其余 {remaining} 种牌均低于 {formatCoachPercent(0.01)}
        </p>
      )}
      <p className="coach-rule-note">现物只是风险较低；本规则没有振听，打过不等于绝对安全。</p>
    </div>
  );
}

function ReviewTile({ tile }: { tile: CoachReview['actual']['tile'] }) {
  return (
    <span className="coach-review-tile">
      <MahjongTileFace tile={tile} />
    </span>
  );
}

function ReviewBody({ review }: { review: CoachReview }) {
  return (
    <div className={`coach-mode coach-mode--review coach-review coach-review--${review.tone}`}>
      <div className="coach-review-head">
        <b>这手怎么样</b>
        <span>保留到你下次出牌</span>
      </div>
      <div className="coach-review-grid">
        <span className="coach-review-label" />
        <span className="coach-review-col">你打的</span>
        <span className="coach-review-col">教练会打</span>

        <span className="coach-review-label">牌</span>
        <span className="coach-review-value">
          <ReviewTile tile={review.actual.tile} />
          {tileLabel(review.actual.tile)}
        </span>
        <span className="coach-review-value">
          <ReviewTile tile={review.coach.tile} />
          {tileLabel(review.coach.tile)}
        </span>

        <span className="coach-review-label">向听</span>
        <span className="coach-review-value coach-review-value--number">
          {review.actual.shanten}
        </span>
        <span className="coach-review-value coach-review-value--number">
          {review.coach.shanten}
        </span>

        <span className="coach-review-label">可见进张</span>
        <span className="coach-review-value coach-review-value--number">
          {review.actual.effectiveTiles}
        </span>
        <span className="coach-review-value coach-review-value--number">
          {review.coach.effectiveTiles}
        </span>

        <span className="coach-review-label">放炮风险</span>
        <span className="coach-review-value coach-review-value--danger">
          {formatCoachPercent(review.actual.risk)}
        </span>
        <span className="coach-review-value coach-review-value--safe">
          {formatCoachPercent(review.coach.risk)}
        </span>
      </div>
      <p className="coach-review-summary">{review.summary}</p>
      <p className="coach-rule-note">
        只有一种合法出牌时不显示教练候选；先看风险，再决定是否打出。
      </p>
    </div>
  );
}

export function CoachPanel({ model, compact = false }: CoachPanelProps) {
  const [open, setOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 1279px)').matches,
  );
  const [reviewView, setReviewView] = useState<'review' | 'risk'>('review');
  useEffect(() => {
    setReviewView('review');
  }, [model.review]);

  const canSwitchToRisk = model.review !== null && model.canDiscard;
  const shownMode: CoachPanelMode =
    model.review !== null
      ? canSwitchToRisk && reviewView === 'risk'
        ? 'risk'
        : 'review'
      : model.mode;

  if (compact) {
    if (model.review === null) return null;
    return (
      <section className="coach-panel coach-panel--compact" aria-labelledby="coach-result-title">
        <header className="coach-panel-head">
          <div className="coach-title-group">
            <h2 id="coach-result-title">教练点评</h2>
            <span className="coach-mode-chip coach-mode-chip--review">上一步</span>
          </div>
        </header>
        <div className="coach-compact-body">
          <span className="coach-compact-tiles">
            <ReviewTile tile={model.review.actual.tile} />
            <ReviewTile tile={model.review.coach.tile} />
          </span>
          <p>{model.review.summary}</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={`coach-panel${open ? ' coach-panel--open' : ''}`}
      aria-labelledby="coach-title"
    >
      <header className="coach-panel-head">
        <div className="coach-title-group">
          <h2 id="coach-title">教练</h2>
          <span className={`coach-mode-chip coach-mode-chip--${shownMode}`}>
            {modeLabels[shownMode]}
          </span>
        </div>
        <span className="coach-local-chip">本地</span>
        <button
          aria-controls="coach-panel-body"
          aria-expanded={open}
          aria-label={open ? '收起教练面板' : '展开教练面板'}
          className="coach-collapse"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {open ? '−' : '+'}
        </button>
      </header>
      {open && (
        <div className="coach-panel-body" id="coach-panel-body">
          {model.notice !== null && <p className="coach-notice">{model.notice}</p>}
          {canSwitchToRisk && (
            <div className="coach-view-tabs" role="group" aria-label="教练内容">
              <button
                aria-pressed={reviewView === 'review'}
                onClick={() => setReviewView('review')}
                type="button"
              >
                上步点评
              </button>
              <button
                aria-pressed={reviewView === 'risk'}
                onClick={() => setReviewView('risk')}
                type="button"
              >
                本巡风险
              </button>
            </div>
          )}
          {shownMode === 'review' && model.review !== null ? (
            <ReviewBody review={model.review} />
          ) : shownMode === 'risk' ? (
            <RiskBody model={model} />
          ) : (
            <SituationBody model={model} />
          )}
        </div>
      )}
      <footer className="coach-panel-foot">
        概率按当前 AI 难度与公开信息估算；对真人打法不保证。
      </footer>
    </section>
  );
}
