import type { GameAudienceView, Seat } from '../src/types.ts';
import { getLatestDiscard, type LatestDiscard } from './uiModel';

export interface DiscardPresentation extends LatestDiscard {
  id: string;
  discardIndex: number | null;
  outcome: 'pending' | 'unclaimed' | 'pong' | 'exposed-kong' | 'win';
  claimedBy: Seat | null;
}

/** Locate the actual newest discard, never an older copy of a claimed tile. */
export function getDiscardPresentation(view: GameAudienceView): DiscardPresentation | null {
  const latest = getLatestDiscard(view);
  if (latest === null) return null;
  const pending = view.phase === 'claiming' && view.pendingDiscard !== null;
  const claim = pending
    ? undefined
    : view.events
        .slice(latest.eventIndex + 1)
        .find(
          (event) =>
            event.tile === latest.tile &&
            (event.type === 'pong' ||
              event.type === 'exposed-kong' ||
              (event.type === 'win' && view.result?.winType === 'discard')),
        );
  const outcome = pending
    ? 'pending'
    : claim?.type === 'pong'
      ? 'pong'
      : claim?.type === 'exposed-kong'
        ? 'exposed-kong'
        : claim?.type === 'win'
          ? 'win'
          : 'unclaimed';
  const discards = view.players.find((player) => player.seat === latest.seat)?.discards ?? [];
  const discardIndex =
    claim === undefined && discards.at(-1) === latest.tile ? discards.length - 1 : null;
  return {
    ...latest,
    id: `${latest.eventIndex}:${latest.seat}:${latest.tile}`,
    discardIndex,
    outcome,
    claimedBy: claim?.seat ?? null,
  };
}

export interface DiscardObservation {
  roundKey: string;
  viewerSeat: Seat | null;
  live: boolean;
  eventCount: number;
  discardId: string | null;
}

/** Only animate new live events; restored, rewound or reconnected snapshots are baselines. */
export function shouldAnimateDiscard(
  previous: DiscardObservation,
  next: DiscardObservation,
): boolean {
  return (
    previous.live &&
    next.live &&
    previous.roundKey === next.roundKey &&
    previous.viewerSeat === next.viewerSeat &&
    next.eventCount > previous.eventCount &&
    next.discardId !== null &&
    next.discardId !== previous.discardId
  );
}
