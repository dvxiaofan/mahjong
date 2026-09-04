import { tileLabel } from '../../src/tiles.ts';
import type { GameAction } from '../../src/types.ts';
import { nonDiscardActions } from '../uiModel';

interface ActionBarProps {
  actions: readonly GameAction[];
  botThinking: boolean;
  isReplaying: boolean;
  prompt: string;
  onAction: (action: GameAction) => void;
}

const actionNames: Record<GameAction['type'], string> = {
  draw: '摸牌',
  discard: '出牌',
  win: '胡牌',
  pass: '过',
  pong: '碰',
  'exposed-kong': '明杠',
  'concealed-kong': '暗杠',
  'supplement-kong': '补杠',
  'declare-mouth': '报嘴',
};

function actionText(action: GameAction): string {
  if ('tile' in action) {
    return `${actionNames[action.type]} ${tileLabel(action.tile)}`;
  }
  return actionNames[action.type];
}

function actionClass(action: GameAction): string {
  if (action.type === 'win') return 'action-button action-button--win';
  if (action.type === 'declare-mouth') return 'action-button action-button--mouth';
  if (action.type === 'pass') return 'action-button action-button--pass';
  if (action.type === 'pong' || action.type.includes('kong'))
    return 'action-button action-button--meld';
  if (action.type === 'discard') return 'action-button action-button--discard';
  return 'action-button';
}

export function ActionBar({ actions, botThinking, isReplaying, prompt, onAction }: ActionBarProps) {
  const controlActions = nonDiscardActions(actions);
  const canDiscard = actions.some((action) => action.type === 'discard');

  return (
    <section className="panel action-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-eyebrow">ACTION QUEUE</p>
          <h2>可用动作</h2>
        </div>
        <span className="count-badge">{actions.length}</span>
      </div>
      <div className="interaction-prompt" aria-live="polite">
        <span className={botThinking && actions.length === 0 ? 'prompt-pulse' : 'prompt-dot'} />
        {prompt}
      </div>
      <div className="action-list">
        {controlActions.length > 0 &&
          controlActions.map((action, index) => (
            <button
              className={actionClass(action)}
              key={`${action.type}-${'tile' in action ? action.tile : 'none'}-${index}`}
              onClick={() => onAction(action)}
              title={actionText(action)}
              type="button"
            >
              {actionText(action)}
            </button>
          ))}
        {canDiscard && <span className="hand-action-callout">点击手牌即可出牌</span>}
        {actions.length === 0 && (
          <span className="empty-panel-note">
            {isReplaying
              ? '回放模式不能提交动作'
              : botThinking
                ? '对手正在完成当前动作'
                : '当前没有可用动作'}
          </span>
        )}
      </div>
      <p className="panel-hint">只显示规则引擎允许的动作；高亮牌可直接点击。</p>
    </section>
  );
}
