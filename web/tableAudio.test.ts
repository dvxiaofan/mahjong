import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGame } from '../src/game';
import { NORMAL_TILE_TYPES, type NormalTile } from '../src/tiles';
import { SEATS, type GameEvent, type GameState } from '../src/types';
import { projectStateForSeat, projectStateForSpectator } from '../src/view';
import {
  effectClipUrl,
  getLatestVoiceClip,
  TableAudioPlayer,
  TableSoundCursor,
  voiceClipUrl,
} from './tableAudio';

function position(events: GameEvent[] = []): GameState {
  const state = createGame({ seed: 5 });
  state.events = events;
  return state;
}

function discard(tile: NormalTile = 'm7'): GameEvent {
  return { type: 'discard', seat: 1, tile, message: '此文字不参与语音' };
}

describe('公开动作语音', () => {
  it.each(NORMAL_TILE_TYPES)('%s 的报牌资源与四家、观战的公开出牌一致', (tile) => {
    const state = position([discard(tile)]);
    for (const view of [
      ...SEATS.map((seat) => projectStateForSeat(state, seat)),
      projectStateForSpectator(state),
    ]) {
      expect(getLatestVoiceClip(view, 0)).toBe(tile);
      for (const pack of ['male', 'female'] as const) {
        const file = readFileSync(
          new URL(`./public${voiceClipUrl(tile, pack).split('?')[0]}`, import.meta.url),
        );
        expect(file.length).toBeGreaterThan(500);
        expect(file.subarray(0, 3).toString()).toBe('ID3');
      }
    }
  });

  it('男女声包各自独立，明杠与暗杠的文件和清单不串音', () => {
    expect(voiceClipUrl('exposed-kong', 'male')).toBe('/audio/mandarin-male/exposed-kong.mp3?v=2');
    expect(voiceClipUrl('exposed-kong', 'female')).toBe('/audio/mandarin/exposed-kong.mp3?v=2');
    for (const pack of ['male', 'female'] as const) {
      const directory = pack === 'male' ? 'mandarin-male' : 'mandarin';
      const manifest = JSON.parse(
        readFileSync(new URL(`./public/audio/${directory}/manifest.json`, import.meta.url), 'utf8'),
      ) as { clips: Record<string, string> };
      expect(manifest.clips['exposed-kong']).toBe('明杠');
      expect(manifest.clips['concealed-kong']).toBe('暗杠');
      const exposed = readFileSync(
        new URL(`./public${voiceClipUrl('exposed-kong', pack).split('?')[0]}`, import.meta.url),
      );
      const concealed = readFileSync(
        new URL(`./public${voiceClipUrl('concealed-kong', pack).split('?')[0]}`, import.meta.url),
      );
      expect(exposed.equals(concealed)).toBe(false);
    }
  });

  it('不会朗读自己或他人的暗牌、补摸牌与报嘴听口', () => {
    const state = position(
      ['deal', 'draw', 'replacement-draw'].flatMap((type) =>
        SEATS.map((seat) => ({
          type: type as GameEvent['type'],
          seat,
          tile: 'p7' as const,
          message: '秘密手牌：七筒',
        })),
      ),
    );
    for (const seat of SEATS)
      expect(getLatestVoiceClip(projectStateForSeat(state, seat), 0)).toBeNull();
    state.events.push({ type: 'mouth-declared', seat: 0, tile: null, message: '报嘴听七筒' });
    expect(getLatestVoiceClip(projectStateForSeat(state, 0), 0)).toBe('mouth');
  });

  it.each([
    ['pong', 'pong'],
    ['exposed-kong', 'exposed-kong'],
    ['concealed-kong', 'concealed-kong'],
    ['supplement-kong', 'supplement-kong'],
    ['fortune', 'fortune'],
    ['mouth-declared', 'mouth'],
    ['round-draw', 'drawn'],
    ['win', 'win'],
  ] as const)('%s 使用已打包的对应普通话音频', (type, expected) => {
    const state = position([{ type, seat: 0, tile: null, message: '公开动作' }]);
    expect(getLatestVoiceClip(projectStateForSeat(state, 0), 0)).toBe(expected);
    expect(
      readFileSync(new URL(`./public${voiceClipUrl(expected).split('?')[0]}`, import.meta.url))
        .length,
    ).toBeGreaterThan(500);
  });

  it('自摸使用独立语音；快速更新只读最新动作，不排队播报旧动作', () => {
    const state = position([
      { type: 'pong', seat: 0, tile: 'm1', message: '碰' },
      discard('m2'),
      { type: 'draw', seat: 2, tile: 's3', message: '私有摸牌' },
    ]);
    expect(getLatestVoiceClip(projectStateForSeat(state, 0), 0)).toBe('m2');
    expect(getLatestVoiceClip(projectStateForSeat(state, 0), 2)).toBeNull();
    state.result = {
      outcome: 'win',
      winner: 0,
      winType: 'self-draw',
      winningTile: 'm7',
      fan: { total: 0, items: [] },
      payments: [],
      reason: 'normal',
    };
    state.events.push({ type: 'win', seat: 0, tile: 'm7', message: '胡' });
    expect(getLatestVoiceClip(projectStateForSeat(state, 0), 3)).toBe('self-draw');
  });

  it('首次、重复快照、回放、重连、静音、新局与换座位不重播旧声音', () => {
    const state = position([discard()]);
    const cursor = new TableSoundCursor();
    const view = () => projectStateForSeat(state, 0);
    expect(cursor.observe(view(), 'round-1', true)).toBeNull();
    expect(cursor.observe(view(), 'round-1', true)).toBeNull();
    state.events.push(discard());
    expect(cursor.observe(view(), 'round-1', true)).toBe('m7');
    for (let index = 0; index < 3; index++) {
      expect(cursor.observe(view(), 'round-1', false)).toBeNull();
      state.events.push(discard());
      expect(cursor.observe(view(), 'round-1', true)).toBeNull();
    }
    expect(cursor.observe(view(), 'round-2', true)).toBeNull();
    expect(cursor.observe(projectStateForSeat(state, 1), 'round-2', true)).toBeNull();
    state.events = [discard('p1')];
    expect(cursor.observe(projectStateForSeat(state, 1), 'round-2', true)).toBeNull();
    state.events.push(discard('p2'));
    expect(cursor.observe(projectStateForSeat(state, 1), 'round-2', true)).toBe('p2');
  });
});

function audioHarness(
  load: (url: string) => Promise<ArrayBuffer> = vi.fn(async () => new ArrayBuffer(1)),
) {
  const gains: { gain: { value: number }; connect: ReturnType<typeof vi.fn> }[] = [];
  const sources: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const context = {
    state: 'suspended',
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    close: vi.fn(async () => {
      context.state = 'closed';
    }),
    createGain: () => {
      const gain = { gain: { value: 0 }, connect: vi.fn() };
      gains.push(gain);
      return gain;
    },
    decodeAudioData: vi.fn(async () => ({})),
    createBufferSource: () => {
      const source = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    },
  };
  const player = new TableAudioPlayer(() => context as unknown as AudioContext, load);
  return { player, context, sources, load, gains };
}

describe('语音播放器生命周期', () => {
  it('语音和音效独立调音、关闭与播放，音效资源可解码为 WAV', async () => {
    const { player, sources, gains, load } = audioHarness();
    player.setVolumes({ voice: 0.55, effects: 0.2 });
    await player.enable();
    await player.play('m7');
    expect(sources).toHaveLength(2);
    expect(gains.map((gain) => gain.gain.value)).toEqual([0.55, 0.2]);
    expect(load).toHaveBeenCalledWith(voiceClipUrl('m7'));
    expect(load).toHaveBeenCalledWith(effectClipUrl('m7'));
    player.setVolumes({ voice: 0, effects: 0.1 });
    expect(sources[0]!.stop).toHaveBeenCalledOnce();
    expect(sources[1]!.stop).not.toHaveBeenCalled();
    expect(gains[1]!.gain.value).toBe(0.1);
    player.setVolumes({ voice: 0, effects: 0 });
    expect(sources[1]!.stop).toHaveBeenCalledOnce();
    for (const clip of ['m7', 'pong', 'win', 'self-draw'] as const) {
      const file = readFileSync(
        new URL(`./public${effectClipUrl(clip).split('?')[0]}`, import.meta.url),
      );
      expect(file.subarray(0, 4).toString()).toBe('RIFF');
      expect(file.subarray(8, 12).toString()).toBe('WAVE');
    }
  });

  it('单独关闭再开启语音不会播出关闭前仍在加载的旧报牌', async () => {
    const pending = new Map<string, (data: ArrayBuffer) => void>();
    const { player, sources } = audioHarness(
      vi.fn(
        (url: string) =>
          new Promise<ArrayBuffer>((resolve) => {
            pending.set(url, resolve);
          }),
      ),
    );
    player.setVolumes({ voice: 0.5, effects: 0.3 });
    await player.enable();
    const playing = player.play('m7');
    player.setVolumes({ voice: 0, effects: 0.3 });
    player.setVolumes({ voice: 0.5, effects: 0.3 });
    for (const resolve of pending.values()) resolve(new ArrayBuffer(1));
    await playing;
    expect(sources).toHaveLength(1);
    await player.play('m7');
    expect(sources).toHaveLength(3);
  });

  it('用户开启后才播放，新声音停止旧声音，同一资源只加载一次', async () => {
    const { player, context, sources, load } = audioHarness();
    await player.play('m7');
    expect(load).not.toHaveBeenCalled();
    await player.enable();
    await player.play('m7');
    await player.play('m7');
    expect(context.resume).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledOnce();
    expect(sources).toHaveLength(2);
    expect(sources[0]!.stop).toHaveBeenCalledOnce();
    expect(sources[1]!.start).toHaveBeenCalledOnce();
    player.dispose();
    expect(sources[1]!.stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('切换播报音色会取消旧语音并使用新音色资源', async () => {
    const { player, sources, load } = audioHarness();
    await player.enable();
    await player.play('m7');
    player.setVoicePack('female');
    await player.play('m7');
    expect(load).toHaveBeenCalledWith(voiceClipUrl('m7', 'male'));
    expect(load).toHaveBeenCalledWith(voiceClipUrl('m7', 'female'));
    expect(sources.some((source) => source.stop.mock.calls.length > 0)).toBe(true);
  });

  it('静音、离开或新动作能取消尚在加载的语音', async () => {
    let resolve!: (value: ArrayBuffer) => void;
    const { player, sources } = audioHarness(
      vi.fn(
        () =>
          new Promise<ArrayBuffer>((done) => {
            resolve = done;
          }),
      ),
    );
    await player.enable();
    const pending = player.play('m7');
    player.stop();
    resolve(new ArrayBuffer(1));
    await pending;
    expect(sources).toHaveLength(0);
    await player.play('m7');
    expect(sources).toHaveLength(1);
  });

  it('资源失败可重试，取消的旧请求不会在静音后报错', async () => {
    const load = vi.fn(async () => new ArrayBuffer(1)).mockRejectedValueOnce(new Error('offline'));
    const { player, sources } = audioHarness(load);
    await player.enable();
    await expect(player.play('win')).rejects.toThrow('offline');
    await player.play('win');
    expect(sources).toHaveLength(1);
    const oldRequest = player.play('p1');
    player.dispose();
    await expect(oldRequest).resolves.toBeUndefined();
    expect(sources).toHaveLength(1);
  });
});
