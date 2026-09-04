import { tileLabel, type NormalTile } from '../../src/tiles.ts';
import type {
  Meld,
  PlayerView,
  PlayerViewEntry,
  PublicPlayerView,
} from '../../src/types.ts';

type SeatPosition = 'north' | 'west' | 'east' | 'south';

interface PlayerSeatProps {
  player: PlayerViewEntry;
  position: SeatPosition;
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

function isSelfPlayer(player: PlayerViewEntry): player is PlayerView {
  return player.visibility === 'self';
}

function tileClassName(compact: boolean): string {
  return compact ? 'mahjong-tile mahjong-tile--compact' : 'mahjong-tile';
}

function TileFace({ tile, compact = false }: { tile: NormalTile; compact?: boolean }) {
  return <span className={tileClassName(compact)}>{tileLabel(tile)}</span>;
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

function renderSelfHand(player: PlayerView) {
  return (
    <div className="self-hand" aria-label="自己的手牌">
      {player.concealedTiles.map((tile, index) => (
        <TileFace key={`${tile}-${index}`} tile={tile} />
      ))}
    </div>
  );
}

export function PlayerSeat({ player, position }: PlayerSeatProps) {
  const isSelf = isSelfPlayer(player);
  const recentDiscards = player.discards.slice(-18);

  return (
    <article className={`player-seat player-seat--${position} ${isSelf ? 'player-seat--self' : ''}`}>
      <div className="player-heading">
        <div className="player-identity">
          <span className="seat-number">{player.seat + 1}</span>
          <span>
            <strong>{positionLabels[position]}</strong>
            <small>{isSelf ? '你的牌面' : '公开信息'}</small>
          </span>
        </div>
        <span className="score-label">{player.score} 分</span>
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

      {isSelf ? renderSelfHand(player) : renderPublicHand(player)}
    </article>
  );
}
