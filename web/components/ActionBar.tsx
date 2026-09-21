import { tileLabel, type NormalTile } from '../../src/tiles.ts';
import type { GameAction } from '../../src/types.ts';
import { nonDiscardActions } from '../uiModel';
import { MahjongTileFace } from './MahjongTileFace';

interface ActionBarProps {
  actions: readonly GameAction[];
  botThinking: boolean;
  isReplaying: boolean;
  busy: boolean;
  pendingTile: NormalTile | null;
  prompt: string;
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
  botThinking,
  isReplaying,
  busy,
  pendingTile,
  prompt,
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
      <div className="interaction-prompt main-action-prompt" role="status" aria-atomic="true">
        {pendingTile !== null ? (
          <span
            className="mahjong-tile mahjong-tile--compact"
            aria-label={`待响应牌 ${tileLabel(pendingTile)}`}
          >
            <MahjongTileFace tile={pendingTile} />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className={botThinking && !canAct ? 'prompt-pulse' : 'prompt-dot'}
          />
        )}
        <strong>{prompt}</strong>
      </div>
      {responding ? (
        <div className="response-actions" aria-label="弃牌响应动作">
          {responseTypes.map((type) => {
            const action = controlActions.find((candidate) => candidate.type === type);
            return (
              <div className="response-action-slot" data-response-action={type} key={type}>
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
