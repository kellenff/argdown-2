import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), 'utf8'));
}

describe('Cursor plugin MCP config', () => {
  it('has a valid marketplace manifest for local install', () => {
    const marketplace = readJson('.cursor-plugin/marketplace.json') as {
      name: string;
      owner: { name: string };
      plugins: Array<{ name: string; source: string; description: string }>;
    };
    const manifest = readJson('.cursor-plugin/plugin.json') as { name: string };
    expect(marketplace.name).toBe('argdown-2');
    expect(marketplace.owner.name).toBeTruthy();
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]?.name).toBe(manifest.name);
    expect(marketplace.plugins[0]?.source).toBe('.');
    expect(marketplace.plugins[0]?.description.length).toBeGreaterThan(10);
  });

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

  it('exposes argdown-2 via the Deno binary launcher', () => {
    const mcp = readJson('mcp.json') as {
      mcpServers: {
        'argdown-2': { command: string; args: string[] };
      };
    };
    const server = mcp.mcpServers['argdown-2'];
    expect(server.command).toBe('bash');
    expect(server.args).toEqual(['scripts/argdown-2-mcp']);

    const packageVersion = (readJson('package.json') as { version: string }).version;
    const launcherVersion = readFileSync(
      join(root, 'scripts/argdown-2-mcp.version'),
      'utf8',
    ).trim();
    expect(launcherVersion).toBe(packageVersion);
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
