import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'web/**/*.test.ts', 'web/**/*.test.tsx', 'server/**/*.test.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts', 'web/**/*.ts', 'web/**/*.tsx', 'server/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', 'src/index.ts', 'web/main.tsx', 'server/index.ts'],
      thresholds: {
        lines: 75,
        functions: 70,
        branches: 65,
        statements: 75,
      },
    },
  },
});
