import type { LobbyRoomView, PublicParticipant } from '../../src/lobby.ts';
import type { Seat } from '../../src/types.ts';

export interface RoomSeatView {
  seat: Seat;
  participant: PublicParticipant | null;
  state: 'empty' | 'online' | 'offline' | 'bot' | 'trustee';
  label: string;
}

export interface RoomInvitation {
  url: string;
  text: string;
}

const seatStateLabels: Record<RoomSeatView['state'], string> = {
  empty: '空位',
  online: '在线',
  offline: '离线',
  bot: '机器人',
  trustee: '托管中',
};

export function roomSeatViews(lobby: LobbyRoomView): readonly RoomSeatView[] {
  return [0, 1, 2, 3].map((value) => {
    const seat = value as Seat;
    const participant =
      lobby.participants.find((entry) => entry.role === 'player' && entry.seat === seat) ?? null;
    const state: RoomSeatView['state'] =
      participant === null
        ? 'empty'
        : participant.bot
          ? 'bot'
          : !participant.connected
            ? 'offline'
            : participant.trustee
              ? 'trustee'
              : 'online';
    return {
      seat,
      participant,
      state,
      label: seatStateLabels[state],
    };
  });
}

export function buildRoomInvitation(
  lobby: LobbyRoomView,
  origin: string,
  pathname: string,
): RoomInvitation {
  const url = new URL(pathname, origin);
  url.searchParams.set('mode', 'online');
  url.searchParams.set('room', lobby.roomId);
  const host = lobby.participants.find((participant) => participant.isHost);
  const passwordLine = lobby.passwordProtected ? '\n房间有密码，请向房主另行索取。' : '';
  const text =
    `嗨！搓麻呀！房间「${lobby.roomId}」` +
    `，房主 ${host?.displayName ?? '待定'}，当前 ${lobby.playerCount}/4 人。` +
    `\n打开 ${url.toString()} 自动预填房间名。${passwordLine}`;
  return { url: url.toString(), text };
}
