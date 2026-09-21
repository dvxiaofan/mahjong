import type { NormalTile } from '../src/tiles.ts';
import type { GameAction, PlayerView } from '../src/types.ts';
import { findDiscardAction } from './uiModel';

export const HAND_SETTINGS_KEY = 'play-mahjong.hand.v1';
export interface HandSettings {
  confirmation: 'auto' | 'confirm' | 'direct';
  layout: 'wrap' | 'scroll';
}
export interface HandStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const DEFAULT_HAND_SETTINGS: Readonly<HandSettings> = {
  confirmation: 'auto',
  layout: 'wrap',
};

export function normalizeHandSettings(value: unknown): HandSettings {
  const input = value !== null && typeof value === 'object' ? (value as Partial<HandSettings>) : {};
  return {
    confirmation:
      input.confirmation === 'confirm' || input.confirmation === 'direct'
        ? input.confirmation
        : 'auto',
    layout: input.layout === 'scroll' ? 'scroll' : 'wrap',
  };
}

export function loadHandSettings(storage: HandStorage | null): HandSettings {
  try {
    return normalizeHandSettings(JSON.parse(storage?.getItem(HAND_SETTINGS_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_HAND_SETTINGS };
  }
}

export function saveHandSettings(storage: HandStorage | null, settings: HandSettings): boolean {
  if (storage === null) return false;
  try {
    storage.setItem(HAND_SETTINGS_KEY, JSON.stringify(normalizeHandSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function needsDiscardConfirmation(settings: HandSettings, touchOrNarrow: boolean): boolean {
  return settings.confirmation === 'confirm' || (settings.confirmation === 'auto' && touchOrNarrow);
}

export interface HandSelection {
  context: object;
  index: number;
  tile: NormalTile;
}

/** A selection never authorizes an action; resolve it again against the current projection. */
export function selectedDiscard(
  selection: HandSelection | null,
  context: object,
  player: Pick<PlayerView, 'seat' | 'concealedTiles'>,
  actions: readonly GameAction[],
): Extract<GameAction, { type: 'discard' }> | null {
  if (
    selection === null ||
    selection.context !== context ||
    !Number.isInteger(selection.index) ||
    selection.index < 0 ||
    player.concealedTiles[selection.index] !== selection.tile
  )
    return null;
  const action = findDiscardAction(actions, selection.tile);
  return action?.seat === player.seat ? action : null;
}

export function orderedHand(tiles: readonly NormalTile[], lastDrawnTile: NormalTile | null) {
  const drawnIndex = lastDrawnTile === null ? -1 : tiles.lastIndexOf(lastDrawnTile);
  const entries = tiles.map((tile, index) => ({ tile, index, drawn: index === drawnIndex }));
  return [...entries.filter((entry) => !entry.drawn), ...entries.filter((entry) => entry.drawn)];
}

/** Keep the drag flag until the next press: browsers may emit click after pointerup/cancel. */
export class HandPress {
  private origin: { id: number; x: number; y: number } | null = null;
  private moved = false;

  start(id: number, x: number, y: number): void {
    this.origin = { id, x, y };
    this.moved = false;
  }
  move(id: number, x: number, y: number): void {
    if (this.origin?.id !== id) return;
    if (Math.hypot(x - this.origin.x, y - this.origin.y) >= 8) this.moved = true;
  }
  cancel(): void {
    this.moved = true;
  }
  canClick(detail: number): boolean {
    return detail === 0 || !this.moved;
  }
}
