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

  it('一条绘制鸟形标记，其余条牌绘制竹节', () => {
    expect(renderToStaticMarkup(<MahjongTileFace tile="s1" />)).toContain('<path');
    expect(renderToStaticMarkup(<MahjongTileFace tile="s8" />)).toContain('<rect');
  });

  it('红中和白板使用各自的字牌图案', () => {
    expect(renderToStaticMarkup(<MahjongTileFace tile="red" />)).toContain('中');
    expect(renderToStaticMarkup(<MahjongTileFace tile="white" />)).toContain('<rect');
  });
});
