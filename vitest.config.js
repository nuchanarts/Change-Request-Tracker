import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js', 'tests/contract/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/shared/**/*.js', 'src/server/Repo.js'],
      thresholds: { 'src/shared/**/*.js': { lines: 90, functions: 90, branches: 85, statements: 90 } },
    },
  },
});
