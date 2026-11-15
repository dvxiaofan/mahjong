import { defineConfig } from '@playwright/test';

const useLocalChrome = process.env.PLAYWRIGHT_CHANNEL === 'chrome';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5199',
    ...(useLocalChrome ? { channel: 'chrome' as const } : {}),
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5199 --strictPort',
      env: {
        VITE_WS_URL: 'ws://127.0.0.1:8788/ws',
      },
      url: 'http://127.0.0.1:5199',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
    {
      command:
        'npm run build:server && rm -f /tmp/mahjong-e2e-rooms.json && PORT=8788 MAHJONG_STATE_FILE=/tmp/mahjong-e2e-rooms.json node dist-server/server/index.js',
      url: 'http://127.0.0.1:8788/healthz',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
  ],
});
