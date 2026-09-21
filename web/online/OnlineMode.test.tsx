import { describe, expect, it } from 'vitest';
import type { LobbyRoomView } from '../../src/lobby.ts';
import { hostOf, seatDecorationsFor } from './OnlineMode';

const lobby: LobbyRoomView = {
  roomId: 'r',
  passwordProtected: false,
  revision: 0,
  matchPhase: 'playing',
  started: false,
  readyToStart: false,
  playerCount: 3,
  spectatorCount: 1,
  participants: [
    {
      participantId: 'a',
      displayName: '甲',
      role: 'player',
      seat: 0,
      connected: true,
      trustee: false,
      isHost: true,
      bot: false,
    },
    {
      participantId: 'b',
      displayName: '机器人甲',
      role: 'player',
      seat: 2,
      connected: true,
      trustee: true,
      isHost: false,
      bot: true,
    },
    {
      participantId: 'c',
      displayName: '乙',
      role: 'player',
      seat: 1,
      connected: false,
      trustee: true,
      isHost: false,
      bot: false,
    },
    {
      participantId: 'w',
      displayName: '观众',
      role: 'spectator',
      seat: null,
      connected: true,
      trustee: false,
      isHost: false,
      bot: false,
    },
  ],
};

describe('联网房间座位装饰', () => {
  it('按座位映射昵称、房主和机器人，观战者不占座位', () => {
    expect(seatDecorationsFor(lobby)).toEqual({
      0: { name: '甲', host: true, bot: false },
      1: { name: '乙', host: false, bot: false },
      2: { name: '机器人甲', host: false, bot: true },
    });
    expect(hostOf(lobby)?.displayName).toBe('甲');
  });
});
