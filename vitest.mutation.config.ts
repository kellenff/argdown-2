import { defineConfig } from 'vitest/config';

/** Vitest config for Stryker — excludes slow bench suites from mutant runs. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.bench.test.ts'],
    testTimeout: 60000,
  },
});
