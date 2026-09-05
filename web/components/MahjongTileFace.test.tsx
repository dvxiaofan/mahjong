import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MahjongTileFace } from './MahjongTileFace';

describe('矢量麻将牌面', () => {
  it('万牌显示中文数字和萬字', () => {
    const html = renderToStaticMarkup(<MahjongTileFace tile="m7" />);
    expect(html).toContain('七');
    expect(html).toContain('萬');
  });

  it('筒牌按照点数绘制圆形图案', () => {
    const html = renderToStaticMarkup(<MahjongTileFace tile="p9" />);
    expect(html.match(/<circle/g)).toHaveLength(18);
  });

  it('七筒使用上方三点斜排、下方四点方阵的常见牌面', () => {
    const html = renderToStaticMarkup(<MahjongTileFace tile="p7" />);
    expect(html).toContain('data-circle-layout="diagonal-three-square-four"');
    expect(html.match(/<circle/g)).toHaveLength(14);
    expect(html).toContain('cx="8" cy="8"');
    expect(html).toContain('cx="26" cy="42"');
  });

  it('一条绘制鸟形标记，其余条牌绘制竹节', () => {
    expect(renderToStaticMarkup(<MahjongTileFace tile="s1" />)).toContain('<path');
    const eightBamboo = renderToStaticMarkup(<MahjongTileFace tile="s8" />);
    expect(eightBamboo).toContain('data-bamboo-layout="rank-8"');
    expect(eightBamboo.match(/translate\(/g)).toHaveLength(8);
  });

  it('红中、发财和白板使用各自的字牌图案', () => {
    expect(renderToStaticMarkup(<MahjongTileFace tile="red" />)).toContain('中');
    expect(renderToStaticMarkup(<MahjongTileFace tile="fortune" />)).toContain('發');
    expect(renderToStaticMarkup(<MahjongTileFace tile="white" />)).toContain('<rect');
  });
});
