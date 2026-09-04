import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { AppErrorFallback } from './AppErrorBoundary';

describe('应用可访问性与错误恢复', () => {
  it('提供跳过链接、主内容锚点和语义化模式按钮', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('本地对局');
    expect(html).toContain('联网对战');
  });

  it('错误回退不展示牌局数据并提供重新载入操作', () => {
    const html = renderToStaticMarkup(<AppErrorFallback />);
    expect(html).toContain('牌桌暂时无法显示');
    expect(html).toContain('本地存档仍然保留');
    expect(html).toContain('重新载入');
    expect(html).not.toContain('resumeToken');
  });
});
