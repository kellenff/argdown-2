// @ts-check
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
