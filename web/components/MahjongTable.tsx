import { useEffect, useMemo, useRef } from 'react';
import type { GameAction, GameAudienceView, PlayerViewEntry, Seat } from '../../src/types.ts';
import { ActionBar } from './ActionBar';
import { DiscardNotice } from './DiscardNotice';
import { EventFeed } from './EventFeed';
import { PlayerSeat, type SeatDecoration } from './PlayerSeat';
import { ResultPanel } from './ResultPanel';
import { TableCenterLayer } from './TableCenterLayer';
import { TableActionNotice } from './TableActionNotice';
import { TableDiscardOverlay } from './TableDiscardOverlay';
import { TableSounds } from './TableAudio';
import { WinHelp } from './WinHelp';
import { useDiscardDisplay } from '../useDiscardDisplay';
import { useHandSettings } from '../useHandSettings';
import { RoundSetupPanel, type RoundSetupView } from './RoundSetupPanel';
import {
  getDiscardPresentation,
  shouldAnimateDiscard,
  type DiscardObservation,
} from '../discardPresentation';
import {
  formatEventForViewer,
  getInteractionPrompt,
  getSeatActivity,
  getSeatActivityLabel,
  getTurnLabel,
  seatLabel,
} from '../uiModel';

interface MahjongTableProps {
  view: GameAudienceView;
  botThinking: boolean;
  isReplaying: boolean;
  actionPending?: boolean;
  actionDisabledReason?: string | undefined;
  roundKey?: string;
  animateDiscards?: boolean;
  onAction: (action: GameAction) => void;
  onReset: () => void;
  resetLabel?: string;
  resetDisabled?: boolean;
  roundSetup?: RoundSetupView;
  /** Per-seat online identity (display name, host, bot); absent in local play. */
  seatDecorations?: Partial<Record<Seat, SeatDecoration>> | undefined;
}

type TablePosition = 'north' | 'west' | 'east' | 'south';

/** Absolute seats for a viewer on seat 0; other viewers rotate by their own seat. */
const seatRegions: ReadonlyArray<{ region: TablePosition; corner: string; seat: Seat }> = [
  { region: 'south', corner: 'sw', seat: 0 },
  { region: 'east', corner: 'se', seat: 1 },
  { region: 'north', corner: 'ne', seat: 2 },
  { region: 'west', corner: 'nw', seat: 3 },
];

function playerFor(view: GameAudienceView, seat: Seat): PlayerViewEntry {
  const player = view.players.find((entry) => entry.seat === seat);
  if (player === undefined) throw new Error(`视图缺少 ${seat} 号玩家`);
  return player;
}

export function MahjongTable({
  view,
  botThinking,
  isReplaying,
  actionPending = false,
  actionDisabledReason,
  roundKey = 'current-round',
  animateDiscards = true,
  onAction,
  onReset,
  resetLabel,
  resetDisabled,
  roundSetup,
  seatDecorations,
}: MahjongTableProps) {
  const submittedView = useRef<GameAudienceView | null>(null);
  const handSettings = useHandSettings();
  const handContext = useMemo(() => ({ view, roundKey }), [view, roundKey]);
  const tableRef = useRef<HTMLElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const discardTargetRef = useRef<HTMLSpanElement>(null);
  const blocked = actionPending || actionDisabledReason !== undefined;
  const actions = isReplaying || blocked || view.viewerSeat === null ? [] : view.legalActions;
  const interactionView = { ...view, legalActions: actions } as GameAudienceView;
  const prompt = isReplaying
    ? '正在查看历史局面，返回实时牌局后才能操作'
    : view.viewerSeat === null
      ? getInteractionPrompt(view, botThinking)
      : (actionDisabledReason ??
        (actionPending
          ? '正在提交，请等待牌局确认'
          : getInteractionPrompt(view, botThinking, handSettings.confirmDiscard)));
  const latestEvent = view.events.at(-1);
  const discard = getDiscardPresentation(view);
  const observation: DiscardObservation = {
    roundKey,
    viewerSeat: view.viewerSeat,
    live: !isReplaying && animateDiscards,
    eventCount: view.events.length,
    discardId: discard?.id ?? null,
  };
  const previousDiscard = useRef(observation);
  const animateNewDiscard = shouldAnimateDiscard(previousDiscard.current, observation);
  const discardKey = `${roundKey}:${view.viewerSeat}:${observation.live}:${discard?.id ?? 'none'}`;
  const discardDisplay = useDiscardDisplay({
    id: discardKey,
    available: view.result === null && discard !== null && discard.discardIndex !== null,
    pending: discard?.outcome === 'pending',
    animate: animateNewDiscard,
    live: observation.live,
  });
  const floatingDiscard = discardDisplay.stage !== 'settled';

  useEffect(() => {
    previousDiscard.current = observation;
  });

  useEffect(() => {
    if (!actionPending) submittedView.current = null;
  }, [view, actionPending]);

  function submitAction(action: GameAction) {
    if (submittedView.current === view || !actions.includes(action)) return;
    // Close the same-render double-click window; online requests also stay locked until ACK.
    submittedView.current = view;
    try {
      onAction(action);
    } catch (error) {
      submittedView.current = null;
      throw error;
    }
  }

  return (
    <div className="table-layout">
      <TableSounds view={view} roundKey={roundKey} live={!isReplaying && animateDiscards} />
      {roundSetup !== undefined && (
        <RoundSetupPanel key={roundKey} {...roundSetup} viewerSeat={view.viewerSeat} />
      )}
      <section className="felt-table" aria-label="麻将牌桌" ref={tableRef}>
        <div className="felt-highlight felt-highlight--one" />
        <div className="felt-highlight felt-highlight--two" />

        <TableCenterLayer tableRef={tableRef} centerRef={centerRef} withDiscard={floatingDiscard}>
          <TableActionNotice
            view={view}
            contextKey={roundKey}
            live={!isReplaying && animateDiscards}
          />
          {floatingDiscard && discard !== null && (
            <TableDiscardOverlay
              key={discardKey}
              discard={discard}
              stage={discardDisplay.stage}
              animateArrival={discardDisplay.animateArrival}
              viewerSeat={view.viewerSeat}
              isReplaying={isReplaying}
              centerRef={centerRef}
              targetRef={discardTargetRef}
            />
          )}
        </TableCenterLayer>

        <section className="table-dial" aria-label="牌局局况">
          <div className="table-dial-heading">
            <span className="table-dial-round">
              {roundSetup === undefined ? '牌局进行中' : `第 ${roundSetup.roundNumber} 局`}
              {roundSetup !== undefined && ` · ${isReplaying ? '回放' : '进行中'}`}
            </span>
            <strong className="table-dial-prompt">
              {view.viewerSeat === null ? prompt : getTurnLabel(view)}
            </strong>
          </div>
          <div className="table-hud" aria-label="牌桌状态">
            <div className="wall-summary">
              <span className="wall-label">牌墙剩余</span>
              <strong className="wall-count">{view.wallRemaining}</strong>
              <span className="wall-caption">张</span>
            </div>
            <div className="turn-summary">
              <span className="turn-line">
                <span className="turn-dot" aria-hidden="true" />
                {isReplaying ? '回放 · ' : '当前：'}
                {getTurnLabel(view)}
              </span>
            </div>
            <DiscardNotice key={discardKey} view={interactionView} isReplaying={isReplaying} />
          </div>
          <div className="table-mark">
            <span>逆时针</span>
            <span>庄家 · {seatLabel(view.dealerSeat, view.viewerSeat)}</span>
          </div>
        </section>

        {seatRegions.map(({ corner, seat: relativeSeat }) => {
          const baseSeat = view.viewerSeat ?? 0;
          const seat = ((baseSeat + relativeSeat) % 4) as Seat;
          const decoration = seatDecorations?.[seat];
          return (
            <div
              className={`seat-corner-card seat-corner-card--${corner}`}
              key={corner}
              aria-label={`${seatLabel(seat, view.viewerSeat)}座位信息`}
            >
              <div className="seat-corner-head">
                <span className="seat-corner-number">{seat + 1}</span>
                <strong>{seatLabel(seat, view.viewerSeat)}</strong>
                {decoration?.name !== undefined && (
                  <span className="seat-corner-name">{decoration.name}</span>
                )}
              </div>
              <div className="seat-corner-meta">
                {decoration?.host === true && (
                  <span className="seat-badge seat-badge--host">👑 房主</span>
                )}
                {decoration?.bot === true && (
                  <span className="seat-badge seat-badge--bot">机器人</span>
                )}
                {view.dealerSeat === seat && <span>庄家</span>}
                <span>{playerFor(view, seat).score} 分</span>
              </div>
              <div className="seat-corner-status">
                {getSeatActivityLabel(interactionView, seat, isReplaying) ?? '等待中'}
              </div>
            </div>
          );
        })}

        {seatRegions.map(({ region: position, seat: relativeSeat }) => {
          const baseSeat = view.viewerSeat ?? 0;
          const seat = ((baseSeat + relativeSeat) % 4) as Seat;
          return (
            <div className={`seat-slot seat-slot--${position}`} key={position}>
              <PlayerSeat
                activity={getSeatActivity(view, seat)}
                activityLabel={getSeatActivityLabel(interactionView, seat, isReplaying)}
                dealer={view.dealerSeat === seat}
                lastDrawnTile={seat === view.viewerSeat ? view.lastDrawnTile : null}
                revealHand={view.phase === 'finished' && view.result?.outcome === 'win'}
                winningTile={view.result?.winner === seat ? view.result.winningTile : null}
                legalActions={seat === view.viewerSeat ? actions : []}
                handInteraction={
                  seat === view.viewerSeat ? { context: handContext, ...handSettings } : undefined
                }
                label={view.viewerSeat === null ? seatLabel(seat, null) : undefined}
                decoration={seatDecorations?.[seat]}
                onAction={submitAction}
                player={playerFor(view, seat)}
                position={position}
                discardHighlight={
                  discard?.seat === seat
                    ? {
                        presentation: discard,
                        floating: floatingDiscard,
                        targetRef: discardTargetRef,
                      }
                    : undefined
                }
                controls={
                  seat === view.viewerSeat ? (
                    <>
                      <ActionBar
                        actions={actions}
                        botThinking={botThinking}
                        isReplaying={isReplaying}
                        busy={actionPending}
                        pendingTile={
                          view.phase === 'claiming' ? (view.pendingDiscard?.tile ?? null) : null
                        }
                        onAction={submitAction}
                        prompt={prompt}
                        responding={view.phase === 'claiming'}
                      />
                      <WinHelp
                        key={`${roundKey}:${view.viewerSeat}`}
                        view={view}
                        isReplaying={isReplaying}
                        actionPending={actionPending}
                        actionDisabledReason={actionDisabledReason}
                      />
                    </>
                  ) : undefined
                }
              />
            </div>
          );
        })}
      </section>

      {view.viewerSeat === null && (
        <div className="table-status-strip" aria-live="polite">
          <span className="status-icon">
            {view.phase === 'finished' ? '胡' : view.phase === 'drawn' ? '荒' : '局'}
          </span>
          <span className="status-copy">
            <strong>{prompt}</strong>
            <small>
              {latestEvent === undefined
                ? '牌局准备就绪'
                : formatEventForViewer(latestEvent, view.viewerSeat)}
            </small>
          </span>
        </div>
      )}

      <ResultPanel
        view={view}
        onReset={onReset}
        {...(resetLabel === undefined ? {} : { resetLabel })}
        resetDisabled={resetDisabled || isReplaying || blocked || view.viewerSeat === null}
      />

      <section className="table-lower-grid">
        <EventFeed events={view.events} viewerSeat={view.viewerSeat} live={!isReplaying} />
      </section>
    </div>
  );
}
