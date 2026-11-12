import { NORMAL_TILE_TYPES, type NormalTile } from '../src/tiles.ts';
import type { GameAudienceView } from '../src/types.ts';
import type { VoicePack } from './soundSettings';

const AUDIO_VERSION = 2;

export type VoiceClip =
  | NormalTile
  | 'pong'
  | 'exposed-kong'
  | 'concealed-kong'
  | 'supplement-kong'
  | 'mouth'
  | 'fortune'
  | 'win'
  | 'self-draw'
  | 'drawn';

export function voicePackDirectory(pack: VoicePack): string {
  return pack === 'female' ? 'mandarin' : 'mandarin-male';
}

export function voiceClipUrl(clip: VoiceClip, pack: VoicePack = 'male'): string {
  return `/audio/${voicePackDirectory(pack)}/${clip}.mp3?v=${AUDIO_VERSION}`;
}

export function effectClipUrl(clip: VoiceClip): string {
  const name = NORMAL_TILE_TYPES.includes(clip as NormalTile)
    ? 'tile'
    : clip === 'win' || clip === 'self-draw'
      ? 'win'
      : 'action';
  return `/audio/effects/${name}.wav?v=${AUDIO_VERSION}`;
}

/** Only fixed public event fields can select speech; private event text is never read. */
export function getLatestVoiceClip(view: GameAudienceView, afterEvent: number): VoiceClip | null {
  for (let index = view.events.length - 1; index >= afterEvent; index--) {
    const event = view.events[index];
    if (event === undefined) continue;
    switch (event.type) {
      case 'discard':
        if (event.tile !== null && NORMAL_TILE_TYPES.includes(event.tile)) return event.tile;
        break;
      case 'pong':
      case 'exposed-kong':
      case 'concealed-kong':
      case 'supplement-kong':
      case 'fortune':
        return event.type;
      case 'mouth-declared':
        return 'mouth';
      case 'win':
        return view.result?.winType === 'self-draw' ? 'self-draw' : 'win';
      case 'round-draw':
        return 'drawn';
    }
  }
  return null;
}

interface SoundObservation {
  context: string;
  active: boolean;
  eventCount: number;
}

/** A snapshot establishes a baseline; only later live events are audible. */
export class TableSoundCursor {
  private previous: SoundObservation | null = null;

  observe(view: GameAudienceView, roundKey: string, active: boolean): VoiceClip | null {
    const current = {
      context: `${roundKey}:${view.viewerSeat}`,
      active,
      eventCount: view.events.length,
    };
    const before = this.previous;
    this.previous = current;
    if (
      before === null ||
      before.context !== current.context ||
      !before.active ||
      !active ||
      current.eventCount <= before.eventCount
    ) {
      return null;
    }
    return getLatestVoiceClip(view, before.eventCount);
  }
}

async function loadAudio(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('声音资源暂时无法加载');
  return response.arrayBuffer();
}

/** One current announcement, including while fetching/decoding; no delayed speech queue. */
export class TableAudioPlayer {
  private context: AudioContext | null = null;
  private gains: Record<'voice' | 'effects', GainNode> | null = null;
  private sources = new Map<AudioBufferSourceNode, 'voice' | 'effects'>();
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private generation = 0;
  private volumes = { voice: 0.8, effects: 0 };
  private channelVersions = { voice: 0, effects: 0 };
  private voicePack: VoicePack = 'male';

  constructor(
    private createContext: () => AudioContext = () => new AudioContext(),
    private load: (url: string) => Promise<ArrayBuffer> = loadAudio,
  ) {}

  async enable(): Promise<void> {
    if (this.context === null) {
      this.context = this.createContext();
      this.gains = { voice: this.context.createGain(), effects: this.context.createGain() };
      for (const channel of ['voice', 'effects'] as const) {
        this.gains[channel].gain.value = this.volumes[channel];
        this.gains[channel].connect(this.context.destination);
      }
    }
    const context = this.context;
    await context.resume();
    if (context.state !== 'running') throw new Error('请点击开启声音后重试');
  }

  get running(): boolean {
    return this.context?.state === 'running';
  }

  setVolumes(volumes: { voice: number; effects: number }): void {
    for (const channel of ['voice', 'effects'] as const) {
      this.volumes[channel] = Number.isFinite(volumes[channel])
        ? Math.max(0, Math.min(1, volumes[channel]))
        : 0;
      if (this.gains !== null) this.gains[channel].gain.value = this.volumes[channel];
      if (this.volumes[channel] === 0) {
        this.channelVersions[channel]++;
        for (const [source, sourceChannel] of this.sources) {
          if (sourceChannel === channel) this.stopSource(source);
        }
      }
    }
    if (this.volumes.voice === 0 && this.volumes.effects === 0) this.stop();
  }

  setVoicePack(pack: VoicePack): void {
    if (pack === this.voicePack) return;
    this.voicePack = pack;
    this.channelVersions.voice++;
    for (const [source, channel] of this.sources) {
      if (channel === 'voice') this.stopSource(source);
    }
  }

  private buffer(url: string, context: AudioContext): Promise<AudioBuffer> {
    let pending = this.buffers.get(url);
    if (pending === undefined) {
      pending = this.load(url)
        .then((data) => context.decodeAudioData(data))
        .catch((error: unknown) => {
          this.buffers.delete(url);
          throw error;
        });
      this.buffers.set(url, pending);
    }
    return pending;
  }

  async play(clip: VoiceClip): Promise<void> {
    this.stop();
    const generation = this.generation;
    const voicePack = this.voicePack;
    const context = this.context;
    if (context === null || context.state !== 'running') return;
    await Promise.all(
      (['voice', 'effects'] as const).map(async (channel) => {
        if (this.volumes[channel] === 0) return;
        const channelVersion = this.channelVersions[channel];
        let buffer: AudioBuffer;
        try {
          buffer = await this.buffer(
            channel === 'voice' ? voiceClipUrl(clip, voicePack) : effectClipUrl(clip),
            context,
          );
        } catch (error) {
          if (
            generation !== this.generation ||
            context !== this.context ||
            channelVersion !== this.channelVersions[channel] ||
            this.volumes[channel] === 0
          )
            return;
          throw error;
        }
        if (
          generation !== this.generation ||
          context !== this.context ||
          channelVersion !== this.channelVersions[channel] ||
          context.state !== 'running' ||
          this.volumes[channel] === 0
        )
          return;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.gains![channel]);
        source.onended = () => {
          source.disconnect();
          this.sources.delete(source);
        };
        this.sources.set(source, channel);
        source.start();
      }),
    );
  }

  private stopSource(source: AudioBufferSourceNode): void {
    source.stop();
    source.disconnect();
    this.sources.delete(source);
  }

  stop(): void {
    this.generation++;
    for (const source of this.sources.keys()) this.stopSource(source);
  }

  dispose(): void {
    this.stop();
    const context = this.context;
    this.context = null;
    this.gains = null;
    this.buffers.clear();
    if (context !== null) void context.close().catch(() => undefined);
  }
}
