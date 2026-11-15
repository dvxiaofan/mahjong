import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { formatCoachPercent, needsCoachRiskConfirmation, showsCoachRisk } from '../../src/coach.ts';
import { tileLabel, type NormalTile } from '../../src/tiles.ts';
import type { GameAction, PlayerView } from '../../src/types.ts';
import {
  HandPress,
  orderedHand,
  selectedDiscard,
  type HandSelection,
  type HandSettings,
} from '../handSettings';
import { findDiscardAction } from '../uiModel';
import { HandSettingsControl } from './HandSettingsControl';
import { MahjongTileFace } from './MahjongTileFace';

export interface HandInteraction {
  context: object;
  settings: HandSettings;
  confirmDiscard: boolean;
  saved: boolean;
  update: (patch: Partial<HandSettings>) => void;
}
interface SelfHandProps {
  player: PlayerView;
  actions: readonly GameAction[];
  lastDrawnTile: NormalTile | null;
  onAction: (action: GameAction) => void;
  interaction?: HandInteraction | undefined;
  tileRisks?: Readonly<Partial<Record<NormalTile, number>>> | undefined;
}

export function SelfHand({
  player,
  actions,
  lastDrawnTile,
  onAction,
  interaction,
  tileRisks,
}: SelfHandProps) {
  const [selection, setSelection] = useState<HandSelection | null>(null);
  const press = useRef(new HandPress());
  const context = interaction?.context ?? player;
  const confirm = interaction?.confirmDiscard ?? false;
  const selected = selectedDiscard(selection, context, player, actions);
  const canDiscard = actions.some((action) => action.type === 'discard');
  const selectedRisk = selected === null ? 0 : Math.max(0, tileRisks?.[selected.tile] ?? 0);
  const showRiskConfirm = selected !== null && !confirm && needsCoachRiskConfirmation(selectedRisk);
  const showConfirmButton = canDiscard && (confirm || showRiskConfirm);

  useEffect(() => {
    setSelection(null);
  }, [context, confirm, canDiscard, interaction?.settings.layout]);
  useEffect(() => {
    const cancel = () => {
      setSelection(null);
      press.current.cancel();
    };
    window.addEventListener('scroll', cancel, true);
    window.addEventListener('resize', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('scroll', cancel, true);
      window.removeEventListener('resize', cancel);
      window.removeEventListener('blur', cancel);
    };
  }, []);

  function choose(event: MouseEvent<HTMLButtonElement>, tile: NormalTile, index: number) {
    if (!press.current.canClick(event.detail)) return;
    const action = findDiscardAction(actions, tile);
    if (action === null) return;
    const risk = tileRisks?.[tile] ?? 0;
    if (confirm || needsCoachRiskConfirmation(risk)) {
      setSelection({ context, tile, index });
    } else onAction(action);
  }

  function submitSelection() {
    const action = selectedDiscard(selection, context, player, actions);
    setSelection(null);
    if (action !== null) onAction(action);
  }

  return (
    <>
      {interaction !== undefined && (
        <div className="hand-controls">
          {showConfirmButton && (
            <button
              className="action-button hand-confirm"
              type="button"
              disabled={selected === null}
              onClick={submitSelection}
              aria-label={
                selected === null
                  ? '确认出牌，请先选牌'
                  : showsCoachRisk(selectedRisk)
                    ? `确认打出${tileLabel(selected.tile)}，放炮风险约${formatCoachPercent(selectedRisk)}`
                    : `确认打出${tileLabel(selected.tile)}`
              }
            >
              {selected === null
                ? '先选一张牌'
                : showsCoachRisk(selectedRisk)
                  ? `打出 ${tileLabel(selected.tile)} · 放炮约 ${formatCoachPercent(selectedRisk)}`
                  : `打出 ${tileLabel(selected.tile)}`}
            </button>
          )}
          <HandSettingsControl
            settings={interaction.settings}
            saved={interaction.saved}
            update={interaction.update}
            variant="dock"
          />
        </div>
      )}
      <div
        className={`self-hand self-hand--${interaction?.settings.layout ?? 'scroll'}`}
        aria-label="自己的手牌"
        onPointerDown={(event) =>
          press.current.start(event.pointerId, event.clientX, event.clientY)
        }
        onPointerMove={(event) => press.current.move(event.pointerId, event.clientX, event.clientY)}
        onPointerCancel={() => {
          press.current.cancel();
          setSelection(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setSelection(null);
        }}
      >
        {orderedHand(player.concealedTiles, lastDrawnTile).map(({ tile, index, drawn }) => {
          const action = findDiscardAction(actions, tile);
          const risk = Math.max(0, tileRisks?.[tile] ?? 0);
          const active = selected !== null && selection?.index === index;
          const className = [
            'mahjong-tile',
            action === null ? '' : 'mahjong-tile--interactive',
            drawn ? 'mahjong-tile--drawn' : '',
            active ? 'mahjong-tile--selected' : '',
            showsCoachRisk(risk) ? 'mahjong-tile--coach-risk' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const riskLabel = showsCoachRisk(risk) ? `，放炮风险约 ${formatCoachPercent(risk)}` : '';
          const marker = showsCoachRisk(risk) ? (
            <span
              className={`tile-risk-marker${needsCoachRiskConfirmation(risk) ? ' tile-risk-marker--high' : ''}`}
              aria-hidden="true"
            />
          ) : null;
          return action === null ? (
            <span
              className={className}
              data-tile={tile}
              aria-label={`${tileLabel(tile)}${riskLabel}`}
              key={`${tile}-${index}`}
            >
              <MahjongTileFace tile={tile} />
              {marker}
            </span>
          ) : (
            <button
              type="button"
              key={`${tile}-${index}`}
              className={className}
              data-tile={tile}
              aria-label={`${confirm ? '选择' : '打出'}${tileLabel(tile)}${riskLabel}`}
              aria-pressed={confirm || active ? active : undefined}
              title={`${confirm ? '选择' : '打出'} ${tileLabel(tile)}${drawn ? ' · 新摸牌' : ''}${riskLabel}`}
              onClick={(event) => choose(event, tile, index)}
            >
              <MahjongTileFace tile={tile} />
              {marker}
            </button>
          );
        })}
      </div>
    </>
  );
}
