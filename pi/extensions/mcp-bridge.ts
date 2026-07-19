import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { resolveLauncherPath } from "./resolve-launcher.ts";

export type McpToolSummary = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type ArgdownMcpSession = {
  client: Client;
  tools: McpToolSummary[];
  close: () => Promise<void>;
};

export async function connectArgdownMcp(
  extensionModuleUrl: string,
): Promise<ArgdownMcpSession> {
  const launcher = resolveLauncherPath(extensionModuleUrl);
  const client = new Client({
    name: "argdown-2-pi",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command: "bash",
    args: [launcher],
    stderr: "pipe",
  });

  await client.connect(transport);
  const listed = await client.listTools();
  const tools: McpToolSummary[] = listed.tools.map((tool: {
    name: string;
    description?: string;
    inputSchema?: unknown;
  }) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
  }));

  return {
    client,
    tools,
    close: async () => {
      await client.close();
    },
  };
}

export async function callArgdownTool(
  session: ArgdownMcpSession,
  name: string,
  args: Record<string, unknown>,
  _signal?: AbortSignal,
): Promise<{ text: string; isError: boolean }> {
  const result = await session.client.callTool({
    name,
    arguments: args,
  });
  const parts = (result.content ?? []) as Array<
    { type: string; text?: string }
  >;
  const text = parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("\n");
  return {
    text: text || JSON.stringify(result),
    isError: Boolean(result.isError),
  };
}
