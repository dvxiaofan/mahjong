import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = join(dirname(dirname(fileURLToPath(import.meta.url))), 'web/public/audio/effects');
const sampleRate = 24000;
const clips = [
  [
    'tile',
    0.075,
    [
      [1450, 0, 0.035],
      [2100, 0.02, 0.045],
    ],
  ],
  [
    'action',
    0.18,
    [
      [660, 0, 0.12],
      [880, 0.06, 0.12],
    ],
  ],
  [
    'win',
    0.44,
    [
      [523.25, 0, 0.2],
      [659.25, 0.11, 0.2],
      [783.99, 0.22, 0.22],
    ],
  ],
];
mkdirSync(output, { recursive: true });
for (const [name, duration, tones] of clips) {
  const samples = Math.round(duration * sampleRate);
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    const time = index / sampleRate;
    let value = 0;
    for (const [frequency, offset, length] of tones) {
      const local = time - offset;
      if (local < 0 || local >= length) continue;
      const envelope =
        Math.min(local / 0.004, 1) *
        Math.exp((-6 * local) / length) *
        Math.min((length - local) / 0.01, 1);
      value += 0.32 * envelope * Math.sin(2 * Math.PI * frequency * local);
    }
    wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + index * 2);
  }
  writeFileSync(join(output, `${name}.wav`), wav);
}
process.stdout.write('Generated three original table sound effects.\n');
