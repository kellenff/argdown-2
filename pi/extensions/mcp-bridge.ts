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

export type ArgdownMcpOptions = {
  /**
   * Extra environment variables to forward to the MCP subprocess.
   * Useful in tests to point the launcher at a locally-compiled binary
   * (via `ARGDOWN2_MCP_BIN`) without modifying the global process env,
   * and to work around the MCP SDK stdio env allowlist that does not
   * include `ARGDOWN2_MCP_BIN` by default.
   */
  extraEnv?: Readonly<Record<string, string>>;
};

export async function connectArgdownMcp(
  extensionModuleUrl: string,
  options: ArgdownMcpOptions = {},
): Promise<ArgdownMcpSession> {
  const launcher = resolveLauncherPath(extensionModuleUrl);
  const client = new Client({
    name: "argdown-2-pi",
    version: "0.0.0",
  });
  const transport = new StdioClientTransport({
    command: "bash",
    args: [launcher],
    // Avoid an unread PassThrough when stderr is "pipe".
    stderr: "ignore",
    // Forward the SDK default env (HOME, PATH, ...) plus any extras.
    // The SDK's allowlist otherwise drops unknown vars like
    // ARGDOWN2_MCP_BIN that the launcher uses to bypass GitHub release
    // fetches.
    ...(options.extraEnv ? { env: { ...options.extraEnv } } : {}),
  });

  await client.connect(transport);
  let tools: McpToolSummary[];
  try {
    const listed = await client.listTools();
    tools = listed.tools.map((tool: {
      name: string;
      description?: string;
      inputSchema?: unknown;
    }) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown> | undefined,
    }));
  } catch (error) {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
    throw error;
  }

  return {
    client,
    tools,
    close: async () => {
      await client.close().catch(() => {});
      await transport.close().catch(() => {});
    },
  };
}

export async function callArgdownTool(
  session: ArgdownMcpSession,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ text: string; isError: boolean }> {
  const result = await session.client.callTool(
    {
      name,
      arguments: args,
    },
    undefined,
    { signal },
  );
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
