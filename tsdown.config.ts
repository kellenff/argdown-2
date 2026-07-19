import { defineConfig } from 'tsdown';

const shared = {
  format: ['esm'] as const,
  platform: 'node' as const,
  dts: true,
  clean: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  deps: {
    alwaysBundle: [/.*/],
  },
  outputOptions: {
    codeSplitting: false,
  },
};

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/index.ts' },
  },
  {
    ...shared,
    entry: { 'mcp/cli': 'src/mcp/cli.ts' },
  },
]);
