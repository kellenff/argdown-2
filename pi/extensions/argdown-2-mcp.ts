import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  type ArgdownMcpSession,
  callArgdownTool,
  connectArgdownMcp,
} from "./mcp-bridge.ts";

function parametersFromInputSchema(
  inputSchema: Record<string, unknown> | undefined,
) {
  if (inputSchema && typeof inputSchema === "object") {
    return Type.Unsafe(inputSchema);
  }
  return Type.Object({});
}

export default async function (pi: ExtensionAPI): Promise<void> {
  let session: ArgdownMcpSession | null = null;
  let connecting: Promise<void> | null = null;
  let connectGeneration = 0;

  async function ensureConnected(ctx: {
    ui: { notify: (message: string, level?: string) => void };
  }): Promise<ArgdownMcpSession | null> {
    if (session) return session;
    if (!connecting) {
      const generation = connectGeneration;
      connecting = (async () => {
        try {
          const connected = await connectArgdownMcp(import.meta.url);
          if (generation !== connectGeneration) {
            await connected.close();
            return;
          }
          session = connected;
        } catch (error) {
          const message = error instanceof Error
            ? error.message
            : String(error);
          ctx.ui.notify(
            `argdown-2 MCP failed to start: ${message}`,
            "error",
          );
          session = null;
        } finally {
          connecting = null;
        }
      })();
    }
    await connecting;
    return session;
  }

  pi.on("session_start", async (_event, ctx) => {
    await ensureConnected(ctx);
    if (!session) return;

    for (const tool of session.tools) {
      pi.registerTool({
        name: tool.name,
        label: tool.name,
        description: tool.description ?? tool.name,
        parameters: parametersFromInputSchema(tool.inputSchema),
        async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
          const active = session;
          if (!active) {
            return {
              content: [{
                type: "text",
                text: "argdown-2 MCP disconnected — try /reload",
              }],
              details: {},
            };
          }
          try {
            const result = await callArgdownTool(
              active,
              tool.name,
              params as Record<string, unknown>,
              signal,
            );
            return {
              content: [{ type: "text", text: result.text }],
              details: { isError: result.isError },
            };
          } catch (error) {
            const message = error instanceof Error
              ? error.message
              : String(error);
            return {
              content: [{
                type: "text",
                text: `argdown-2 MCP error: ${message}. Try /reload`,
              }],
              details: { isError: true },
            };
          }
        },
      });
    }
  });

  pi.on("session_shutdown", async () => {
    connectGeneration++;
    if (session) {
      await session.close();
      session = null;
    }
  });
}
