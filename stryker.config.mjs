// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'yarn',
  // Yarn PnP cannot auto-discover @stryker-mutator/* from node_modules.
  plugins: [
    '@stryker-mutator/vitest-runner',
    '@stryker-mutator/typescript-checker',
  ],
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.mutation.config.ts',
  },
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.json',
  typescriptChecker: {
    prioritizePerformanceOverAccuracy: true,
  },
  // Focus on behavioral modules. Declarative Zod schemas in schema.ts and
  // re-export-only index.ts produce low-value / equivalent mutants.
  mutate: [
    'src/edn.ts',
    'src/grounded.ts',
    'src/reduce-dung.ts',
    'src/validate.ts',
  ],
  thresholds: {
    high: 80,
    low: 60,
    break: 80,
  },
  ignorePatterns: [
    'dist',
    'reports',
    '.stryker-tmp',
    'examples',
    'docs',
    'perf-baseline.json',
  ],
};
