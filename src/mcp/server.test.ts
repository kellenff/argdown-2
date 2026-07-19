import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect } from '@std/expect';
import { afterEach, beforeEach, describe, it } from '@std/testing/bdd';

import { buildServer } from './server.js';

const TOOL_NAMES = [
  'add_argument',
  'add_inference',
  'add_relation',
  'add_statement',
  'create_document',
  'list_elements',
  'remove_element',
  'remove_relation',
  'solve',
  'update_statement',
  'validate',
].sort();

let client: Client;
let server: ReturnType<typeof buildServer>;

beforeEach(async () => {
  server = buildServer();
  client = new Client({ name: 'argdown-2-mcp-test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
});

afterEach(async () => {
  await Promise.allSettled([client.close(), server.close()]);
});

function parseToolResult(res: { content: { type: string; text: string }[] }) {
  return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
}

describe('argdown-2 mcp registration', () => {
  it('lists the builder tools', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(TOOL_NAMES);
  });

  it('create_document + add_statement path mode smoke', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'argdown-mcp-server-'));
    const path = join(dir, 'doc.edn');

    const created = await client.callTool({
      name: 'create_document',
      arguments: { path },
    });
    expect(parseToolResult(created as { content: { type: string; text: string }[] }).ok).toBe(true);

    const added = await client.callTool({
      name: 'add_statement',
      arguments: { path, id: 'a', text: 'A' },
    });
    expect(parseToolResult(added as { content: { type: string; text: string }[] }).ok).toBe(true);
  });
});
