import { useMemo, useState, type FormEvent } from 'react';
import type { GameAudienceView } from '../../src/types.ts';
import { MahjongTable } from '../components/MahjongTable';
import { useOnlineGame } from './useOnlineGame';

function withoutActions(view: GameAudienceView): GameAudienceView {
  return { ...view, legalActions: [] } as GameAudienceView;
}

export function OnlineMode() {
  const online = useOnlineGame();
  const [roomId, setRoomId] = useState('mahjong-room');
  const [displayName, setDisplayName] = useState('玩家');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'player' | 'spectator'>('player');
  const [maxRounds, setMaxRounds] = useState(8);
  const participant = online.lobby?.participants.find(
    (candidate) => candidate.participantId === online.session?.participantId,
  );
  const waitingForPlayers =
    online.session?.role === 'player' && (online.lobby?.playerCount ?? 0) < 4;
  const gameView = useMemo(() => {
    const view = online.snapshot?.match.game ?? null;
    return view !== null && waitingForPlayers ? withoutActions(view) : view;
  }, [online.snapshot, waitingForPlayers]);

  function createRoom(event: FormEvent) {
    event.preventDefault();
    online.createRoom({ roomId, displayName, maxRounds, ...(password === '' ? {} : { password }) });
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    online.joinRoom({ roomId, displayName, role, ...(password === '' ? {} : { password }) });
  }

  if (online.session === null || online.lobby === null) {
    return (
      <section className="online-lobby-shell">
        <div className="online-status-row" aria-live="polite">
          <span className={`connection-dot connection-dot--${online.status}`} />
          {online.status === 'connected'
            ? '已连接联网服务'
            : online.status === 'connecting'
              ? '正在连接…'
              : '连接已断开，正在重试…'}
        </div>
        {online.error !== null && (
          <div className="online-error" role="alert">
            {online.error}
          </div>
        )}

        <div className="online-form-grid">
          <form className="online-card" onSubmit={createRoom}>
            <p className="panel-eyebrow">CREATE ROOM</p>
            <h2>创建牌桌</h2>
            <label>
              房间 ID
              <input
                maxLength={64}
                onChange={(event) => setRoomId(event.currentTarget.value)}
                value={roomId}
              />
            </label>
            <label>
              昵称
              <input
                maxLength={24}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                value={displayName}
              />
            </label>
            <label>
              房间密码（可选）
              <input
                onChange={(event) => setPassword(event.currentTarget.value)}
                type="password"
                value={password}
              />
            </label>
            <label>
              比赛局数
              <input
                max={100}
                min={1}
                onChange={(event) => setMaxRounds(Number(event.currentTarget.value))}
                type="number"
                value={maxRounds}
              />
            </label>
            <button
              className="online-primary-button"
              disabled={online.status !== 'connected'}
              type="submit"
            >
              创建并入座
            </button>
          </form>

          <form className="online-card" onSubmit={joinRoom}>
            <p className="panel-eyebrow">JOIN ROOM</p>
            <h2>加入牌桌</h2>
            <label>
              房间 ID
              <input
                maxLength={64}
                onChange={(event) => setRoomId(event.currentTarget.value)}
                value={roomId}
              />
            </label>
            <label>
              昵称
              <input
                maxLength={24}
                onChange={(event) => setDisplayName(event.currentTarget.value)}
                value={displayName}
              />
            </label>
            <label>
              房间密码（如有）
              <input
                onChange={(event) => setPassword(event.currentTarget.value)}
                type="password"
                value={password}
              />
            </label>
            <label>
              身份
              <select
                onChange={(event) => setRole(event.currentTarget.value as 'player' | 'spectator')}
                value={role}
              >
                <option value="player">玩家</option>
                <option value="spectator">观战</option>
              </select>
            </label>
            <button
              className="online-primary-button"
              disabled={online.status !== 'connected'}
              type="submit"
            >
              加入房间
            </button>
          </form>
        </div>

        <section className="room-browser">
          <div className="panel-heading">
            <div>
              <p className="panel-eyebrow">ROOMS</p>
              <h2>可见房间</h2>
            </div>
            <button className="ghost-button" onClick={online.refreshRooms} type="button">
              刷新
            </button>
          </div>
          <div className="room-list">
            {online.rooms.map((room) => (
              <button
                className="room-list-item"
                key={room.roomId}
                onClick={() => setRoomId(room.roomId)}
                type="button"
              >
                <strong>{room.roomId}</strong>
                <span>
                  {room.playerCount}/4 玩家 · {room.spectatorCount} 观战 · revision {room.revision}
                </span>
              </button>
            ))}
            {online.rooms.length === 0 && <p className="empty-history">暂时没有公开房间。</p>}
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="online-game-shell">
      <div className="online-room-bar">
        <div>
          <p className="panel-eyebrow">ONLINE ROOM</p>
          <strong>{online.lobby.roomId}</strong>
          <span>
            第 {online.snapshot?.match.roundNumber ?? 1}/{online.snapshot?.match.maxRounds ?? 1} 局
            · revision {online.snapshot?.revision ?? 0}
          </span>
        </div>
        <div className="online-room-actions">
          {online.session.role === 'player' && (
            <button
              className="ghost-button"
              onClick={() => online.setTrustee(!(participant?.trustee ?? false))}
              type="button"
            >
              {participant?.trustee ? '取消托管' : '开启托管'}
            </button>
          )}
          <button className="ghost-button" onClick={online.leaveRoom} type="button">
            离开房间
          </button>
        </div>
      </div>

      <div className="participant-strip">
        {online.lobby.participants.map((entry) => (
          <span className={entry.connected ? '' : 'is-offline'} key={entry.participantId}>
            {entry.displayName} ·{' '}
            {entry.role === 'spectator' ? '观战' : `${(entry.seat ?? 0) + 1}号位`}
            {entry.isHost ? ' · 房主' : ''}
            {entry.trustee ? ' · 托管' : ''}
          </span>
        ))}
      </div>
      {waitingForPlayers && (
        <div className="online-waiting">
          等待玩家入座：当前 {online.lobby.playerCount}/4，满员后开始操作。
        </div>
      )}
      {online.error !== null && (
        <div className="online-error" role="alert">
          {online.error}
        </div>
      )}
      {gameView !== null && (
        <MahjongTable
          view={gameView}
          botThinking={false}
          isReplaying={false}
          onAction={online.dispatch}
          onReset={online.startNextRound}
          resetDisabled={online.snapshot?.match.phase === 'finished'}
          resetLabel={online.snapshot?.match.phase === 'finished' ? '比赛已结束' : '开始下一局'}
        />
      )}
    </section>
  );
}
