import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexJs = 'dist/index.js';
const indexDts = 'dist/index.d.ts';
const cliJs = 'dist/mcp/cli.js';
const built = existsSync(indexJs);

const externalImport = (pkg: string) =>
  new RegExp(String.raw`^(?!\s*\*).*\b(?:import|export)\s+[^;]*?\bfrom\s+['"]${pkg}`, 'm');

describe.skipIf(!built)('build artifacts', () => {
  it('emits library JS, library dts, and MCP CLI', () => {
    expect(existsSync(indexJs)).toBe(true);
    expect(existsSync(indexDts)).toBe(true);
    expect(existsSync(cliJs)).toBe(true);
  });

  it('preserves the MCP CLI shebang', () => {
    const head = readFileSync(cliJs, 'utf8').slice(0, 32);
    expect(head.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('builds self-contained entry bundles without shared chunks', () => {
    const sharedChunks = readdirSync('dist').filter((name) => /^src-.*\.js$/.test(name));
    expect(sharedChunks).toEqual([]);
    expect(readFileSync(indexJs, 'utf8')).not.toMatch(/\bfrom\s+['"]\.\/src-/);
    expect(readFileSync(cliJs, 'utf8')).not.toMatch(/\bfrom\s+['"]\.\/src-/);
  });

  it('inlines app dependencies in the library bundle', () => {
    const source = readFileSync(indexJs, 'utf8');
    expect(source).not.toMatch(externalImport('zod'));
    expect(source).not.toMatch(externalImport('edn-parser-js'));
  });

  it('inlines app dependencies in the MCP CLI bundle', () => {
    const source = readFileSync(cliJs, 'utf8');
    expect(source).not.toMatch(externalImport('@modelcontextprotocol\\/sdk'));
    expect(source).not.toMatch(externalImport('zod'));
    expect(source).not.toMatch(externalImport('edn-parser-js'));
  });
});
