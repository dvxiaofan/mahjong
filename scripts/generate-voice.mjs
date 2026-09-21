import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Development-only generation; the game ships these files and needs no speech service.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'web/public/audio/mandarin');
const temporary = mkdtempSync(join(tmpdir(), 'mahjong-voice-'));
const numbers = '一二三四五六七八九';
const clips = {};
for (const [suit, label] of [
  ['m', '万'],
  ['p', '筒'],
  ['s', '条'],
]) {
  for (let rank = 1; rank <= 9; rank++) clips[`${suit}${rank}`] = `${numbers[rank - 1]}${label}`;
}
Object.assign(clips, {
  red: '红中',
  white: '白板',
  pong: '碰',
  'exposed-kong': '明杠',
  'concealed-kong': '暗杠',
  'supplement-kong': '补杠',
  mouth: '报嘴',
  fortune: '发财',
  win: '胡牌',
  'self-draw': '自摸',
  drawn: '荒庄',
});

try {
  mkdirSync(output, { recursive: true });
  for (const [name, spoken] of Object.entries(clips)) {
    const aiff = join(temporary, `${name}.aiff`);
    execFileSync('say', ['-v', 'Tingting', '-r', '195', '-o', aiff, spoken]);
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      aiff,
      '-af',
      'silenceremove=start_periods=1:start_duration=0.015:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_duration=0.035:start_threshold=-45dB,areverse,apad=pad_dur=0.07',
      '-ar',
      '24000',
      '-ac',
      '1',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '64k',
      join(output, `${name}.mp3`),
    ]);
  }
  writeFileSync(
    join(output, 'manifest.json'),
    `${JSON.stringify({ voice: 'macOS Tingting (zh_CN)', rate: 195, format: 'MP3 mono 24 kHz 64 kbps', clips }, null, 2)}\n`,
  );
  process.stdout.write(`Generated ${Object.keys(clips).length} Mandarin clips.\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
