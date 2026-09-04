import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const forbiddenPrefixes = [
  'node_modules/',
  'dist/',
  'dist-web/',
  'dist-server/',
  'coverage/',
  'data/',
];
const forbiddenNames = new Set(['.env', '.env.local', '.DS_Store']);
const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.css',
  '.yml',
  '.yaml',
]);
const problems = [];

for (const file of tracked) {
  if (forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) {
    problems.push(`${file}: 构建产物或本地数据不应被提交`);
  }
  if (forbiddenNames.has(file) || /\.(pem|key)$/.test(file)) {
    problems.push(`${file}: 可能包含本地配置或密钥`);
  }
  const size = statSync(file).size;
  if (size > 1_000_000) problems.push(`${file}: 单文件超过 1 MB`);
  if (textExtensions.has(extname(file)) || file === '.gitignore') {
    const text = readFileSync(file, 'utf8');
    if (/^(<<<<<<<|=======|>>>>>>>)/m.test(text)) {
      problems.push(`${file}: 存在未解决的合并冲突标记`);
    }
  }
}

if (!tracked.includes('package-lock.json')) problems.push('缺少受版本控制的 package-lock.json');

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`Repository hygiene passed (${tracked.length} tracked files checked).\n`);
