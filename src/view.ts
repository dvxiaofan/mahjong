import type {
  PlayerState,
  PlayerView,
  PublicPlayerView,
} from './types.js';

/**
 * Convert a player to the public portion of the UI contract.
 * The returned arrays/objects are copies so a view consumer cannot mutate game state.
 */
export function toPublicPlayerView(player: PlayerState): PublicPlayerView {
  return {
    visibility: 'public',
    seat: player.seat,
    concealedTileCount: player.concealedTiles.length,
    melds: player.melds.map((meld) => ({ ...meld })),
    discards: [...player.discards],
    fortuneCount: player.fortuneCount,
    mouthDeclared: player.mouthDeclared,
    score: player.score,
    gangs: player.gangs.map((gang) => ({ ...gang })),
  };
}

/** Convert the viewer's own player to the full UI contract. */
export function toPlayerView(player: PlayerState): PlayerView {
  return {
    ...toPublicPlayerView(player),
    visibility: 'self',
    concealedTiles: [...player.concealedTiles],
    lockedWaits: [...player.lockedWaits],
    mouthRequired: player.mouthRequired,
  };
}
