import { describe, expect, it } from 'vitest';
import { resolveWebSocketUrl } from './useOnlineGame';

describe('联网客户端地址', () => {
  it('生产页面使用同源 WebSocket', () => {
    expect(resolveWebSocketUrl({ protocol: 'https:', hostname: 'mahjong.example', port: '' }))
      .toBe('wss://mahjong.example/ws');
    expect(resolveWebSocketUrl({ protocol: 'http:', hostname: 'localhost', port: '8787' }))
      .toBe('ws://localhost:8787/ws');
  });

  it('Vite 开发端口默认连接 8787 服务端，也允许环境变量覆盖', () => {
    expect(resolveWebSocketUrl({ protocol: 'http:', hostname: '127.0.0.1', port: '5173' }))
      .toBe('ws://127.0.0.1:8787/ws');
    expect(resolveWebSocketUrl(
      { protocol: 'http:', hostname: '127.0.0.1', port: '5173' },
      'wss://custom.example/ws',
    )).toBe('wss://custom.example/ws');
  });
});
