import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

describe('Cursor plugin MCP config', () => {
  it('has a valid plugin manifest', () => {
    const manifest = readJson('.cursor-plugin/plugin.json') as {
      name: string;
      version: string;
      description: string;
      logo: string;
    };
    expect(manifest.name).toBe('argdown-2');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.description.length).toBeGreaterThan(10);
    expect(manifest.logo).toBe('assets/logo.svg');
  });

  it('exposes argdown-2 via yarn dlx against the release tarball', () => {
    const mcp = readJson('mcp.json') as {
      mcpServers: {
        'argdown-2': { command: string; args: string[] };
      };
    };
    const server = mcp.mcpServers['argdown-2'];
    expect(server.command).toBe('yarn');
    expect(server.args[0]).toBe('dlx');
    expect(server.args[1]).toBe('-p');
    expect(server.args[2]).toMatch(
      /^https:\/\/github\.com\/kellenff\/argdown-2\/releases\/download\/v[\w.-]+\/casualtheorics-argdown-2-[\w.-]+\.tgz$/,
    );
    expect(server.args[3]).toBe('argdown-2-mcp');

    const version = (readJson('package.json') as { version: string }).version;
    expect(server.args[2]).toContain(`v${version}`);
    expect(server.args[2]).toContain(`casualtheorics-argdown-2-${version}.tgz`);
  });

  it('declares edn-parser-js via the Yarn patch protocol', () => {
    const pkg = readJson('package.json') as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['edn-parser-js']).toMatch(
      /^patch:edn-parser-js@npm%3A2\.0\.2#\.\/\.yarn\/patches\/edn-parser-js-npm-2\.0\.2\.patch$/,
    );
  });

  it('keeps a yarn-based project MCP config for local clones', () => {
    const local = readJson('.cursor/mcp.json') as {
      mcpServers: {
        'argdown-2': { command: string; args: string[] };
      };
    };
    expect(local.mcpServers['argdown-2']).toEqual({
      command: 'yarn',
      args: ['node', './dist/mcp/cli.js'],
    });
  });
});
