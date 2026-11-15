import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LobbyRoomView } from '../../src/lobby.ts';
import { RoomInvitePanel } from './RoomInvitePanel';

const lobby: LobbyRoomView = {
  roomId: '周末茶楼',
  passwordProtected: true,
  revision: 1,
  matchPhase: 'between-rounds',
  started: false,
  readyToStart: false,
  playerCount: 1,
  spectatorCount: 0,
  participants: [
    {
      participantId: 'host',
      displayName: '房主甲',
      role: 'player',
      seat: 0,
      connected: true,
      trustee: false,
      isHost: true,
      bot: false,
    },
  ],
};

describe('约局状态面板', () => {
  it('展示四个座位、真实空位和复制入口，不泄露密码', () => {
    const html = renderToStaticMarkup(<RoomInvitePanel lobby={lobby} />);
    expect(html).toContain('约局状态');
    expect(html).toContain('房主甲');
    expect(html).toContain('1 号位');
    expect(html).toContain('空位');
    expect(html).toContain('复制邀请');
    expect(html).toContain('有密码');
    expect(html).toContain('不会包含密码或恢复令牌');
  });
});
