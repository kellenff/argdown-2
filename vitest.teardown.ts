// vitest.teardown.ts — force process.exit after all tests complete.
// Vitest 1.6.1's worker pool (threads or forks) leaves orphaned Node
// processes and an esbuild service worker alive after all tests pass,
// keeping the CI runner alive for the full 30-minute workflow timeout.
// Process-exiting here is the cleanest fix: tests are done, results are
// written, and there is no point waiting for graceful worker shutdown.
export default async function teardown(): Promise<void> {
  setImmediate(() => process.exit(0));
}
