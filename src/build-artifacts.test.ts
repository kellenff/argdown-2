import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexJs = 'dist/index.js';
const indexDts = 'dist/index.d.ts';
const cliJs = 'dist/mcp/cli.js';
const built = existsSync(indexJs);

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
    const source = readFileSync(indexJs, 'utf8');
    expect(source).not.toMatch(/\bfrom\s+['"]zod['"]/);
    expect(source).not.toMatch(/\bfrom\s+['"]edn-parser-js['"]/);
  });

  it('inlines app dependencies in the MCP CLI bundle', () => {
    const source = readFileSync(cliJs, 'utf8');
    expect(source).not.toMatch(/\bfrom\s+['"]@modelcontextprotocol\/sdk/);
    expect(source).not.toMatch(/\bfrom\s+['"]zod['"]/);
    expect(source).not.toMatch(/\bfrom\s+['"]edn-parser-js['"]/);
  });
});
