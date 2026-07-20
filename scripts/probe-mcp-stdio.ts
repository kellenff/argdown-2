#!/usr/bin/env -S deno run -A
import { basename } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const host = Deno.args[0];
if (!host) {
  console.error("Usage: deno task probe:mcp -- <path-to-argdown-2-mcp-binary>");
  console.error("   or: deno run -A scripts/probe-mcp-stdio.ts <path>");
  Deno.exit(2);
}

try {
  await Deno.lstat(host);
  const mode = (await Deno.stat(host)).mode;
  if (mode !== null && (mode & 0o111) === 0) {
    throw new Error("not executable");
  }
} catch {
  console.error(`error: MCP host is not executable: ${host}`);
  Deno.exit(1);
}

function parseToolResult(
  result: { content?: Array<{ type: string; text?: string }> },
) {
  const content = result.content?.[0];
  if (content?.type !== "text" || typeof content.text !== "string") {
    throw new Error(
      `unexpected tool result content: ${JSON.stringify(result)}`,
    );
  }
  return JSON.parse(content.text);
}

const client = new Client({
  name: "argdown-2-mcp-stdio-probe",
  version: "0.0.0",
});
const transport = new StdioClientTransport({
  command: host,
  args: [],
  stderr: "inherit",
});
let failed = false;

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (!tools.some((tool) => tool.name === "create_document")) {
    throw new Error(
      `create_document tool not found; listed tools: ${
        tools.map((t) => t.name).join(", ")
      }`,
    );
  }
  const created = await client.callTool({
    name: "create_document",
    arguments: { source: "" },
  });
  if (created.isError) {
    throw new Error(
      `create_document returned MCP error: ${JSON.stringify(created)}`,
    );
  }
  const payload = parseToolResult(
    created as { content?: Array<{ type: string; text?: string }> },
  );
  if (payload.ok !== true) {
    throw new Error(
      `create_document did not return ok: ${JSON.stringify(payload)}`,
    );
  }
  let source = payload.source as string;
  for (const [id, text] of [["a", "A"], ["b", "B"]] as const) {
    const added = parseToolResult(
      await client.callTool({
        name: "add_statement",
        arguments: { source, id, text },
      }) as { content?: Array<{ type: string; text?: string }> },
    );
    if (added.ok !== true) {
      throw new Error(
        `add_statement did not return ok: ${JSON.stringify(added)}`,
      );
    }
    source = added.source;
  }
  const related = parseToolResult(
    await client.callTool({
      name: "add_relation",
      arguments: {
        source,
        id: "attack-a-b",
        kind: "attack",
        from: "a",
        to: "b",
      },
    }) as { content?: Array<{ type: string; text?: string }> },
  );
  if (related.ok !== true) {
    throw new Error(
      `add_relation did not return ok: ${JSON.stringify(related)}`,
    );
  }
  const solved = parseToolResult(
    await client.callTool({
      name: "solve",
      arguments: { source: related.source },
    }) as { content?: Array<{ type: string; text?: string }> },
  );
  if (
    solved.ok !== true ||
    solved.native?.values?.a !== "in" ||
    solved.native?.values?.b !== "out"
  ) {
    throw new Error(
      `solve returned unexpected result: ${JSON.stringify(solved)}`,
    );
  }
  console.log(`probe-mcp-stdio: ok (${basename(host)})`);
} catch (error) {
  failed = true;
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: MCP stdio probe failed for ${host}: ${message}`);
} finally {
  await client.close().catch(() => {});
}

if (failed) Deno.exit(1);
