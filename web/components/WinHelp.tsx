import { useMemo, useState } from 'react';
import { getHandArrangement } from '../../src/rules.ts';
import { tileLabel } from '../../src/tiles.ts';
import type { GameAudienceView } from '../../src/types.ts';
import { fortuneEligibilityText, getWinExplanation, winExplanationCopy } from '../winExplanation';
import { HandGroups } from './HandGroups';
import { MahjongTileFace } from './MahjongTileFace';

interface WinHelpProps {
  view: GameAudienceView;
  isReplaying: boolean;
  actionPending?: boolean;
  actionDisabledReason?: string | undefined;
}

export function WinHelpDetails({
  view,
  isReplaying,
  actionPending = false,
  actionDisabledReason,
}: WinHelpProps) {
  const explanation = useMemo(() => getWinExplanation(view), [view]);
  const arrangement = useMemo(
    () =>
      explanation === null ? null : getHandArrangement(explanation.tiles, explanation.player.melds),
    [explanation],
  );
  if (explanation === null) return null;
  const [headline, detail] = winExplanationCopy(explanation);
  const complete = arrangement?.groups.length === 5 && arrangement.ungrouped.length === 0;
  const context = isReplaying
    ? '这是历史局面的规则说明，返回实时牌局后才能操作。'
    : actionPending
      ? '正在提交操作，请等待牌局确认；下方说明基于当前显示的局面。'
      : actionDisabledReason;

  return (
    <div className="win-help-body">
      {context !== undefined && <p className="win-help-context">{context}</p>}
      <strong className="win-help-headline">{headline}</strong>
      <p>{detail}</p>
      {explanation.candidateTile !== null && (
        <p>
          {explanation.winType === 'self-draw' ? '本次摸牌' : '本次待响应弃牌'}：
          {tileLabel(explanation.candidateTile)}
        </p>
      )}
      <p>{fortuneEligibilityText(explanation.player)}</p>
      {explanation.player.mouthDeclared && (
        <p>报嘴锁定听口：{explanation.player.lockedWaits.map(tileLabel).join('、') || '无'}</p>
      )}
      <div className="win-help-shape" aria-label="我的牌型分析">
        <strong>{complete ? '牌型已组成' : '一种整理方式'}</strong>
        <p>胡牌需要 4 组面子 + 1 对将牌。发财单独计番，不参与组牌。</p>
        {arrangement === null ? (
          <p>当前牌组未通过规则校验，暂无法拆分。</p>
        ) : (
          <>
            {arrangement.groups.length > 0 && <HandGroups groups={arrangement.groups} />}
            {arrangement.ungrouped.length > 0 && (
              <div className="win-help-ungrouped">
                <span>未成组的牌：{arrangement.ungrouped.map(tileLabel).join('、')}</span>
                <div className="win-help-tiles">
                  {arrangement.ungrouped.map((tile, index) => (
                    <span className="mahjong-tile mahjong-tile--compact" key={index}>
                      <MahjongTileFace tile={tile} />
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!complete && <small>展示已组成的牌组及剩余牌，不代表唯一搭配。</small>}
          </>
        )}
      </div>
    </div>
  );
}

export function WinHelp(props: WinHelpProps) {
  const [expanded, setExpanded] = useState(false);
  if (
    props.view.viewerSeat === null ||
    props.view.phase === 'finished' ||
    props.view.phase === 'drawn' ||
    !props.view.players.some(
      (player) => player.seat === props.view.viewerSeat && player.visibility === 'self',
    )
  ) {
    return null;
  }
  return (
    <details className="win-help" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        胡牌条件 <span>查看当前牌型与原因</span>
      </summary>
      {expanded && <WinHelpDetails {...props} />}
    </details>
  );
}
