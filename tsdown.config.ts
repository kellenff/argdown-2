import { defineConfig } from 'tsdown';

// Two configs (not one dual-entry object): Rolldown rejects
// `codeSplitting: false` when a single config has multiple inputs.
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
