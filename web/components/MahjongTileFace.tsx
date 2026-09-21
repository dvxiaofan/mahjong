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
  // These crops were previously mismatched; bypass cached images after correcting them.
  s3: '/tiles/s3.png?v=2',
  s4: '/tiles/s4.png',
  s5: '/tiles/s5.png?v=2',
  s6: '/tiles/s6.png',
  s7: '/tiles/s7.png?v=2',
  s8: '/tiles/s8.png',
  s9: '/tiles/s9.png',
  red: '/tiles/red.png',
  white: '/tiles/white.png',
  fortune: '/tiles/fortune.png',
};

/** Every image the table can show, in a stable order, so all of them can be fetched up front. */
export const TILE_FACE_SOURCES: readonly string[] = Object.values(tileImageMap);

type ImageFactory = () => HTMLImageElement;
type PreloadRegistry = Map<string, Promise<void>>;

const preloaded: PreloadRegistry = new Map();

function defaultImageFactory(): ImageFactory | undefined {
  return typeof Image === 'undefined' ? undefined : () => new Image();
}

/**
 * Request every tile face once so a tile's first appearance never waits on the network.
 * Over a slow link (e.g. a tunnel with ~1s round trips) an on-demand image would still be
 * loading when the 800 ms discard highlight is already over, leaving a blank tile.
 * Returns how many new requests were started.
 */
export function preloadTileFaces(
  createImage: ImageFactory | undefined = defaultImageFactory(),
  registry: PreloadRegistry = preloaded,
): number {
  if (createImage === undefined) return 0;
  let started = 0;
  for (const src of TILE_FACE_SOURCES) {
    if (registry.has(src)) continue;
    const image = createImage();
    image.src = src;
    // A failed decode must not block the table forever; the timeout in tileFacesReady covers it.
    const decoded =
      typeof image.decode === 'function'
        ? image.decode().catch(() => undefined)
        : Promise.resolve();
    registry.set(src, decoded);
    started += 1;
  }
  return started;
}

export const TILE_FACES_READY_TIMEOUT_MS = 5000;

interface TileFacesReadyOptions {
  createImage?: ImageFactory | undefined;
  registry?: PreloadRegistry;
  timeoutMs?: number;
}

/**
 * Resolves once every tile face is decoded and can be painted synchronously, or after the
 * timeout so a broken image or an offline CDN never leaves the player staring at a spinner.
 */
export function tileFacesReady({
  createImage = defaultImageFactory(),
  registry = preloaded,
  timeoutMs = TILE_FACES_READY_TIMEOUT_MS,
}: TileFacesReadyOptions = {}): Promise<'loaded' | 'timeout'> {
  preloadTileFaces(createImage, registry);
  if (registry.size === 0) return Promise.resolve('loaded');
  const loaded = Promise.all(registry.values()).then(() => 'loaded' as const);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  return Promise.race([loaded, expired]).finally(() => clearTimeout(timer));
}

export const MahjongTileFace = memo(function MahjongTileFace({ tile }: MahjongTileFaceProps) {
  const src = tileImageMap[tile];
  return <img aria-hidden="true" className="tile-art" src={src} draggable={false} />;
});
