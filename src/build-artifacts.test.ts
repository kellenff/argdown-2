import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexJs = 'dist/index.js';
const indexDts = 'dist/index.d.ts';
const cliJs = 'dist/mcp/cli.js';
const built = existsSync(indexJs);

const externalImport = (pkg: string) =>
  new RegExp(
    String.raw`^(?!\s*\*).*\b(?:import|export)\s+[^;]*?\bfrom\s+['"]${pkg}`,
    'm',
  );

function libraryBundleSources(): string[] {
  const indexSource = readFileSync(indexJs, 'utf8');
  const sources = [indexSource];
  for (const match of indexSource.matchAll(/\bfrom\s+['"](\.\/[^'"]+)['"]/g)) {
    sources.push(readFileSync(`dist/${match[1]!.replace(/^\.\//, '')}`, 'utf8'));
  }
  return sources;
}

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

  it('inlines app dependencies in the library bundle', () => {
    for (const source of libraryBundleSources()) {
      expect(source).not.toMatch(externalImport('zod'));
      expect(source).not.toMatch(externalImport('edn-parser-js'));
    }
  });

  it('inlines app dependencies in the MCP CLI bundle', () => {
    const source = readFileSync(cliJs, 'utf8');
    expect(source).not.toMatch(externalImport('@modelcontextprotocol\\/sdk'));
    expect(source).not.toMatch(externalImport('zod'));
    expect(source).not.toMatch(externalImport('edn-parser-js'));
  });
});
