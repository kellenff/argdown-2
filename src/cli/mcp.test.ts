// src/cli/mcp.test.ts
// Tests for the `argdown mcp` subcommand. We don't spawn a child process —
// that would mean dragging stdio and a separate Node VM through the test
// runner for no real coverage gain. Instead we drive the server in-process
// using the SDK's `InMemoryTransport`, which is the same transport the SDK
// itself uses for its own test suite.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from './mcp.js';

const SRC_BASIC = '[#a] claim.\n[#b] other.\n[#a] --> [#b].\n';
const SRC_MALFORMED = '[#a -->\n';

type TextContent = { type: 'text'; text: string };
type ToolResult = { content: TextContent[]; isError?: boolean };

function textOf(res: { content: unknown; isError?: boolean }): TextContent {
  const c = (res.content as TextContent[])[0];
  if (!c || c.type !== 'text') throw new Error('expected text content');
  return c;
}

let client: Client;
let server: ReturnType<typeof buildServer>;

beforeEach(async () => {
  server = buildServer();
  client = new Client({ name: 'argdown-mcp-test', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(a), server.connect(b)]);
});

afterEach(async () => {
  await Promise.allSettled([client.close(), server.close()]);
});

describe('argdown mcp — registration', () => {
  it('lists all 5 tools', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['format', 'parse', 'render_mermaid', 'solve', 'validate']);
  });

  it('each tool advertises a description and an inputSchema', async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.description).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
    }
  });
});

describe('argdown mcp — parse tool', () => {
  it('returns ok:true and the AST on a well-formed document', async () => {
    const res = (await client.callTool({ name: 'parse', arguments: { source: SRC_BASIC } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(textOf(res).text) as { ok: boolean; ast: { kind?: string } };
    expect(body.ok).toBe(true);
    expect(body.ast.kind).toBe('Document');
  });

  it('returns ok:false with structured errors on a malformed document', async () => {
    const res = (await client.callTool({ name: 'parse', arguments: { source: SRC_MALFORMED } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(textOf(res).text) as {
      ok: boolean;
      errors: { message: string; code: string; loc: { line: number } }[];
    };
    expect(body.ok).toBe(false);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors[0]?.code).toBeTruthy();
    expect(body.errors[0]?.loc.line).toBe(1);
  });
});

describe('argdown mcp — validate tool', () => {
  it('returns ok:true on a well-formed document', async () => {
    const res = (await client.callTool({ name: 'validate', arguments: { source: SRC_BASIC } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(textOf(res).text)).toEqual({ ok: true, errorCount: 0 });
  });

  it('returns isError:true and ok:false on a malformed document', async () => {
    const res = (await client.callTool({ name: 'validate', arguments: { source: SRC_MALFORMED } })) as ToolResult;
    expect(res.isError).toBe(true);
    const body = JSON.parse(textOf(res).text) as { ok: boolean; errorCount: number; errors: unknown[] };
    expect(body.ok).toBe(false);
    expect(body.errorCount).toBeGreaterThan(0);
    expect(Array.isArray(body.errors)).toBe(true);
  });
});

describe('argdown mcp — render_mermaid tool', () => {
  it('returns a Mermaid flowchart for a well-formed document', async () => {
    const res = (await client.callTool({ name: 'render_mermaid', arguments: { source: SRC_BASIC } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(textOf(res).text) as { ok: boolean; mermaid: string };
    expect(body.ok).toBe(true);
    expect(body.mermaid).toContain('flowchart');
    expect(body.mermaid).toContain('a');
    expect(body.mermaid).toContain('b');
  });

  it('returns isError:true on a malformed document', async () => {
    const res = (await client.callTool({ name: 'render_mermaid', arguments: { source: SRC_MALFORMED } })) as ToolResult;
    expect(res.isError).toBe(true);
  });
});

describe('argdown mcp — solve tool', () => {
  it('runs the default dung semantics and returns grounded labels', async () => {
    const res = (await client.callTool({ name: 'solve', arguments: { source: SRC_BASIC } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(textOf(res).text) as {
      ok: boolean;
      result: {
        semantics: string;
        labels: Record<string, string>;
        groups: { in: string[]; out: string[]; undec: string[] };
        warnings: string[];
      };
    };
    expect(body.ok).toBe(true);
    expect(body.result.semantics).toBe('dung');
    expect(body.result.labels.a).toBeTruthy();
    expect(body.result.groups.in).toBeInstanceOf(Array);
    expect(body.result.groups.out).toBeInstanceOf(Array);
    expect(body.result.groups.undec).toBeInstanceOf(Array);
  });

  it('runs --semantics=bipolar and labels everything IN that has no attackers', async () => {
    const src = '[#a].\n[#b].\n[#x].\n[#a] --> [#b].\n[#x] --x [#a].\n';
    const res = (await client.callTool({ name: 'solve', arguments: { source: src, semantics: 'bipolar' } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(textOf(res).text) as {
      ok: boolean;
      result: { semantics: string; groups: { in: string[]; out: string[] } };
    };
    expect(body.ok).toBe(true);
    expect(body.result.semantics).toBe('bipolar');
    // Under bipolar: x attacks a, a supports b; x is unattacked. a is in via
    // support-promotion, b is in (unattacked), x is in (unattacked). OUT is empty.
    expect(body.result.groups.out).toEqual([]);
    for (const k of ['a', 'b', 'x']) {
      expect(body.result.groups.in).toContain(k);
    }
  });

  it('runs a multi-extension semantics and returns Extension arrays', async () => {
    const src = '[#A] x.\n[#B] y.\n[#A] --x [#B].\n[#B] --x [#A].\n';
    const res = (await client.callTool({ name: 'solve', arguments: { source: src, semantics: 'stable' } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(textOf(res).text) as {
      ok: boolean;
      result: { semantics: string; extensions: string[][]; warnings: string[] };
    };
    expect(body.ok).toBe(true);
    expect(body.result.semantics).toBe('stable');
    expect(body.result.extensions.length).toBeGreaterThan(0);
  });

  it('returns isError:true on a malformed document', async () => {
    const res = (await client.callTool({ name: 'solve', arguments: { source: SRC_MALFORMED } })) as ToolResult;
    expect(res.isError).toBe(true);
  });
});

describe('argdown mcp — format tool', () => {
  it('returns round-tripped source on a well-formed document', async () => {
    const res = (await client.callTool({ name: 'format', arguments: { source: SRC_BASIC } })) as ToolResult;
    expect(res.isError).toBeFalsy();
    const body = JSON.parse(textOf(res).text) as { ok: boolean; source: string };
    expect(body.ok).toBe(true);
    // We don't pin the exact layout (that's the stringifier snapshot suite's
    // job); we just assert the load-bearing tokens survive the round-trip.
    expect(body.source).toContain('#a');
    expect(body.source).toContain('#b');
    expect(body.source).toContain('-->');
  });

  it('returns isError:true on a malformed document', async () => {
    const res = (await client.callTool({ name: 'format', arguments: { source: SRC_MALFORMED } })) as ToolResult;
    expect(res.isError).toBe(true);
  });
});
