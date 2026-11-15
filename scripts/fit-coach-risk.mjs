import { availableParallelism } from 'node:os';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { format, resolveConfig } from 'prettier';
import {
  COACH_FEATURE_COUNT,
  COACH_FEATURE_NAMES,
  predictCoachFeatures,
  sigmoid,
} from '../dist/coach-risk.js';

const DIFFICULTIES = ['casual', 'standard', 'advanced'];
const TENPAI_FORTUNE_BUCKETS = 4;
const TENPAI_MELD_BUCKETS = 4;
const TENPAI_WALL_SEGMENTS = 12;
const TENPAI_SIZE = TENPAI_FORTUNE_BUCKETS * TENPAI_MELD_BUCKETS * TENPAI_WALL_SEGMENTS;
const STRATEGY_IDS = {
  casual: 'difficulty-casual-v1',
  standard: 'difficulty-standard-v1',
  advanced: 'difficulty-advanced-v1',
};

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, value = 'true'] = argument.replace(/^--/, '').split('=', 2);
    return [key, value];
  }),
);

const games = Number(args.games ?? 1440);
const holdoutGames = Number(args.holdout ?? 600);
const workers = Math.max(1, Number(args.workers ?? availableParallelism()));
const baseSeed = Number(args.seed ?? 20261115);
const sampleLimit = Number(args.sample ?? 500_000);
const holdoutSampleLimit = Number(args['holdout-sample'] ?? 250_000);
const epochs = Number(args.epochs ?? 15);
const selectedDifficulties =
  args.difficulty === undefined ? DIFFICULTIES : [String(args.difficulty)];
const output = String(
  args.output ?? fileURLToPath(new URL('../src/coach-risk-coefficients.ts', import.meta.url)),
);
const cacheDir = String(
  args['cache-dir'] ??
    `/tmp/coach-risk-cache-${baseSeed}-${games}-${holdoutGames}-${sampleLimit}-${holdoutSampleLimit}`,
);
const reuseCache = args['reuse-cache'] === 'true';

if (!selectedDifficulties.every((difficulty) => DIFFICULTIES.includes(difficulty))) {
  throw new Error('difficulty 必须是 casual、standard 或 advanced');
}
if (
  ![games, holdoutGames, workers, sampleLimit, holdoutSampleLimit, epochs].every(Number.isFinite)
) {
  throw new Error('拟合参数必须是数字');
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function partition(total, parts) {
  const actualParts = Math.min(parts, total);
  const base = Math.floor(total / actualParts);
  const extra = total % actualParts;
  return Array.from({ length: actualParts }, (_, index) => base + (index < extra ? 1 : 0));
}

function cachePrefix(difficulty, kind) {
  return `${cacheDir}/${difficulty}-${kind}`;
}

async function saveDataset(dataset) {
  await mkdir(cacheDir, { recursive: true });
  const prefix = cachePrefix(dataset.difficulty, dataset.kind);
  await Promise.all([
    writeFile(`${prefix}.rows`, Buffer.from(dataset.rows.buffer)),
    writeFile(`${prefix}.labels`, Buffer.from(dataset.labels.buffer)),
    writeFile(`${prefix}.tenpai-counts`, Buffer.from(dataset.tenpaiCounts.buffer)),
    writeFile(`${prefix}.tenpai-wins`, Buffer.from(dataset.tenpaiWins.buffer)),
  ]);
  await writeFile(
    `${prefix}.json`,
    JSON.stringify({
      difficulty: dataset.difficulty,
      kind: dataset.kind,
      games: dataset.games,
      completedGames: dataset.completedGames,
      candidates: dataset.candidates,
      totalPositives: dataset.totalPositives,
      samples: dataset.samples,
      positives: dataset.positives,
    }),
  );
}

async function loadDataset(difficulty, kind) {
  const prefix = cachePrefix(difficulty, kind);
  if (!existsSync(`${prefix}.json`)) return null;
  const [metadataValue, rowsValue, labelsValue, countsValue, winsValue] = await Promise.all([
    readFile(`${prefix}.json`, 'utf8'),
    readFile(`${prefix}.rows`),
    readFile(`${prefix}.labels`),
    readFile(`${prefix}.tenpai-counts`),
    readFile(`${prefix}.tenpai-wins`),
  ]);
  return {
    ...JSON.parse(metadataValue),
    rows: new Float32Array(
      rowsValue.buffer,
      rowsValue.byteOffset,
      rowsValue.byteLength / Float32Array.BYTES_PER_ELEMENT,
    ),
    labels: new Uint8Array(labelsValue.buffer, labelsValue.byteOffset, labelsValue.byteLength),
    tenpaiCounts: new Uint32Array(
      countsValue.buffer,
      countsValue.byteOffset,
      countsValue.byteLength / Uint32Array.BYTES_PER_ELEMENT,
    ),
    tenpaiWins: new Uint32Array(
      winsValue.buffer,
      winsValue.byteOffset,
      winsValue.byteLength / Uint32Array.BYTES_PER_ELEMENT,
    ),
  };
}

function runWorker(task) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./coach-risk-worker.mjs', import.meta.url), {
      workerData: task,
    });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`教练拟合 worker 退出码 ${code}`));
    });
  });
}

async function runPool(tasks) {
  const results = [];
  let next = 0;
  let completed = 0;
  async function workerLoop() {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      const result = await runWorker(task);
      results.push(result);
      completed += 1;
      process.stdout.write(
        `[coach:fit] ${completed}/${tasks.length} ${task.difficulty} ${task.kind} ` +
          `${task.games} 局，采样 ${result.samples}\n`,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, tasks.length) }, workerLoop));
  return results;
}

function combineDatasets(difficulty, kind, parts) {
  const samples = parts.reduce((total, part) => total + part.samples, 0);
  const rows = new Float32Array(samples * COACH_FEATURE_COUNT);
  const labels = new Uint8Array(samples);
  const tenpaiCounts = new Uint32Array(TENPAI_SIZE);
  const tenpaiWins = new Uint32Array(TENPAI_SIZE);
  let offset = 0;
  let positives = 0;
  let candidates = 0;
  let totalPositives = 0;
  let completedGames = 0;

  for (const part of parts) {
    const partRows = new Float32Array(part.rows);
    const partLabels = new Uint8Array(part.labels);
    rows.set(partRows, offset * COACH_FEATURE_COUNT);
    labels.set(partLabels, offset);
    offset += part.samples;
    positives += part.positives;
    candidates += part.candidates;
    totalPositives += part.totalPositives;
    completedGames += part.completedGames;
    const counts = new Uint32Array(part.tenpaiCounts);
    const wins = new Uint32Array(part.tenpaiWins);
    for (let index = 0; index < TENPAI_SIZE; index += 1) {
      tenpaiCounts[index] += counts[index];
      tenpaiWins[index] += wins[index];
    }
  }

  return {
    difficulty,
    kind,
    games: parts.reduce((total, part) => total + part.games, 0),
    completedGames,
    candidates,
    totalPositives,
    samples,
    positives,
    rows,
    labels,
    tenpaiCounts,
    tenpaiWins,
  };
}

function rawScore(dataset, row, weights) {
  let score = 0;
  for (let feature = 0; feature < COACH_FEATURE_COUNT; feature += 1) {
    score += dataset.rows[row + feature] * weights[feature];
  }
  return score;
}

function splitCalibrationIndices(samples, seed) {
  const indices = new Uint32Array(samples);
  for (let index = 0; index < samples; index += 1) indices[index] = index;
  const random = seededRandom(seed ^ 0x7f4a_7c15);
  for (let index = samples - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const temporary = indices[index];
    indices[index] = indices[swap];
    indices[swap] = temporary;
  }
  const calibrationCount = Math.max(2, Math.floor(samples * 0.2));
  return {
    calibration: indices.slice(0, calibrationCount),
    fit: indices.slice(calibrationCount),
  };
}

function fitIsotonic(dataset, indices, weights) {
  const entries = Array.from(indices, (index) => ({
    score: rawScore(dataset, index * COACH_FEATURE_COUNT, weights),
    label: dataset.labels[index],
  })).sort((left, right) => left.score - right.score);
  const globalPrior = (dataset.positives + 2) / (dataset.samples + 40);
  const blockCount = Math.max(8, Math.min(32, Math.floor(entries.length / 1000)));
  const blocks = [];
  for (let block = 0; block < blockCount; block += 1) {
    const start = Math.floor((block / blockCount) * entries.length);
    const end = Math.floor(((block + 1) / blockCount) * entries.length);
    if (end <= start) continue;
    let score = 0;
    let positives = 0;
    for (let position = start; position < end; position += 1) {
      score += entries[position].score;
      positives += entries[position].label;
    }
    const count = end - start;
    blocks.push({
      score: score / count,
      probability: (positives + globalPrior * 2) / (count + 2),
      weight: count,
    });
  }

  const merged = [];
  for (const block of blocks) {
    merged.push({ ...block });
    while (merged.length >= 2) {
      const right = merged[merged.length - 1];
      const left = merged[merged.length - 2];
      if (left.probability <= right.probability) break;
      const weight = left.weight + right.weight;
      merged.splice(merged.length - 2, 2, {
        score: (left.score * left.weight + right.score * right.weight) / weight,
        probability: (left.probability * left.weight + right.probability * right.weight) / weight,
        weight,
      });
    }
  }
  return {
    method: 'isotonic',
    slope: 1,
    intercept: 0,
    knots: merged.map((block) => ({
      score: Number(block.score.toFixed(7)),
      probability: Number(block.probability.toFixed(9)),
    })),
  };
}

function trainLogistic(dataset, seed, subset) {
  const samples = dataset.samples;
  const dimension = COACH_FEATURE_COUNT;
  const weights = new Float64Array(dimension);
  const firstMoment = new Float64Array(dimension);
  const secondMoment = new Float64Array(dimension);
  const indices = new Uint32Array(subset);
  const trainingSamples = indices.length;
  const random = seededRandom(seed ^ 0x51ed_270b);
  const batchSize = Math.min(2048, Math.max(64, Math.floor(trainingSamples / 300)));
  const learningRate = 0.012;
  const l2 = 2e-5;
  let step = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (let index = trainingSamples - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      const temporary = indices[index];
      indices[index] = indices[swap];
      indices[swap] = temporary;
    }

    for (let start = 0; start < trainingSamples; start += batchSize) {
      const end = Math.min(trainingSamples, start + batchSize);
      const count = end - start;
      const gradient = new Float64Array(dimension);
      for (let position = start; position < end; position += 1) {
        const row = indices[position] * dimension;
        let score = 0;
        for (let feature = 0; feature < dimension; feature += 1) {
          score += dataset.rows[row + feature] * weights[feature];
        }
        const error = sigmoid(score) - dataset.labels[indices[position]];
        for (let feature = 0; feature < dimension; feature += 1) {
          gradient[feature] += error * dataset.rows[row + feature];
        }
      }

      step += 1;
      const beta1Correction = 1 - Math.pow(0.9, step);
      const beta2Correction = 1 - Math.pow(0.999, step);
      for (let feature = 0; feature < dimension; feature += 1) {
        const gradientValue =
          gradient[feature] / count + (feature === 0 ? 0 : l2 * weights[feature]);
        firstMoment[feature] = 0.9 * firstMoment[feature] + 0.1 * gradientValue;
        secondMoment[feature] = 0.999 * secondMoment[feature] + 0.001 * gradientValue ** 2;
        weights[feature] -=
          (learningRate * (firstMoment[feature] / beta1Correction)) /
          (Math.sqrt(secondMoment[feature] / beta2Correction) + 1e-8);
      }
    }
  }

  return [...weights].map((weight) => Number(weight.toFixed(7)));
}

function evaluate(dataset, model, indices = undefined) {
  const evaluated = indices ?? Array.from({ length: dataset.samples }, (_, index) => index);
  const predictions = new Float64Array(evaluated.length);
  let logLoss = 0;
  for (let position = 0; position < evaluated.length; position += 1) {
    const index = evaluated[position];
    const row = dataset.rows.subarray(
      index * COACH_FEATURE_COUNT,
      (index + 1) * COACH_FEATURE_COUNT,
    );
    const prediction = clamp(predictCoachFeatures(row, model), 1e-9, 1 - 1e-9);
    predictions[position] = prediction;
    const label = dataset.labels[index];
    logLoss -= label * Math.log(prediction) + (1 - label) * Math.log(1 - prediction);
  }
  logLoss /= evaluated.length;

  const boundaries = [0, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 1];
  const aggregates = boundaries.slice(0, -1).map((lower, bin) => ({
    lower,
    upper: boundaries[bin + 1],
    count: 0,
    positives: 0,
    predicted: 0,
  }));
  for (let position = 0; position < evaluated.length; position += 1) {
    const prediction = predictions[position];
    const bin =
      boundaries.findIndex(
        (boundary, index) =>
          prediction >= boundary &&
          (prediction < boundaries[index + 1] || index === boundaries.length - 2),
      ) ?? -1;
    if (bin < 0) continue;
    const aggregate = aggregates[bin];
    aggregate.count += 1;
    aggregate.positives += dataset.labels[evaluated[position]];
    aggregate.predicted += prediction;
  }
  const bins = aggregates
    .filter((aggregate) => aggregate.count > 0)
    .map((aggregate) => ({
      lower: aggregate.lower,
      upper: aggregate.upper,
      count: aggregate.count,
      predicted: aggregate.predicted / aggregate.count,
      actual: aggregate.positives / aggregate.count,
    }));

  const totalPredicted = predictions.reduce((total, value) => total + value, 0);
  const actual =
    evaluated.reduce((total, index) => total + dataset.labels[index], 0) / evaluated.length;
  const predicted = totalPredicted / evaluated.length;
  const calibrationPass =
    Math.abs(actual - predicted) <= Math.max(0.1 * actual, 0.00005) &&
    bins
      .filter((bin) => bin.count >= 1000)
      .every((bin) => bin.actual >= bin.predicted * 0.75 && bin.actual <= bin.predicted * 1.33);
  return {
    logLoss,
    actual,
    predicted,
    calibrationPass,
    bins,
  };
}

function buildTenpaiTable(counts, wins) {
  let globalCount = 0;
  let globalWins = 0;
  for (let index = 0; index < counts.length; index += 1) {
    globalCount += counts[index];
    globalWins += wins[index];
  }
  const globalPrior = (globalWins + 2) / (globalCount + 40);
  const probabilities = Array.from({ length: TENPAI_FORTUNE_BUCKETS }, (_, fortune) =>
    Array.from({ length: TENPAI_MELD_BUCKETS }, (_, meld) => {
      let rowCount = 0;
      let rowWins = 0;
      for (let segment = 0; segment < TENPAI_WALL_SEGMENTS; segment += 1) {
        const index =
          fortune * TENPAI_MELD_BUCKETS * TENPAI_WALL_SEGMENTS +
          meld * TENPAI_WALL_SEGMENTS +
          segment;
        rowCount += counts[index];
        rowWins += wins[index];
      }
      const prior = rowCount >= 50 ? (rowWins + 2) / (rowCount + 40) : globalPrior;
      return Array.from({ length: TENPAI_WALL_SEGMENTS }, (_, segment) => {
        const index =
          fortune * TENPAI_MELD_BUCKETS * TENPAI_WALL_SEGMENTS +
          meld * TENPAI_WALL_SEGMENTS +
          segment;
        return Number(((wins[index] + prior * 30) / (counts[index] + 30) || prior).toFixed(6));
      });
    }),
  );
  return probabilities;
}

function generatedSource(models, tables) {
  return `import type { AiDifficulty } from './ai-difficulty.js';

export interface CoachRiskCalibrationBin {
  lower: number;
  upper: number;
  count: number;
  predicted: number;
  actual: number;
}

export interface CoachRiskModel {
  version: 1;
  difficulty: AiDifficulty;
  strategyId: string;
  featureNames: readonly string[];
  weights: readonly number[];
  calibration: {
    method: 'platt' | 'isotonic';
    slope: number;
    intercept: number;
    knots: readonly { score: number; probability: number }[];
  };
  training: {
    games: number;
    samples: number;
    positives: number;
    seed: number;
  };
  holdout: {
    games: number;
    samples: number;
    positives: number;
    logLoss: number;
    bins: readonly CoachRiskCalibrationBin[];
  };
}

export interface CoachTenpaiTable {
  version: 1;
  strategyId: string;
  /** [fortune 0..3][meld 0..3][wall segment 0..11] */
  probabilities: readonly (readonly (readonly number[])[])[];
  samples: readonly (readonly (readonly number[])[])[];
}

// Generated by npm run coach:fit. Do not edit by hand.
${COACH_FEATURE_NAMES.length === COACH_FEATURE_COUNT ? '' : '/* feature count mismatch */'}
export const COACH_RISK_MODELS: Readonly<Record<AiDifficulty, CoachRiskModel>> = ${JSON.stringify(
    models,
    null,
    2,
  )};

export const COACH_TENPAI_TABLES: Readonly<Record<AiDifficulty, CoachTenpaiTable>> = ${JSON.stringify(
    tables,
    null,
    2,
  )};
`;
}

const tasks = [];
let taskId = 0;
for (const difficulty of selectedDifficulties) {
  const difficultyIndex = DIFFICULTIES.indexOf(difficulty);
  const trainParts = partition(games, workers);
  let trainSeed = baseSeed + difficultyIndex * 100_000;
  for (const partGames of trainParts) {
    if (reuseCache && existsSync(`${cachePrefix(difficulty, 'train')}.json`)) continue;
    tasks.push({
      taskId: taskId++,
      kind: 'train',
      difficulty,
      games: partGames,
      seed: trainSeed,
      sampleLimit: Math.ceil(sampleLimit / trainParts.length),
    });
    trainSeed += partGames;
  }
  const holdoutParts = partition(holdoutGames, workers);
  let holdoutSeed = baseSeed + 1_000_000 + difficultyIndex * 100_000;
  for (const partGames of holdoutParts) {
    if (reuseCache && existsSync(`${cachePrefix(difficulty, 'holdout')}.json`)) continue;
    tasks.push({
      taskId: taskId++,
      kind: 'holdout',
      difficulty,
      games: partGames,
      seed: holdoutSeed,
      sampleLimit: Math.ceil(holdoutSampleLimit / holdoutParts.length),
    });
    holdoutSeed += partGames;
  }
}

const results = await runPool(tasks);
const models = {};
const tables = {};

for (const difficulty of selectedDifficulties) {
  const difficultyIndex = DIFFICULTIES.indexOf(difficulty);
  const trainResults = results.filter(
    (result) => result.difficulty === difficulty && result.kind === 'train',
  );
  const holdoutResults = results.filter(
    (result) => result.difficulty === difficulty && result.kind === 'holdout',
  );
  const train =
    trainResults.length > 0
      ? combineDatasets(difficulty, 'train', trainResults)
      : await loadDataset(difficulty, 'train');
  const holdout =
    holdoutResults.length > 0
      ? combineDatasets(difficulty, 'holdout', holdoutResults)
      : await loadDataset(difficulty, 'holdout');
  if (train === null || holdout === null) {
    throw new Error(`缺少 ${difficulty} 的拟合数据缓存`);
  }
  if (trainResults.length > 0) await saveDataset(train);
  if (holdoutResults.length > 0) await saveDataset(holdout);

  process.stdout.write(
    `[coach:fit] 训练 ${difficulty}：${train.samples} 样本，` +
      `${train.positives} 正例（${((train.positives / train.samples) * 100).toFixed(2)}%）\n`,
  );
  const split = splitCalibrationIndices(train.samples, baseSeed + difficultyIndex);
  const weights = trainLogistic(train, baseSeed + difficultyIndex, split.fit);
  const calibration = fitIsotonic(train, split.calibration, weights);
  const model = {
    version: 1,
    difficulty,
    strategyId: STRATEGY_IDS[difficulty],
    featureNames: COACH_FEATURE_NAMES,
    weights,
    calibration,
    training: {
      games: train.completedGames,
      samples: train.samples,
      positives: train.positives,
      seed: baseSeed + difficultyIndex * 100_000,
    },
    holdout: {
      games: holdout.completedGames,
      samples: holdout.samples,
      positives: holdout.positives,
      logLoss: 0,
      bins: [],
    },
  };
  const evaluation = evaluate(holdout, model);
  model.holdout = {
    games: holdout.completedGames,
    samples: holdout.samples,
    positives: holdout.positives,
    logLoss: Number(evaluation.logLoss.toFixed(7)),
    bins: evaluation.bins.map((bin) => ({
      lower: Number(bin.lower.toFixed(7)),
      upper: Number(bin.upper.toFixed(7)),
      count: bin.count,
      predicted: Number(bin.predicted.toFixed(7)),
      actual: Number(bin.actual.toFixed(7)),
    })),
  };
  models[difficulty] = model;
  tables[difficulty] = {
    version: 1,
    strategyId: STRATEGY_IDS[difficulty],
    probabilities: buildTenpaiTable(train.tenpaiCounts, train.tenpaiWins),
    samples: Array.from({ length: TENPAI_FORTUNE_BUCKETS }, (_, fortune) =>
      Array.from({ length: TENPAI_MELD_BUCKETS }, (_, meld) =>
        Array.from({ length: TENPAI_WALL_SEGMENTS }, (_, segment) => {
          const index =
            fortune * TENPAI_MELD_BUCKETS * TENPAI_WALL_SEGMENTS +
            meld * TENPAI_WALL_SEGMENTS +
            segment;
          return train.tenpaiCounts[index];
        }),
      ),
    ),
  };
  process.stdout.write(
    `[coach:fit] 留出 ${difficulty}：logLoss ${evaluation.logLoss.toFixed(5)}，` +
      `预测 ${(evaluation.predicted * 100).toFixed(2)}%，实际 ` +
      `${(evaluation.actual * 100).toFixed(2)}%，校准` +
      `${evaluation.calibrationPass ? '通过' : '未通过'}\n`,
  );
  for (const bin of evaluation.bins) {
    process.stdout.write(
      `  预测 ${(bin.predicted * 100).toFixed(2)}% / 实际 ` +
        `${(bin.actual * 100).toFixed(2)}% · ${bin.count} 样本\n`,
    );
  }
  if (!evaluation.calibrationPass) {
    process.exitCode = 1;
  }
}

if (selectedDifficulties.length !== DIFFICULTIES.length) {
  const existing = await import('../dist/coach-risk-coefficients.js');
  for (const difficulty of DIFFICULTIES) {
    models[difficulty] ??= existing.COACH_RISK_MODELS[difficulty];
    tables[difficulty] ??= existing.COACH_TENPAI_TABLES[difficulty];
  }
}

const prettierConfig = (await resolveConfig(output)) ?? {};
const source = await format(generatedSource(models, tables), {
  ...prettierConfig,
  parser: 'typescript',
  filepath: output,
});
await writeFile(output, source);
process.stdout.write(`[coach:fit] 写入 ${output}\n`);
