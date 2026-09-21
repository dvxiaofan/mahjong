import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, getLegalActions } from '../../src/game.ts';
import { getWaitingTiles } from '../../src/rules.ts';
import {
  ALL_TILE_TYPES,
  NORMAL_TILE_TYPES,
  SUITS,
  createTileSet,
  sortTiles,
  tileLabel,
  tileRank,
  tileSortKey,
  tileSuit,
  type NormalTile,
  type SuitedTile,
  type Tile,
} from '../../src/tiles.ts';
import { SEATS, type GameState, type Meld, type Seat } from '../../src/types.ts';
import { projectStateForSeat, projectStateForSpectator } from '../../src/view.ts';
import { MahjongTileFace } from '../components/MahjongTileFace';
import { MahjongTable } from '../components/MahjongTable';
import { getDiscardPresentation } from '../discardPresentation';
import { getTableActionNotice } from '../tableFeedback';

interface TileReference {
  tile: Tile;
  label: string;
  suit: 'm' | 'p' | 's' | null;
  rank: number | null;
  sha256: string;
  crop: { x: number; y: number; w: number; h: number };
}

// This is a visually reviewed baseline, independent of the renderer's filename mapping.
const reference = JSON.parse(
  readFileSync(new URL('./tile-face-reference.json', import.meta.url), 'utf8'),
) as { tiles: TileReference[] };
const cropMap = JSON.parse(
  readFileSync(new URL('../public/tiles/tile-map.json', import.meta.url), 'utf8'),
) as Record<string, TileReference['crop']>;

function expectedLabel(tile: Tile): string {
  return reference.tiles.find((entry) => entry.tile === tile)!.label;
}

function faceUrl(tile: Tile): string {
  const markup = renderToStaticMarkup(<MahjongTileFace tile={tile} />);
  const src = markup.match(/<img\b[^>]*\bsrc="([^"]+)"/)?.[1];
  expect(src).toBeDefined();
  return src!;
}

function verifyConservation(state: GameState): void {
  const tiles: Tile[] = state.wall.tiles.slice(
    state.wall.drawIndex,
    state.wall.replacementIndex + 1,
  );
  for (const player of state.players) {
    tiles.push(...player.concealedTiles, ...player.discards);
    for (const meld of player.melds) {
      tiles.push(...Array.from({ length: meld.kind === 'pong' ? 3 : 4 }, () => meld.tile));
    }
    tiles.push(...Array.from({ length: player.fortuneCount }, () => 'fortune' as const));
  }
  expect(tiles).toHaveLength(120);
  for (const tile of ALL_TILE_TYPES) {
    expect(
      tiles.filter((candidate) => candidate === tile),
      tile,
    ).toHaveLength(4);
  }

  // Each meld occupies three hand slots; its fourth physical tile is counted above.
  if (state.phase === 'drawn') return;
  for (const player of state.players) {
    const effectiveSize = player.concealedTiles.length + player.melds.length * 3;
    const awaitingReplacement =
      state.phase === 'awaiting-draw' &&
      state.drawMode === 'replacement' &&
      player.seat === state.currentSeat;
    const hasExtraTile =
      (state.phase === 'awaiting-discard' && player.seat === state.currentSeat) ||
      (state.phase === 'finished' && player.seat === state.result?.winner);
    const allowedSizes = awaitingReplacement ? [12, 13] : [hasExtraTile ? 14 : 13];
    expect(allowedSizes, `${state.phase}: ${player.seat}号玩家手牌数`).toContain(effectiveSize);
  }
}

interface Scenario {
  seat: Seat;
  phase?: 'awaiting-draw' | 'awaiting-discard';
  hands?: Partial<Record<Seat, NormalTile[]>>;
  melds?: Partial<Record<Seat, Meld[]>>;
  fortunes?: Partial<Record<Seat, number>>;
  front?: Tile[];
  back?: Tile[];
  lastDrawnTile?: NormalTile;
}

/** Build complete, physically possible four-player positions from the real 120-tile set. */
function scenario(options: Scenario): GameState {
  const state = createGame({ seed: 16 });
  const pool = createTileSet();
  const reserved = new Set<Tile>();
  const take = (tile: Tile) => {
    const index = pool.indexOf(tile);
    if (index < 0) throw new Error(`验收牌局超出四张上限：${tile}`);
    pool.splice(index, 1);
    reserved.add(tile);
  };
  for (const player of state.players) {
    player.concealedTiles = [...(options.hands?.[player.seat] ?? [])];
    player.melds = [...(options.melds?.[player.seat] ?? [])];
    player.fortuneCount = options.fortunes?.[player.seat] ?? 0;
    player.discards = [];
    player.gangs = [];
    player.score = 0;
    player.mouthDeclared = false;
    player.mouthRequired = false;
    player.lockedWaits = [];
    for (const tile of player.concealedTiles) take(tile);
    for (const meld of player.melds) {
      for (let count = 0; count < (meld.kind === 'pong' ? 3 : 4); count++) take(meld.tile);
    }
    for (let count = 0; count < player.fortuneCount; count++) take('fortune');
  }
  const front = options.front ?? [];
  const back = options.back ?? [];
  for (const tile of [...front, ...back]) take(tile);
  const phase = options.phase ?? 'awaiting-discard';
  for (const player of state.players) {
    const size =
      (player.seat === options.seat && phase === 'awaiting-discard' ? 14 : 13) -
      player.melds.length * 3;
    while (player.concealedTiles.length < size) {
      const index = pool.findIndex((tile) => tile !== 'fortune' && !reserved.has(tile));
      if (index < 0) throw new Error('无法填充验收牌局');
      player.concealedTiles.push(pool.splice(index, 1)[0] as NormalTile);
    }
    expect(player.concealedTiles).toHaveLength(size);
    player.concealedTiles = sortTiles(player.concealedTiles);
  }
  const wall = [...front, ...pool, ...back];
  Object.assign(state, {
    currentSeat: options.seat,
    phase,
    drawMode: phase === 'awaiting-draw' ? 'normal' : null,
    lastDrawnTile: options.lastDrawnTile ?? null,
    wall: { tiles: wall, drawIndex: 0, replacementIndex: wall.length - 1 },
    events: [],
    payments: [],
    pendingDiscard: null,
    result: null,
    drawAfterGang: false,
  });
  verifyConservation(state);
  return state;
}

function publicTile(state: GameState, tile: NormalTile): void {
  const views = [
    ...SEATS.map((seat) => projectStateForSeat(state, seat)),
    projectStateForSpectator(state),
  ];
  for (const view of views) {
    expect(view.events.at(-1)?.tile).toBe(tile);
    expect(view.events.at(-1)?.message).toContain(expectedLabel(tile));
  }
  verifyConservation(state);
}

function resolveClaim(
  state: GameState,
  actor: Seat,
  type: 'pong' | 'exposed-kong' | 'win',
): GameState {
  const source = state.pendingDiscard!.discarder;
  for (const seat of SEATS) {
    if (seat !== source) state = applyAction(state, { type: seat === actor ? type : 'pass', seat });
  }
  return state;
}

function winningGroups(tile: NormalTile): NormalTile[] {
  const groups = SUITS.flatMap((suit) =>
    [1, 4, 7].map((start) =>
      [start, start + 1, start + 2].map((rank) => `${suit}${rank}` as NormalTile),
    ),
  );
  return groups
    .filter((group) => !group.includes(tile))
    .slice(0, 4)
    .flat();
}

describe('全牌面图案、名称与规则牌值对应', () => {
  it('仅30种牌各四张进入120张牌库，风牌和花牌素材不进入规则', () => {
    expect(reference.tiles.map((entry) => entry.tile)).toEqual(ALL_TILE_TYPES);
    expect(createTileSet()).toHaveLength(120);
    for (const tile of ALL_TILE_TYPES)
      expect(createTileSet().filter((value) => value === tile)).toHaveLength(4);
    expect(NORMAL_TILE_TYPES).toEqual(
      reference.tiles.filter((entry) => entry.tile !== 'fortune').map((entry) => entry.tile),
    );
    expect(sortTiles([...ALL_TILE_TYPES].reverse())).toEqual(ALL_TILE_TYPES);
  });

  it.each(reference.tiles)('$label 的实际图片内容、裁切坐标、名称、花色和点数相符', (entry) => {
    const url = new URL(faceUrl(entry.tile), 'http://localhost');
    expect(url.pathname).toMatch(/^\/tiles\/[a-z0-9]+\.png$/);
    const image = readFileSync(new URL(`../public${url.pathname}`, import.meta.url));
    expect(createHash('sha256').update(image).digest('hex')).toBe(entry.sha256);
    expect(cropMap[entry.tile]).toEqual(entry.crop);
    expect(tileLabel(entry.tile)).toBe(entry.label);
    expect(tileSortKey(entry.tile)).toBe(
      reference.tiles.findIndex((candidate) => candidate.tile === entry.tile),
    );
    if (entry.tile !== 'fortune') expect(tileSuit(entry.tile)).toBe(entry.suit);
    if (entry.suit !== null) expect(tileRank(entry.tile as SuitedTile)).toBe(entry.rank);
  });
});

describe('所有29种普通牌在四个座位的动作、状态与视图对应', () => {
  it.each(NORMAL_TILE_TYPES)('%s 的摸打、碰、三类杠及两类胡均操作同一张牌', (tile) => {
    for (const seat of SEATS) {
      const source = ((seat + 3) % 4) as Seat;
      let state = scenario({ seat, phase: 'awaiting-draw', front: [tile] });
      state = applyAction(state, { type: 'draw', seat });
      expect(state.players[seat]!.concealedTiles.filter((value) => value === tile)).toHaveLength(1);
      expect(state.lastDrawnTile).toBe(tile);
      expect(state.events.at(-1)).toMatchObject({
        type: 'draw',
        tile,
        message: `${seat}号玩家摸到${expectedLabel(tile)}`,
      });
      expect(projectStateForSeat(state, seat).lastDrawnTile).toBe(tile);
      expect(projectStateForSeat(state, source).events.at(-1)?.tile).toBeNull();
      verifyConservation(state);
      state = applyAction(state, { type: 'discard', seat, tile });
      expect(state.players[seat]!.concealedTiles).not.toContain(tile);
      expect(state.pendingDiscard?.tile).toBe(tile);
      expect(state.players[seat]!.discards.at(-1)).toBe(tile);
      expect(getDiscardPresentation(projectStateForSeat(state, source))).toMatchObject({
        tile,
        seat,
        outcome: 'pending',
      });
      const pendingHtml = renderToStaticMarkup(
        <MahjongTable
          view={projectStateForSeat(state, source)}
          botThinking={false}
          isReplaying={false}
          onAction={() => undefined}
          onReset={() => undefined}
        />,
      );
      expect(pendingHtml).toContain(`src="${faceUrl(tile)}"`);
      expect(pendingHtml).toContain(`待响应牌 ${expectedLabel(tile)}`);
      publicTile(state, tile);

      for (const type of ['pong', 'exposed-kong'] as const) {
        const amount = type === 'pong' ? 2 : 3;
        state = scenario({
          seat: source,
          hands: { [source]: [tile], [seat]: Array.from({ length: amount }, () => tile) },
        });
        state = applyAction(state, { type: 'discard', seat: source, tile });
        expect(getLegalActions(state, seat)).toContainEqual({ type, seat });
        state = resolveClaim(state, seat, type);
        expect(state.players[seat]!.melds).toContainEqual({ kind: type, tile, fromSeat: source });
        expect(state.players[seat]!.concealedTiles).not.toContain(tile);
        expect(state.players[source]!.discards).not.toContain(tile);
        expect(state.currentSeat).toBe(seat);
        expect(getTableActionNotice(projectStateForSeat(state, source), 0)).toMatchObject({
          tile,
          kind: type,
          seat,
        });
        publicTile(state, tile);
      }

      state = scenario({ seat, hands: { [seat]: [tile, tile, tile, tile] }, lastDrawnTile: tile });
      state = applyAction(state, { type: 'concealed-kong', seat, tile });
      expect(state.players[seat]!.melds).toContainEqual({ kind: 'concealed-kong', tile });
      expect(state.players[seat]!.concealedTiles).not.toContain(tile);
      expect(state.drawMode).toBe('replacement');
      publicTile(state, tile);

      state = scenario({
        seat,
        hands: { [seat]: [tile] },
        melds: { [seat]: [{ kind: 'pong', tile, fromSeat: source }] },
        lastDrawnTile: tile,
      });
      state = applyAction(state, { type: 'supplement-kong', seat, tile });
      expect(state.players[seat]!.melds).toEqual([{ kind: 'added-kong', tile, fromSeat: source }]);
      expect(state.players[seat]!.concealedTiles).not.toContain(tile);
      expect(state.players[seat]!.score).toBe(1);
      expect(state.players[source]!.score).toBe(-1);
      expect(state.drawMode).toBe('replacement');
      publicTile(state, tile);

      const beforeWin = [...winningGroups(tile), tile];
      expect(getWaitingTiles(beforeWin)).toContain(tile);
      state = scenario({
        seat,
        phase: 'awaiting-draw',
        hands: { [seat]: beforeWin },
        front: [tile],
      });
      state = applyAction(state, { type: 'draw', seat });
      expect(getLegalActions(state, seat)).toContainEqual({ type: 'win', seat });
      state = applyAction(state, { type: 'win', seat });
      expect(state.result).toMatchObject({
        winningTile: tile,
        winner: seat,
        winType: 'self-draw',
        fan: { total: 0 },
      });
      expect(state.players[seat]!.score).toBe(3);
      expect(state.players[seat]!.concealedTiles.filter((value) => value === tile)).toHaveLength(2);
      const finalView = projectStateForSpectator(state);
      expect(finalView.players.every((player) => player.visibility === 'revealed')).toBe(true);
      const finalHtml = renderToStaticMarkup(
        <MahjongTable
          view={finalView}
          botThinking={false}
          isReplaying={false}
          onAction={() => undefined}
          onReset={() => undefined}
        />,
      );
      expect(finalHtml).toContain(`胡牌张 ${expectedLabel(tile)}`);
      expect(finalHtml.match(/class="winning-tile"/g)).toHaveLength(1);
      publicTile(state, tile);

      state = scenario({
        seat: source,
        hands: { [source]: [tile], [seat]: beforeWin },
        fortunes: { [seat]: 1 },
      });
      state = applyAction(state, { type: 'discard', seat: source, tile });
      expect(getLegalActions(state, seat)).toContainEqual({ type: 'win', seat });
      state = resolveClaim(state, seat, 'win');
      expect(state.result).toMatchObject({
        winningTile: tile,
        winner: seat,
        winType: 'discard',
        fan: { total: 1 },
      });
      expect(state.players[seat]!.score).toBe(2);
      expect(state.players[source]!.score).toBe(-2);
      expect(state.players[source]!.discards).not.toContain(tile);
      expect(state.players[seat]!.concealedTiles.filter((value) => value === tile)).toHaveLength(2);
      publicTile(state, tile);
    }
  });

  it.each(NORMAL_TILE_TYPES)('发财从墙尾补成 %s，牌面、暗手与宝牌数量保持一致', (tile) => {
    for (const seat of SEATS) {
      let state = scenario({ seat, phase: 'awaiting-draw', front: ['fortune'], back: [tile] });
      state = applyAction(state, { type: 'draw', seat });
      expect(state.players[seat]!.fortuneCount).toBe(1);
      expect(state.players[seat]!.concealedTiles.filter((value) => value === tile)).toHaveLength(1);
      expect(state.players[seat]!.concealedTiles).not.toContain('fortune');
      expect(state.lastDrawnTile).toBe(tile);
      expect(state.events.at(-1)).toMatchObject({
        type: 'replacement-draw',
        tile,
        message: `${seat}号玩家补摸${expectedLabel(tile)}`,
      });
      expect(
        getLegalActions(state, seat).some(
          (action) => 'tile' in action && (action.tile as string) === 'fortune',
        ),
      ).toBe(false);
      verifyConservation(state);
    }
  });

  it('实体可达的三财四同牌局面不提供错误报嘴，但仍可暗杠', () => {
    const state = scenario({
      seat: 0,
      phase: 'awaiting-draw',
      fortunes: { 0: 3 },
      hands: { 0: ['m1', 'm1', 'm1', 'm1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 's7', 's8', 's9'] },
    });
    expect(getLegalActions(state, 0)).not.toContainEqual({ type: 'declare-mouth', seat: 0 });
    expect(getLegalActions(state, 0)).toContainEqual({
      type: 'concealed-kong',
      seat: 0,
      tile: 'm1',
    });
  });

  it.each(NORMAL_TILE_TYPES)('%s 摸牌前暗杠须先补牌，再完成本回合正常摸牌', (tile) => {
    for (const seat of SEATS) {
      const replacement = NORMAL_TILE_TYPES.find((value) => value !== tile)!;
      const normal = NORMAL_TILE_TYPES.find((value) => value !== tile && value !== replacement)!;
      let state = scenario({
        seat,
        phase: 'awaiting-draw',
        hands: { [seat]: [tile, tile, tile, tile] },
        front: [normal],
        back: [replacement],
      });
      state = applyAction(state, { type: 'concealed-kong', seat, tile });
      expect(getLegalActions(state, seat)).toEqual([{ type: 'draw', seat }]);
      state = applyAction(state, { type: 'draw', seat });
      expect(state.players[seat]!.concealedTiles).toHaveLength(10);
      expect(state.events.at(-1)).toMatchObject({ type: 'replacement-draw', tile: replacement });
      expect(state.phase).toBe('awaiting-draw');
      expect(state.drawMode).toBe('normal');
      expect(getLegalActions(state, seat).some((action) => action.type === 'discard')).toBe(false);
      verifyConservation(state);
      state = applyAction(state, { type: 'draw', seat });
      expect(state.players[seat]!.concealedTiles).toHaveLength(11);
      expect(state.lastDrawnTile).toBe(normal);
      expect(state.phase).toBe('awaiting-discard');
      expect(state.drawAfterGang).toBe(false);
      expect(state.events.at(-1)).toMatchObject({ type: 'draw', tile: normal });
      verifyConservation(state);
    }
  });

  it('摸牌前连续暗杠，每次先补牌，最后只正常摸一次', () => {
    let state = scenario({
      seat: 0,
      phase: 'awaiting-draw',
      hands: { 0: ['m1', 'm1', 'm1', 'm1', 'p1', 'p1', 'p1', 'p1', 's1', 's2', 's3', 's4', 's5'] },
      front: ['p9'],
      back: ['white', 'red'],
    });
    for (const [tile, size] of [
      ['m1', 10],
      ['p1', 7],
    ] as const) {
      state = applyAction(state, { type: 'concealed-kong', seat: 0, tile });
      state = applyAction(state, { type: 'draw', seat: 0 });
      expect(state.phase).toBe('awaiting-draw');
      expect(state.drawMode).toBe('normal');
      expect(state.players[0]!.concealedTiles).toHaveLength(size);
      expect(state.wall.drawIndex).toBe(0);
      verifyConservation(state);
    }
    state = applyAction(state, { type: 'draw', seat: 0 });
    expect(state.players[0]!.concealedTiles).toHaveLength(8);
    expect(state.players[0]!.melds).toHaveLength(2);
    expect(state.wall.drawIndex).toBe(1);
    expect(state.phase).toBe('awaiting-discard');
    verifyConservation(state);
  });

  it('暗杠前是否已经摸牌，决定补牌后继续摸牌或直接杠上开花', () => {
    const groups = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 's7', 's8', 's9'] as const;
    for (const alreadyDrawn of [false, true]) {
      let state = scenario({
        seat: 0,
        phase: alreadyDrawn ? 'awaiting-discard' : 'awaiting-draw',
        hands: {
          0: ['m1', 'm1', 'm1', 'm1', ...groups, ...(alreadyDrawn ? ['white' as const] : [])],
        },
        front: alreadyDrawn ? ['p9'] : ['white'],
        back: ['white'],
        ...(alreadyDrawn ? { lastDrawnTile: 'm1' as const } : {}),
      });
      state = applyAction(state, { type: 'concealed-kong', seat: 0, tile: 'm1' });
      state = applyAction(state, { type: 'draw', seat: 0 });
      if (!alreadyDrawn) state = applyAction(state, { type: 'draw', seat: 0 });
      expect(getLegalActions(state, 0)).toContainEqual({ type: 'win', seat: 0 });
      state = applyAction(state, { type: 'win', seat: 0 });
      expect(state.result).toMatchObject({
        winType: 'self-draw',
        winningTile: 'white',
        reason: alreadyDrawn ? 'gang-draw' : 'normal',
      });
      verifyConservation(state);
    }
  });

  it('摸牌前暗杠补成听牌，仍可在正常摸牌前报嘴并锁定自摸', () => {
    let state = scenario({
      seat: 0,
      phase: 'awaiting-draw',
      hands: { 0: ['m1', 'm1', 'm1', 'm1', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 's7', 's8', 's9'] },
      fortunes: { 0: 3 },
      front: ['white'],
      back: ['white'],
    });
    state = applyAction(state, { type: 'concealed-kong', seat: 0, tile: 'm1' });
    state = applyAction(state, { type: 'draw', seat: 0 });
    expect(state.phase).toBe('awaiting-draw');
    expect(state.players[0]!.mouthRequired).toBe(true);
    expect(getLegalActions(state, 0)).toContainEqual({ type: 'declare-mouth', seat: 0 });
    verifyConservation(state);
    state = applyAction(state, { type: 'declare-mouth', seat: 0 });
    expect(state.players[0]!.lockedWaits).toEqual(['white']);
    state = applyAction(state, { type: 'draw', seat: 0 });
    expect(getLegalActions(state, 0)).toEqual([{ type: 'win', seat: 0 }]);
    state = applyAction(state, { type: 'win', seat: 0 });
    expect(state.result).toMatchObject({ winningTile: 'white', reason: 'normal' });
    verifyConservation(state);
  });
});
