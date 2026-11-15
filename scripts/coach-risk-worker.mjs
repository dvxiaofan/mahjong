import { parentPort, workerData } from 'node:worker_threads';
import { buildCoachDataset } from '../dist/coach-training.js';

const dataset = buildCoachDataset(workerData);

parentPort.postMessage(
  {
    taskId: workerData.taskId,
    kind: workerData.kind,
    difficulty: dataset.difficulty,
    games: dataset.games,
    completedGames: dataset.completedGames,
    candidates: dataset.candidates,
    totalPositives: dataset.totalPositives,
    samples: dataset.samples,
    positives: dataset.positives,
    rows: dataset.rows.buffer,
    labels: dataset.labels.buffer,
    tenpaiCounts: dataset.tenpaiCounts.buffer,
    tenpaiWins: dataset.tenpaiWins.buffer,
  },
  [
    dataset.rows.buffer,
    dataset.labels.buffer,
    dataset.tenpaiCounts.buffer,
    dataset.tenpaiWins.buffer,
  ],
);
