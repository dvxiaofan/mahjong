import { memo } from 'react';
import type { Tile } from '../../src/tiles.ts';

interface MahjongTileFaceProps {
  tile: Tile;
}

const tileImageMap: Record<Tile, string> = {
  m1: '/tiles/m1.png',
  m2: '/tiles/m2.png',
  m3: '/tiles/m3.png',
  m4: '/tiles/m4.png',
  m5: '/tiles/m5.png',
  m6: '/tiles/m6.png',
  m7: '/tiles/m7.png',
  m8: '/tiles/m8.png',
  m9: '/tiles/m9.png',
  p1: '/tiles/p1.png',
  p2: '/tiles/p2.png',
  p3: '/tiles/p3.png',
  p4: '/tiles/p4.png',
  p5: '/tiles/p5.png',
  p6: '/tiles/p6.png',
  p7: '/tiles/p7.png',
  p8: '/tiles/p8.png',
  p9: '/tiles/p9.png',
  s1: '/tiles/s1.png',
  s2: '/tiles/s2.png',
  s3: '/tiles/s3.png',
  s4: '/tiles/s4.png',
  s5: '/tiles/s5.png',
  s6: '/tiles/s6.png',
  s7: '/tiles/s7.png',
  s8: '/tiles/s8.png',
  s9: '/tiles/s9.png',
  red: '/tiles/red.png',
  white: '/tiles/white.png',
  fortune: '/tiles/fortune.png',
};

export const MahjongTileFace = memo(function MahjongTileFace({ tile }: MahjongTileFaceProps) {
  const src = tileImageMap[tile];
  return (
    <img
      aria-hidden="true"
      className="tile-art"
      src={src}
      draggable={false}
    />
  );
});
