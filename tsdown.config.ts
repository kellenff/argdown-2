import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'mcp/cli': 'src/mcp/cli.ts',
  },
  format: ['esm'],
  platform: 'node',
  dts: true,
  clean: true,
  minify: true,
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  deps: {
    alwaysBundle: [/.*/],
  },
});
