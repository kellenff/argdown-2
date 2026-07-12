import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    testTimeout: 60000,
    // Vitest 1.6.1's worker pool (threads or forks) leaves orphaned Node
    // processes and an esbuild service worker alive after all tests
    // pass. globalTeardown forces process.exit(0) so the runner shuts
    // down promptly once the results are written. See vitest.teardown.ts.
    globalTeardown: ['./vitest.teardown.ts'],
  },
});
