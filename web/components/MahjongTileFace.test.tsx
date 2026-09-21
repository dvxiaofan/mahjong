import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ALL_TILE_TYPES } from '../../src/tiles.ts';
import {
  MahjongTileFace,
  TILE_FACE_SOURCES,
  preloadTileFaces,
  tileFacesReady,
} from './MahjongTileFace';

describe('麻将牌面图片渲染', () => {
  it('万牌使用对应的图片资源', () => {
    const html = renderToStaticMarkup(<MahjongTileFace tile="m7" />);
    expect(html).toContain('src="/tiles/m7.png"');
  });

  it('筒牌使用对应的图片资源', () => {
    const html = renderToStaticMarkup(<MahjongTileFace tile="p9" />);
    expect(html).toContain('src="/tiles/p9.png"');
  });

  it('条牌使用对应的图片资源', () => {
    expect(renderToStaticMarkup(<MahjongTileFace tile="s1" />)).toContain('src="/tiles/s1.png"');
    expect(renderToStaticMarkup(<MahjongTileFace tile="s8" />)).toContain('src="/tiles/s8.png"');
  });

  it('红中、发财和白板使用对应的图片资源', () => {
    expect(renderToStaticMarkup(<MahjongTileFace tile="red" />)).toContain('src="/tiles/red.png"');
    expect(renderToStaticMarkup(<MahjongTileFace tile="fortune" />)).toContain(
      'src="/tiles/fortune.png"',
    );
    expect(renderToStaticMarkup(<MahjongTileFace tile="white" />)).toContain(
      'src="/tiles/white.png"',
    );
  });

  it('渲染为 img 元素', () => {
    const html = renderToStaticMarkup(<MahjongTileFace tile="m1" />);
    expect(html).toContain('<img');
    expect(html).toContain('class="tile-art"');
  });
});

describe('牌面图片预加载', () => {
  interface FakeImage {
    src: string;
    decode: () => Promise<void>;
  }

  function fakeImages(behaviour: (src: string) => Promise<void> = () => Promise.resolve()) {
    const requested: string[] = [];
    const createImage = () => {
      let value = '';
      const image: FakeImage = {
        get src() {
          return value;
        },
        set src(next: string) {
          value = next;
          requested.push(next);
        },
        decode: () => behaviour(value),
      };
      return image as unknown as HTMLImageElement;
    };
    return { requested, createImage };
  }

  it('预加载列表覆盖全部 30 种牌面，且与渲染时使用的地址一致', () => {
    expect(TILE_FACE_SOURCES).toHaveLength(ALL_TILE_TYPES.length);
    for (const tile of ALL_TILE_TYPES) {
      const src = renderToStaticMarkup(<MahjongTileFace tile={tile} />).match(/src="([^"]+)"/)?.[1];
      expect(TILE_FACE_SOURCES).toContain(src);
    }
  });

  it('对每个牌面地址各请求一次，重复调用不再发起新请求', () => {
    const { requested, createImage } = fakeImages();
    const registry = new Map<string, Promise<void>>();
    expect(preloadTileFaces(createImage, registry)).toBe(TILE_FACE_SOURCES.length);
    expect(requested).toEqual(TILE_FACE_SOURCES);
    expect(preloadTileFaces(createImage, registry)).toBe(0);
    expect(requested).toHaveLength(TILE_FACE_SOURCES.length);
  });

  it('没有 Image 构造器的环境下静默跳过，并立即视为就绪', async () => {
    expect(preloadTileFaces(undefined, new Map())).toBe(0);
    await expect(tileFacesReady({ createImage: undefined, registry: new Map() })).resolves.toBe(
      'loaded',
    );
  });

  it('全部牌面解码完成后才报告就绪', async () => {
    const pending = new Map<string, () => void>();
    const { createImage } = fakeImages(
      (src) => new Promise<void>((resolve) => pending.set(src, resolve)),
    );
    const registry = new Map<string, Promise<void>>();
    let settled: string | null = null;
    const ready = tileFacesReady({ createImage, registry, timeoutMs: 60_000 }).then((value) => {
      settled = value;
      return value;
    });
    await Promise.resolve();
    expect(pending.size).toBe(TILE_FACE_SOURCES.length);
    for (const [src, resolve] of pending) if (src !== '/tiles/red.png') resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBeNull();
    pending.get('/tiles/red.png')!();
    await expect(ready).resolves.toBe('loaded');
  });

  it('解码失败不阻塞就绪，超时后放行并标记为 timeout', async () => {
    const failing = fakeImages(() => Promise.reject(new Error('decode failed')));
    await expect(
      tileFacesReady({ createImage: failing.createImage, registry: new Map(), timeoutMs: 1000 }),
    ).resolves.toBe('loaded');
    const stalled = fakeImages(() => new Promise<void>(() => undefined));
    await expect(
      tileFacesReady({ createImage: stalled.createImage, registry: new Map(), timeoutMs: 20 }),
    ).resolves.toBe('timeout');
  });
});
