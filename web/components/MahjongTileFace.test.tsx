import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MahjongTileFace } from './MahjongTileFace';

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
    expect(renderToStaticMarkup(<MahjongTileFace tile="fortune" />)).toContain('src="/tiles/fortune.png"');
    expect(renderToStaticMarkup(<MahjongTileFace tile="white" />)).toContain('src="/tiles/white.png"');
  });

  it('渲染为 img 元素', () => {
    const html = renderToStaticMarkup(<MahjongTileFace tile="m1" />);
    expect(html).toContain('<img');
    expect(html).toContain('class="tile-art"');
  });
});
