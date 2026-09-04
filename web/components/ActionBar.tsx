import { tileLabel } from '../../src/tiles.ts';
import type { GameAction } from '../../src/types.ts';

interface ActionBarProps {
  actions: readonly GameAction[];
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
  if (action.type === 'discard') return 'action-button action-button--discard';
  return 'action-button';
}

export function ActionBar({ actions }: ActionBarProps) {
  return (
    <section className="panel action-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-eyebrow">ACTION QUEUE</p>
          <h2>可用动作</h2>
        </div>
        <span className="count-badge">{actions.length}</span>
      </div>
      <div className="action-list">
        {actions.length > 0
          ? actions.map((action, index) => (
              <button
                className={actionClass(action)}
                disabled
                key={`${action.type}-${'tile' in action ? action.tile : 'none'}-${index}`}
                title="动作交互将在 M2.4 接入"
                type="button"
              >
                {actionText(action)}
              </button>
            ))
          : <span className="empty-panel-note">当前没有可用动作</span>}
      </div>
      <p className="panel-hint">当前为 M2.3 静态演示，动作接入将在下一步开启。</p>
    </section>
  );
}
