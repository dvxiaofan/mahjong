import type { ReactNode, RefObject } from 'react';
import { tileLabel, type NormalTile, type Tile } from '../../src/tiles.ts';
import type {
  GameAction,
  Meld,
  PlayerView,
  PlayerViewEntry,
  PublicPlayerView,
  RevealedPlayerView,
} from '../../src/types.ts';
import type { SeatActivity } from '../uiModel';
import { MahjongTileFace } from './MahjongTileFace';
import { SelfHand, type HandInteraction } from './SelfHand';
import type { DiscardPresentation } from '../discardPresentation';

type SeatPosition = 'north' | 'west' | 'east' | 'south';

/** Online-room identity shown on a seat: who sits there, whether they host, whether it's a bot. */
export interface SeatDecoration {
  name?: string | undefined;
  host?: boolean | undefined;
  bot?: boolean | undefined;
}

interface PlayerSeatProps {
  player: PlayerViewEntry;
  position: SeatPosition;
  activity: SeatActivity;
  activityLabel?: string | undefined;
  label?: string | undefined;
  decoration?: SeatDecoration | undefined;
  controls?: ReactNode;
  handInteraction?: HandInteraction | undefined;
  discardHighlight?:
    | {
        presentation: DiscardPresentation;
        floating: boolean;
        targetRef?: RefObject<HTMLSpanElement | null>;
      }
    | undefined;
  dealer: boolean;
  legalActions: readonly GameAction[];
  lastDrawnTile: NormalTile | null;
  revealHand?: boolean;
  winningTile?: NormalTile | null;
  onAction: (action: GameAction) => void;
}

const positionLabels: Record<SeatPosition, string> = {
  north: '对家',
  west: '上家',
  east: '下家',
  south: '我方',
};

const meldLabels: Record<Meld['kind'], string> = {
  pong: '碰',
  'exposed-kong': '明杠',
  'concealed-kong': '暗杠',
  'added-kong': '补杠',
};

const activityLabels: Partial<Record<SeatActivity, string>> = {
  active: '行动中',
  waiting: '待响应',
  responded: '已响应',
  discarder: '已出牌',
};

function isSelfPlayer(player: PlayerViewEntry): player is PlayerView {
  return player.visibility === 'self';
}

function tileClassName(compact: boolean, interactive = false, drawn = false): string {
  return [
    'mahjong-tile',
    compact ? 'mahjong-tile--compact' : '',
    interactive ? 'mahjong-tile--interactive' : '',
    drawn ? 'mahjong-tile--drawn' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

interface TileFaceProps {
  tile: Tile;
  compact?: boolean;
  drawn?: boolean;
  onClick?: () => void;
}

function TileFace({ tile, compact = false, drawn = false, onClick }: TileFaceProps) {
  const label = tileLabel(tile);
  if (onClick !== undefined) {
    return (
      <button
        aria-label={`打出${label}`}
        className={tileClassName(compact, true, drawn)}
        data-tile={tile}
        onClick={onClick}
        title={`打出 ${label}`}
        type="button"
      >
        <MahjongTileFace tile={tile} />
      </button>
    );
  }
  return (
    <span aria-label={label} className={tileClassName(compact, false, drawn)} data-tile={tile}>
      <MahjongTileFace tile={tile} />
    </span>
  );
}

function TileBack() {
  return <span className="mahjong-tile mahjong-tile--back" aria-label="背面牌" />;
}

function renderMeld(meld: Meld, index: number, revealed: boolean) {
  return (
    <span className="meld-chip" key={`${meld.kind}-${meld.tile}-${index}`}>
      <span className="meld-kind">{meldLabels[meld.kind]}</span>
      {revealed ? (
        <span
          className="revealed-meld"
          aria-label={`${meldLabels[meld.kind]} ${tileLabel(meld.tile)}`}
        >
          {Array.from({ length: meld.kind === 'pong' ? 3 : 4 }, (_, tileIndex) => (
            <TileFace compact key={tileIndex} tile={meld.tile} />
          ))}
        </span>
      ) : (
        <span>{tileLabel(meld.tile)}</span>
      )}
    </span>
  );
}

function renderFinalHand(player: PlayerView | RevealedPlayerView, winningTile: NormalTile | null) {
  const winningIndex = winningTile === null ? -1 : player.concealedTiles.lastIndexOf(winningTile);
  const hand = player.concealedTiles.filter((_, index) => index !== winningIndex);
  return (
    <div className="final-hand" aria-label="本局亮牌">
      {hand.map((tile, index) => (
        <TileFace key={`${tile}-${index}`} tile={tile} />
      ))}
      {winningIndex >= 0 && winningTile !== null && (
        <span className="winning-tile" aria-label={`胡牌张 ${tileLabel(winningTile)}`}>
          <TileFace tile={winningTile} />
          <small>胡牌张</small>
        </span>
      )}
    </div>
  );
}

function renderPublicHand(player: PublicPlayerView) {
  const backCount = Math.min(player.concealedTileCount, 13);
  return (
    <div className="hidden-hand" aria-label={`${player.concealedTileCount}张暗牌`}>
      {Array.from({ length: backCount }, (_, index) => (
        <TileBack key={index} />
      ))}
      {player.concealedTileCount > backCount && (
        <span className="hidden-more">+{player.concealedTileCount - backCount}</span>
      )}
    </div>
  );
}

function renderFortunes(count: number) {
  return (
    <div className="fortune-zone" aria-label={`发财区，共${count}张`}>
      <span className="fortune-zone-label">发财</span>
      {count > 0 && (
        <span className="fortune-tiles">
          {Array.from({ length: count }, (_, index) => (
            <TileFace compact key={`fortune-${index}`} tile="fortune" />
          ))}
        </span>
      )}
      <span className="fortune-count">× {count}</span>
    </div>
  );
}

export function PlayerSeat({
  player,
  position,
  activity,
  activityLabel: suppliedActivityLabel,
  label,
  decoration,
  controls,
  handInteraction,
  discardHighlight,
  dealer,
  legalActions,
  lastDrawnTile,
  revealHand = false,
  winningTile = null,
  onAction,
}: PlayerSeatProps) {
  const isSelf = isSelfPlayer(player);
  const revealed = player.visibility === 'revealed' || revealHand;
  const recentDiscards = player.discards.slice(-18);
  const discardOffset = player.discards.length - recentDiscards.length;
  const activityLabel = suppliedActivityLabel ?? activityLabels[activity];

  return (
    <article
      data-seat={player.seat}
      aria-label={`${label ?? positionLabels[position]}牌区`}
      className={[
        'player-seat',
        `player-seat--${position}`,
        isSelf ? 'player-seat--self' : '',
        revealed ? 'player-seat--revealed' : '',
        winningTile !== null ? 'player-seat--winner' : '',
        activity !== 'idle' ? `player-seat--${activity}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="player-heading">
        <div className="player-identity">
          <span className="seat-number">{player.seat + 1}</span>
          <span>
            <strong>
              {label ?? positionLabels[position]}
              {decoration?.name !== undefined && (
                <span className="seat-name">{decoration.name}</span>
              )}
            </strong>
            <small>
              {revealed ? '本局亮牌' : dealer ? '庄家' : `${player.concealedTileCount}张手牌`}
              {revealed && dealer ? ' · 庄家' : ''}
            </small>
          </span>
        </div>
        <div className="seat-heading-status">
          {decoration?.host === true && (
            <span className="seat-badge seat-badge--host" title="房主">
              👑 房主
            </span>
          )}
          {decoration?.bot === true && <span className="seat-badge seat-badge--bot">机器人</span>}
          {winningTile !== null && <span className="seat-state seat-state--winner">胡牌</span>}
          {activityLabel !== undefined && (
            <span className={`seat-state seat-state--${activity}`}>{activityLabel}</span>
          )}
          <span className="score-label">{player.score} 分</span>
        </div>
      </div>

      <div className="player-status-row">
        {renderFortunes(player.fortuneCount)}
        {player.mouthDeclared && <span className="status-pill">已报嘴</span>}
        {isSelf && player.mouthRequired && (
          <span className="status-pill status-pill--warn">待报嘴</span>
        )}
      </div>

      {player.melds.length > 0 && (
        <div className="meld-row" aria-label="碰杠区">
          {player.melds.map((meld, index) => renderMeld(meld, index, revealed))}
        </div>
      )}

      {recentDiscards.length > 0 && (
        <div className="discard-row" aria-label="弃牌区">
          {recentDiscards.map((tile, index) =>
            discardHighlight?.presentation.discardIndex === discardOffset + index ? (
              <span
                key={`${tile}-${discardOffset + index}`}
                className={`discard-target${discardHighlight.floating ? ' discard-target--floating' : ''}`}
                ref={discardHighlight.targetRef}
                aria-hidden={discardHighlight.floating || undefined}
                data-discard-id={discardHighlight.presentation.id}
              >
                <TileFace compact tile={tile} />
              </span>
            ) : (
              <TileFace compact key={`${tile}-${discardOffset + index}`} tile={tile} />
            ),
          )}
        </div>
      )}

      {player.visibility === 'public' ? (
        renderPublicHand(player)
      ) : player.visibility === 'revealed' || revealHand ? (
        renderFinalHand(player, winningTile)
      ) : (
        <SelfHand
          player={player}
          actions={legalActions}
          lastDrawnTile={lastDrawnTile}
          onAction={onAction}
          interaction={handInteraction}
        />
      )}
      {isSelf && !revealed && controls}
    </article>
  );
}
