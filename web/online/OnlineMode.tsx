import { useState, type FormEvent } from 'react';
import type { LobbyRoomView, PublicParticipant } from '../../src/lobby.ts';
import type { MatchView, SpectatorMatchView } from '../../src/room.ts';
import type { Seat } from '../../src/types.ts';
import { MahjongTable } from '../components/MahjongTable';
import type { SeatDecoration } from '../components/PlayerSeat';
import type { RoundDealerReason } from '../components/RoundSetupPanel';
import { randomNickname, randomRoomName } from './roomNames';
import { useOnlineGame } from './useOnlineGame';
import { roomIdFromSearch } from '../appMode';
import { RoomInvitePanel } from './RoomInvitePanel';

/** Map seated participants to the per-seat identity badges the table shows. */
export function seatDecorationsFor(lobby: LobbyRoomView): Partial<Record<Seat, SeatDecoration>> {
  const decorations: Partial<Record<Seat, SeatDecoration>> = {};
  for (const participant of lobby.participants) {
    if (participant.role !== 'player' || participant.seat === null) continue;
    decorations[participant.seat] = {
      name: participant.displayName,
      host: participant.isHost,
      bot: participant.bot,
    };
  }
  return decorations;
}

export function hostOf(lobby: LobbyRoomView): PublicParticipant | undefined {
  return lobby.participants.find((participant) => participant.isHost);
}

export function getOnlineDealerReason(match: MatchView | SpectatorMatchView): RoundDealerReason {
  if (match.roundNumber === 1) {
    return match.dealerSelection === null ? 'assigned' : 'initial-dice';
  }
  const previousRound = match.history.find(
    (record) => record.roundNumber === match.roundNumber - 1,
  );
  if (previousRound?.result.winner !== null && previousRound?.result.winner !== undefined) {
    return 'previous-winner';
  }
  if (previousRound !== undefined) {
    return previousRound.dealerSeat === match.dealerSeat ? 'draw-stay' : 'draw-rotate';
  }
  return 'assigned';
}

export function OnlineMode() {
  const online = useOnlineGame();
  const [roomId, setRoomId] = useState(
    () =>
      (typeof window === 'undefined' ? null : roomIdFromSearch(window.location.search)) ??
      randomRoomName(),
  );
  const [displayName, setDisplayName] = useState(() => randomNickname());
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'player' | 'spectator'>('player');
  const [maxRounds, setMaxRounds] = useState(8);
  const participant = online.lobby?.participants.find(
    (candidate) => candidate.participantId === online.session?.participantId,
  );
  const host = online.lobby === null ? undefined : hostOf(online.lobby);
  const isHost = participant?.isHost ?? false;
  const started = online.lobby?.started ?? false;
  const waitingForPlayers =
    online.session?.role === 'player' && (online.lobby?.playerCount ?? 0) < 4;
  const gameView = online.snapshot?.match.game ?? null;
  const actionDisabledReason =
    online.status !== 'connected'
      ? '连接已断开，重连后继续操作'
      : !started
        ? isHost
          ? '人齐后点击「开始牌局」'
          : '等待房主开始牌局'
        : waitingForPlayers
          ? '等待四位玩家入座后继续'
          : participant?.trustee
            ? '当前由托管代打，取消托管后可操作'
            : undefined;

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
            <h2>创建牌桌</h2>
            <label>
              房间 ID
              <span className="input-with-action">
                <input
                  maxLength={64}
                  onChange={(event) => setRoomId(event.currentTarget.value)}
                  value={roomId}
                />
                <button
                  aria-label="换一个房间名"
                  className="ghost-button"
                  onClick={() => setRoomId(randomRoomName())}
                  title="换一个随机房间名"
                  type="button"
                >
                  换一个
                </button>
              </span>
            </label>
            <label>
              昵称
              <span className="input-with-action">
                <input
                  maxLength={24}
                  onChange={(event) => setDisplayName(event.currentTarget.value)}
                  value={displayName}
                />
                <button
                  aria-label="换一个花名"
                  className="ghost-button"
                  onClick={() => setDisplayName(randomNickname())}
                  title="换一个随机花名"
                  type="button"
                >
                  换一个
                </button>
              </span>
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
              <span className="input-with-action">
                <input
                  maxLength={24}
                  onChange={(event) => setDisplayName(event.currentTarget.value)}
                  value={displayName}
                />
                <button
                  aria-label="换一个花名"
                  className="ghost-button"
                  onClick={() => setDisplayName(randomNickname())}
                  title="换一个随机花名"
                  type="button"
                >
                  换一个
                </button>
              </span>
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
            <h2>可见房间</h2>
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
          <strong>{online.lobby.roomId}</strong>
          <span className="room-host-label">
            房主：{host?.displayName ?? '暂无'}
            {isHost ? '（你）' : ''}
          </span>
          <span>
            {started
              ? `第 ${online.snapshot?.match.roundNumber ?? 1}/${online.snapshot?.match.maxRounds ?? 1} 局`
              : '未开局'}
            {' · '}
            {online.lobby.playerCount}/4 人
          </span>
        </div>
        <div className="online-room-actions">
          {isHost && !started && (
            <button
              className="online-primary-button"
              disabled={!online.lobby.readyToStart || online.status !== 'connected'}
              onClick={online.startMatch}
              type="button"
            >
              开始牌局
            </button>
          )}
          {isHost && online.lobby.playerCount < 4 && (
            <button
              className="ghost-button"
              disabled={online.status !== 'connected'}
              onClick={online.addBot}
              type="button"
            >
              补一个机器人
            </button>
          )}
          {online.session.role === 'player' && started && (
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
          <span
            className={[
              entry.connected ? '' : 'is-offline',
              entry.isHost ? 'is-host' : '',
              entry.bot ? 'is-bot' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={entry.participantId}
          >
            {entry.isHost ? '房主 · ' : ''}
            {entry.displayName} ·{' '}
            {entry.role === 'spectator' ? '观战' : `${(entry.seat ?? 0) + 1}号位`}
            {entry.bot ? ' · 机器人' : entry.trustee && started ? ' · 托管' : ''}
            {entry.bot && isHost && !started && (
              <button
                aria-label={`移走${entry.displayName}`}
                className="participant-remove"
                onClick={() => online.removeBot(entry.participantId)}
                type="button"
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      <RoomInvitePanel lobby={online.lobby} />
      {!started && (
        <div className="online-waiting" role="status">
          {online.lobby.readyToStart
            ? isHost
              ? '四个座位已满，点击「开始牌局」发牌。'
              : `四个座位已满，等待房主 ${host?.displayName ?? ''} 开始牌局。`
            : isHost
              ? `等待玩家入座：当前 ${online.lobby.playerCount}/4。人不够可以补机器人，人齐后由你开局。`
              : `等待玩家入座：当前 ${online.lobby.playerCount}/4，人齐后由房主开局。`}
        </div>
      )}
      {started && waitingForPlayers && (
        <div className="online-waiting" role="status">
          有玩家离开，当前 {online.lobby.playerCount}/4。
          {isHost ? '你可以补一个机器人继续。' : '等待房主补位。'}
        </div>
      )}
      {online.error !== null && (
        <div className="online-error" role="alert">
          {online.error}
        </div>
      )}
      {gameView !== null && started && (
        <MahjongTable
          view={gameView}
          botThinking={false}
          isReplaying={false}
          seatDecorations={seatDecorationsFor(online.lobby)}
          actionPending={online.actionPending}
          actionDisabledReason={actionDisabledReason}
          roundKey={`${online.session.roomId}:${online.snapshot!.match.roundNumber}`}
          animateDiscards={online.status === 'connected'}
          onAction={online.dispatch}
          onReset={online.startNextRound}
          resetDisabled={online.snapshot?.match.phase === 'finished'}
          resetLabel={online.snapshot?.match.phase === 'finished' ? '比赛已结束' : '开始下一局'}
          roundSetup={{
            roundNumber: online.snapshot!.match.roundNumber,
            dealerReason: getOnlineDealerReason(online.snapshot!.match),
            dealerSelection: online.snapshot!.match.dealerSelection,
            opening: online.snapshot!.match.opening,
          }}
        />
      )}
    </section>
  );
}
