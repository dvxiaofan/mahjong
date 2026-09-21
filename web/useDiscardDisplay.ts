import { useEffect, useState } from 'react';

export const DISCARD_HOLD_MS = 800;
export const DISCARD_FLIGHT_MS = 320;
export type DiscardDisplayStage = 'featured' | 'flying' | 'settled';

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

interface DiscardDisplayOptions {
  id: string;
  available: boolean;
  pending: boolean;
  animate: boolean;
  live: boolean;
}

function initialDisplay({ id, pending, animate, live }: DiscardDisplayOptions) {
  return {
    id,
    introducedAt: Date.now(),
    animateArrival: animate && live,
    canFly: live && (pending || animate),
    stage:
      pending || (animate && live) ? ('featured' as const) : ('settled' as DiscardDisplayStage),
  };
}

/** Presentation time never changes the game clock or waits for an animation to accept actions. */
export function useDiscardDisplay(options: DiscardDisplayOptions) {
  const reducedMotion = useReducedMotion();
  const [entry, setEntry] = useState(() => initialDisplay(options));
  // Reset during render so a new identity cannot briefly inherit the previous tile's stage.
  const current = entry.id === options.id ? entry : initialDisplay(options);
  if (entry.id !== options.id) setEntry(current);
  const stage: DiscardDisplayStage = !options.available
    ? 'settled'
    : options.pending
      ? 'featured'
      : current.canFly
        ? current.stage
        : 'settled';

  useEffect(() => {
    if (!options.available || options.pending || !current.canFly || stage === 'settled') return;
    const duration =
      stage === 'featured'
        ? Math.max(0, current.introducedAt + DISCARD_HOLD_MS - Date.now())
        : reducedMotion
          ? 0
          : DISCARD_FLIGHT_MS;
    const timer = window.setTimeout(
      () =>
        setEntry((previous) =>
          previous.id === current.id
            ? { ...previous, stage: stage === 'featured' && !reducedMotion ? 'flying' : 'settled' }
            : previous,
        ),
      duration,
    );
    return () => window.clearTimeout(timer);
  }, [
    current.canFly,
    current.id,
    current.introducedAt,
    options.available,
    options.pending,
    reducedMotion,
    stage,
  ]);

  return { stage, animateArrival: current.animateArrival && !reducedMotion };
}
