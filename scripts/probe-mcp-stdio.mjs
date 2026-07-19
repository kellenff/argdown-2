#!/usr/bin/env node
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { basename } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [host] = process.argv.slice(2);

if (!host) {
  console.error('Usage: yarn probe:mcp <path-to-argdown-2-mcp-binary>');
  process.exit(2);
}

try {
  await access(host, constants.X_OK);
} catch {
  console.error(`error: MCP host is not executable: ${host}`);
  process.exit(1);
}

function parseToolResult(result) {
  const content = result.content?.[0];
  if (content?.type !== 'text' || typeof content.text !== 'string') {
    throw new Error(`unexpected tool result content: ${JSON.stringify(result)}`);
  }

  return JSON.parse(content.text);
}

const client = new Client({ name: 'argdown-2-mcp-stdio-probe', version: '0.0.0' });
const transport = new StdioClientTransport({ command: host, args: [] });

try {
  await client.connect(transport);

  const { tools } = await client.listTools();
  if (!tools.some((tool) => tool.name === 'create_document')) {
    throw new Error(
      `create_document tool not found; listed tools: ${tools.map((tool) => tool.name).join(', ')}`,
    );
  }

  const created = await client.callTool({
    name: 'create_document',
    arguments: { source: '' },
  });
  const payload = parseToolResult(created);

  if (payload.ok !== true) {
    throw new Error(`create_document did not return ok: ${JSON.stringify(payload)}`);
  }

  console.log(`probe-mcp-stdio: ok (${basename(host)})`);
} finally {
  await client.close().catch(() => {});
}
