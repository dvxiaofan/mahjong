import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocalMode } from './LocalMode';

describe('本地对局开局确认', () => {
  it('打开页面先显示开始面板，不发牌、不显示牌桌', () => {
    const html = renderToStaticMarkup(<LocalMode />);
    expect(html).toContain('开始对局');
    expect(html).toContain('AI 难度');
    expect(html).not.toContain('felt-table');
    expect(html).not.toContain('tile-art');
  });
});
