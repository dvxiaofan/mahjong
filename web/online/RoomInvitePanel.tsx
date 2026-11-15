import { useRef, useState } from 'react';
import type { LobbyRoomView } from '../../src/lobby.ts';
import { buildRoomInvitation, roomSeatViews } from './invite';

interface RoomInvitePanelProps {
  lobby: LobbyRoomView;
}

function currentOrigin(): string {
  return typeof window === 'undefined' ? 'http://localhost' : window.location.origin;
}

function currentPathname(): string {
  return typeof window === 'undefined' ? '/' : window.location.pathname;
}

export function RoomInvitePanel({ lobby }: RoomInvitePanelProps) {
  const invite = buildRoomInvitation(lobby, currentOrigin(), currentPathname());
  const seatViews = roomSeatViews(lobby);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function copyInvite() {
    try {
      if (navigator.clipboard === undefined) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(invite.text);
      setCopyStatus('邀请信息已复制');
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopyStatus('已选中邀请信息，请手动复制');
    }
  }

  return (
    <section className="room-invite-panel" aria-labelledby="room-invite-title">
      <div className="room-invite-heading">
        <div>
          <h2 id="room-invite-title">约局状态</h2>
          <p>
            房主{' '}
            {lobby.participants.find((participant) => participant.isHost)?.displayName ?? '待定'}
            {' · '}
            {lobby.playerCount}/4 人{lobby.passwordProtected ? ' · 有密码' : ''}
          </p>
        </div>
        <button className="ghost-button" onClick={() => void copyInvite()} type="button">
          复制邀请
        </button>
      </div>
      <ol className="room-seat-list">
        {seatViews.map((seat) => (
          <li className={`room-seat room-seat--${seat.state}`} key={seat.seat}>
            <span>{seat.seat + 1} 号位</span>
            <strong>{seat.participant?.displayName ?? '等待加入'}</strong>
            <small>
              {seat.label}
              {seat.participant?.isHost ? ' · 房主' : ''}
            </small>
          </li>
        ))}
      </ol>
      <textarea
        aria-label="邀请链接和房间信息"
        className="room-invite-text"
        readOnly
        ref={inputRef}
        rows={4}
        value={invite.text}
      />
      <p aria-live="polite" className="room-invite-status">
        {copyStatus ??
          (lobby.passwordProtected
            ? '邀请不会包含密码或恢复令牌，请单独告知密码。'
            : '邀请链接会自动打开联网模式并预填房间名。')}
      </p>
    </section>
  );
}
