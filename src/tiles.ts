export const SUITS = ['m', 'p', 's'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export type Rank = (typeof RANKS)[number];

export type SuitedTile = `${Suit}${Rank}`;
export type HonorTile = 'red' | 'white';
export type NormalTile = SuitedTile | HonorTile;
export type Tile = NormalTile | 'fortune';

export const SUITED_TILES: readonly SuitedTile[] = SUITS.flatMap((suit) =>
  RANKS.map((rank) => `${suit}${rank}` as SuitedTile),
);

export const HONOR_TILES: readonly HonorTile[] = ['red', 'white'];
export const NORMAL_TILE_TYPES: readonly NormalTile[] = [...SUITED_TILES, ...HONOR_TILES];
export const ALL_TILE_TYPES: readonly Tile[] = [...NORMAL_TILE_TYPES, 'fortune'];

export const TILE_COPIES = 4;
export const WALL_SIZE = ALL_TILE_TYPES.length * TILE_COPIES;

export function createTileSet(): Tile[] {
  return ALL_TILE_TYPES.flatMap((tile) => Array.from({ length: TILE_COPIES }, () => tile));
}

export function isFortuneTile(tile: Tile): tile is 'fortune' {
  return tile === 'fortune';
}

export function isHonorTile(tile: Tile): tile is HonorTile {
  return tile === 'red' || tile === 'white';
}

export function isSuitedTile(tile: Tile): tile is SuitedTile {
  return (
    typeof tile === 'string' &&
    tile.length === 2 &&
    SUITS.includes(tile[0] as Suit) &&
    /^[1-9]$/.test(tile[1] ?? '')
  );
}

export function tileSuit(tile: NormalTile): Suit | null {
  return isSuitedTile(tile) ? (tile[0] as Suit) : null;
}

export function tileRank(tile: SuitedTile): Rank {
  return Number(tile[1]) as Rank;
}

export function tileSortKey(tile: Tile): number {
  if (tile === 'fortune') return 29;
  if (tile === 'red') return 27;
  if (tile === 'white') return 28;
  const suitIndex = SUITS.indexOf(tile[0] as Suit);
  return suitIndex * 9 + Number(tile[1]) - 1;
}

export function sortTiles<T extends Tile>(tiles: readonly T[]): T[] {
  return [...tiles].sort((a, b) => tileSortKey(a) - tileSortKey(b));
}

export function tileLabel(tile: Tile): string {
  if (tile === 'fortune') return '发财';
  if (tile === 'red') return '红中';
  if (tile === 'white') return '白板';
  const suitLabels: Record<Suit, string> = { m: '万', p: '筒', s: '条' };
  return `${tile[1]}${suitLabels[tile[0] as Suit]}`;
}

export function tilesLabel(tiles: readonly Tile[]): string {
  return sortTiles(tiles).map(tileLabel).join(' ');
}
