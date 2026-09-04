import { tileLabel, type NormalTile } from '../../src/tiles.ts';
import type {
  GameAction,
  Meld,
  PlayerView,
  PlayerViewEntry,
  PublicPlayerView,
} from '../../src/types.ts';
import { findDiscardAction, type SeatActivity } from '../uiModel';

type SeatPosition = 'north' | 'west' | 'east' | 'south';

interface PlayerSeatProps {
  player: PlayerViewEntry;
  position: SeatPosition;
  activity: SeatActivity;
  dealer: boolean;
  legalActions: readonly GameAction[];
  lastDrawnTile: NormalTile | null;
  onAction: (action: GameAction) => void;
}

const positionLabels: Record<SeatPosition, string> = {
  north: '上家',
  west: '对家',
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
  ].filter(Boolean).join(' ');
}

interface TileFaceProps {
  tile: NormalTile;
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
        {label}
      </button>
    );
  }
  return <span className={tileClassName(compact, false, drawn)} data-tile={tile}>{label}</span>;
}

function TileBack() {
  return <span className="mahjong-tile mahjong-tile--back" aria-label="背面牌" />;
}

function renderMeld(meld: Meld, index: number) {
  return (
    <span className="meld-chip" key={`${meld.kind}-${meld.tile}-${index}`}>
      <span className="meld-kind">{meldLabels[meld.kind]}</span>
      <span>{tileLabel(meld.tile)}</span>
    </span>
  );
}

function renderPublicHand(player: PublicPlayerView) {
  const backCount = Math.min(player.concealedTileCount, 13);
  return (
    <div className="hidden-hand" aria-label={`${player.concealedTileCount}张暗牌`}>
      {Array.from({ length: backCount }, (_, index) => <TileBack key={index} />)}
      {player.concealedTileCount > backCount && (
        <span className="hidden-more">+{player.concealedTileCount - backCount}</span>
      )}
    </div>
  );
}

function renderSelfHand(
  player: PlayerView,
  actions: readonly GameAction[],
  lastDrawnTile: NormalTile | null,
  onAction: (action: GameAction) => void,
) {
  const drawnIndex = lastDrawnTile === null
    ? -1
    : player.concealedTiles.lastIndexOf(lastDrawnTile);
  return (
    <div className="self-hand" aria-label="自己的手牌">
      {player.concealedTiles.map((tile, index) => {
        const action = findDiscardAction(actions, tile);
        return (
          <TileFace
            drawn={index === drawnIndex}
            key={`${tile}-${index}`}
            tile={tile}
            {...(action === null ? {} : { onClick: () => onAction(action) })}
          />
        );
      })}
    </div>
  );
}

export function PlayerSeat({
  player,
  position,
  activity,
  dealer,
  legalActions,
  lastDrawnTile,
  onAction,
}: PlayerSeatProps) {
  const isSelf = isSelfPlayer(player);
  const recentDiscards = player.discards.slice(-18);
  const activityLabel = activityLabels[activity];

  return (
    <article className={[
      'player-seat',
      `player-seat--${position}`,
      isSelf ? 'player-seat--self' : '',
      activity !== 'idle' ? `player-seat--${activity}` : '',
    ].filter(Boolean).join(' ')}>
      <div className="player-heading">
        <div className="player-identity">
          <span className="seat-number">{player.seat + 1}</span>
          <span>
            <strong>{positionLabels[position]}</strong>
            <small>{isSelf ? '你的牌面' : '公开信息'}{dealer ? ' · 庄家' : ''}</small>
          </span>
        </div>
        <div className="seat-heading-status">
          {activityLabel !== undefined && (
            <span className={`seat-state seat-state--${activity}`}>{activityLabel}</span>
          )}
          <span className="score-label">{player.score} 分</span>
        </div>
      </div>

      <div className="player-status-row">
        <span className="fortune-label">发财 × {player.fortuneCount}</span>
        {player.mouthDeclared && <span className="status-pill">已报嘴</span>}
        {isSelf && player.mouthRequired && <span className="status-pill status-pill--warn">待报嘴</span>}
      </div>

      <div className="meld-row">
        {player.melds.length > 0
          ? player.melds.map(renderMeld)
          : <span className="empty-note">暂无碰杠</span>}
      </div>

      <div className="discard-row" aria-label="弃牌区">
        {recentDiscards.length > 0
          ? recentDiscards.map((tile, index) => <TileFace compact key={`${tile}-${index}`} tile={tile} />)
          : <span className="empty-note">弃牌区</span>}
      </div>

      {isSelf
        ? renderSelfHand(player, legalActions, lastDrawnTile, onAction)
        : renderPublicHand(player)}
    </article>
  );
}
