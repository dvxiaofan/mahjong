import { describe, expect, it } from 'vitest';
import type { LobbyRoomView } from '../../src/lobby.ts';
import { buildRoomInvitation, roomSeatViews } from './invite';

const lobby: LobbyRoomView = {
  roomId: '清一色茶楼',
  passwordProtected: true,
  revision: 4,
  matchPhase: 'between-rounds',
  started: false,
  readyToStart: false,
  playerCount: 3,
  spectatorCount: 1,
  participants: [
    {
      participantId: 'host',
      displayName: '甲',
      role: 'player',
      seat: 0,
      connected: true,
      trustee: false,
      isHost: true,
      bot: false,
    },
    {
      participantId: 'bot',
      displayName: '机器人乙',
      role: 'player',
      seat: 2,
      connected: true,
      trustee: true,
      isHost: false,
      bot: true,
    },
    {
      participantId: 'offline',
      displayName: '丙',
      role: 'player',
      seat: 3,
      connected: false,
      trustee: true,
      isHost: false,
      bot: false,
    },
  ],
};

describe('约局座位和邀请', () => {
  it('四个座位都展示，空位、机器人、离线和托管状态可区分', () => {
    expect(roomSeatViews(lobby).map((entry) => [entry.seat, entry.label])).toEqual([
      [0, '在线'],
      [1, '空位'],
      [2, '机器人'],
      [3, '离线'],
    ]);
  });

  it('邀请链接预填联网模式和房间名，不携带恢复令牌或密码', () => {
    const invite = buildRoomInvitation(lobby, 'https://mj.example', '/');
    const url = new URL(invite.url);
    expect(url.searchParams.get('mode')).toBe('online');
    expect(url.searchParams.get('room')).toBe('清一色茶楼');
    expect(invite.text).toContain('3/4 人');
    expect(invite.text).toContain('房间有密码');
    expect(invite.text).not.toContain('resumeToken');
    expect(invite.text).not.toContain('password=');
  });
});
