import { tileLabel } from '../../src/tiles.ts';
import type { GameAction } from '../../src/types.ts';
import { nonDiscardActions } from '../uiModel';

interface ActionBarProps {
  actions: readonly GameAction[];
  isReplaying: boolean;
  busy: boolean;
  responding?: boolean;
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

export function ActionBar({
  actions,
  isReplaying,
  busy,
  responding = false,
  onAction,
}: ActionBarProps) {
  const available = isReplaying || busy ? [] : actions;
  const controlActions = nonDiscardActions(available);
  const canAct = available.length > 0;
  const responseTypes = ['win', 'pong', 'exposed-kong', 'declare-mouth', 'pass'] as const;

  function button(action: GameAction, index = 0) {
    return (
      <button
        className={actionClass(action)}
        key={`${action.type}-${'tile' in action ? action.tile : 'none'}-${index}`}
        onClick={() => onAction(action)}
        title={actionText(action)}
        type="button"
      >
        {actionText(action)}
      </button>
    );
  }

  return (
    <section
      className={`seat-actions${canAct ? ' seat-actions--ready' : ''}`}
      aria-label="我方操作"
      aria-busy={busy}
    >
      {responding ? (
        <div className="response-actions" aria-label="弃牌响应动作">
          {responseTypes.map((type) => {
            const action = controlActions.find((candidate) => candidate.type === type);
            return (
              <div
                className={`response-action-slot${action === undefined ? ' response-action-slot--empty' : ''}`}
                data-response-action={type}
                key={type}
              >
                {action === undefined ? <span aria-hidden="true" /> : button(action)}
              </div>
            );
          })}
        </div>
      ) : controlActions.length > 0 ? (
        <div className="action-list">{controlActions.map(button)}</div>
      ) : null}
    </section>
  );
}
