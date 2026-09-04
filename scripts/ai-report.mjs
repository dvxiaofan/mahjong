import { runAiSimulation } from '../dist/ai-simulation.js';

const argumentsMap = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, value = ''] = argument.replace(/^--/, '').split('=', 2);
    return [key, value];
  }),
);

const games = Number(argumentsMap.games || 10);
const seed = Number(argumentsMap.seed || 20260905);
const difficulty = argumentsMap.difficulty || 'standard';

if (!['casual', 'standard', 'advanced'].includes(difficulty)) {
  throw new Error('difficulty 必须是 casual、standard 或 advanced');
}

const summary = runAiSimulation({ games, seed, difficulty });
process.stdout.write(`${JSON.stringify({ difficulty, seed, ...summary }, null, 2)}\n`);
