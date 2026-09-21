import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game.ts';
import { projectStateForSeat } from '../src/view.ts';
import type { PlayerView } from '../src/types.ts';
import {
  DEFAULT_HAND_SETTINGS,
  HAND_SETTINGS_KEY,
  HandPress,
  loadHandSettings,
  needsDiscardConfirmation,
  normalizeHandSettings,
  orderedHand,
  saveHandSettings,
  selectedDiscard,
} from './handSettings';
import { SelfHand } from './components/SelfHand';

describe('手牌选择与真实动作', () => {
  it('移动最后摸到的一张到末尾，保留重复牌的原索引与牌数，不修改引擎数组', () => {
    const tiles = ['m1', 'm7', 'm7', 'p2', 's9'] as const;
    expect(orderedHand(tiles, 'm7')).toEqual([
      { tile: 'm1', index: 0, drawn: false },
      { tile: 'm7', index: 1, drawn: false },
      { tile: 'p2', index: 3, drawn: false },
      { tile: 's9', index: 4, drawn: false },
      { tile: 'm7', index: 2, drawn: true },
    ]);
    expect(tiles).toEqual(['m1', 'm7', 'm7', 'p2', 's9']);
    expect(orderedHand(tiles, null).map((entry) => entry.tile)).toEqual(tiles);
  });

  it('确认时使用当前合法动作，拒绝旧快照、缺牌、变更索引、其他座位与已禁用操作', () => {
    const view = projectStateForSeat(createGame({ seed: 3 }), 0);
    const player = view.players[0] as PlayerView;
    const action = view.legalActions.find((action) => action.type === 'discard')!;
    if (action.type !== 'discard') throw new Error('缺少出牌动作');
    const selection = {
      context: view,
      index: player.concealedTiles.indexOf(action.tile),
      tile: action.tile,
    };
    expect(selectedDiscard(selection, view, player, view.legalActions)).toBe(action);
    expect(selectedDiscard(selection, { ...view }, player, view.legalActions)).toBeNull();
    expect(selectedDiscard(selection, view, player, [])).toBeNull();
    expect(selectedDiscard(selection, view, player, [{ ...action, seat: 1 }])).toBeNull();
    expect(
      selectedDiscard(selection, view, { ...player, concealedTiles: [] }, view.legalActions),
    ).toBeNull();
    for (const index of [-1, 0.5, 99])
      expect(selectedDiscard({ ...selection, index }, view, player, view.legalActions)).toBeNull();
  });

  it('确认模式显示可辨认的独立牌、牌名和禁止空提交；只读手牌没有出牌入口', () => {
    const view = projectStateForSeat(createGame({ seed: 3 }), 0);
    const player = view.players[0] as PlayerView;
    const props = {
      player,
      lastDrawnTile: view.lastDrawnTile,
      onAction: () => undefined,
      interaction: {
        context: view,
        settings: { ...DEFAULT_HAND_SETTINGS },
        confirmDiscard: true,
        saved: true,
        update: () => undefined,
      },
    };
    const html = renderToStaticMarkup(<SelfHand {...props} actions={view.legalActions} />);
    expect(html).toContain('确认出牌，请先选牌');
    expect(html).toContain('disabled=""');
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(player.concealedTileCount);
    expect(html.match(/data-tile=/g)).toHaveLength(player.concealedTileCount);
    const readonly = renderToStaticMarkup(<SelfHand {...props} actions={[]} />);
    expect(readonly).not.toContain('<button');
    expect(readonly).not.toContain('aria-pressed');
  });
});

describe('触控误操作保护与偏好', () => {
  it('拖动、取消和滚动后的鼠标点击无效，键盘及下一次新按压仍可操作', () => {
    const press = new HandPress();
    press.start(1, 10, 10);
    press.move(1, 12, 12);
    expect(press.canClick(1)).toBe(true);
    press.move(1, 18, 10);
    expect(press.canClick(1)).toBe(false);
    expect(press.canClick(0)).toBe(true);
    press.start(2, 10, 10);
    expect(press.canClick(1)).toBe(true);
    press.move(1, 99, 99);
    expect(press.canClick(1)).toBe(true);
    press.cancel();
    expect(press.canClick(1)).toBe(false);
    press.start(3, 0, 0);
    press.move(3, 6, 6);
    expect(press.canClick(1)).toBe(false);
  });

  it('自动模式只在触屏或窄屏确认，显式偏好不随视口改变', () => {
    for (const touch of [false, true]) {
      expect(needsDiscardConfirmation({ ...DEFAULT_HAND_SETTINGS }, touch)).toBe(touch);
      expect(needsDiscardConfirmation({ confirmation: 'confirm', layout: 'wrap' }, touch)).toBe(
        true,
      );
      expect(needsDiscardConfirmation({ confirmation: 'direct', layout: 'wrap' }, touch)).toBe(
        false,
      );
    }
  });

  it('持久化仅接受支持的偏好，损坏或禁止的存储安全回退', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    expect(saveHandSettings(storage, { confirmation: 'confirm', layout: 'scroll' })).toBe(true);
    expect(loadHandSettings(storage)).toEqual({ confirmation: 'confirm', layout: 'scroll' });
    data.set(HAND_SETTINGS_KEY, 'invalid');
    expect(loadHandSettings(storage)).toEqual(DEFAULT_HAND_SETTINGS);
    expect(normalizeHandSettings({ confirmation: 'inject', layout: 'large' })).toEqual(
      DEFAULT_HAND_SETTINGS,
    );
    const blocked = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadHandSettings(blocked)).toEqual(DEFAULT_HAND_SETTINGS);
    expect(saveHandSettings(blocked, { ...DEFAULT_HAND_SETTINGS })).toBe(false);
  });
});
