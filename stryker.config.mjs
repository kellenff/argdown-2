// @ts-check
// Baseline: 62.92% mutation score (677 mutants across 2 files:
// parser-relation.ts 89.68%, visitor.ts 74.41% / 77.25% in original run).
// This is below the 80% break threshold and reflects pre-existing test
// gaps in visitor.ts and parser-relation.ts — Cycle 1 was a pure
// refactor that moved code without changing it. The gap is NOT
// introduced by Cycle 1.
//
// Plan: Cycle 2 (the new Argument feature) will add new tests for
// visitArgument, visitConclusion, visitPremise, and related code
// paths in parser-relation.ts, which should raise the score. Re-run
// `yarn mutate` after Cycle 2 lands and re-evaluate the threshold.
/** @type {import('@stryker-mutator/api').StrykerOptions} */
export default {
  packageManager: 'yarn',
  plugins: [
    '@stryker-mutator/vitest-runner',
    '@stryker-mutator/typescript-checker',
  ],
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  checker: {
    typescript: {
      enabled: true,
    },
  },
  mutate: [
    'src/parser-arg.ts',
    'src/parser-relation.ts',
    'src/visitor.ts',
    '!src/**/*.test.ts',
    '!src/**/*.bench.ts',
    '!src/**/*.fuzz.test.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 80,
  },
};
