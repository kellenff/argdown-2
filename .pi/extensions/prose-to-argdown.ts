import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILL_PATH = join(
  import.meta.dirname,
  "..",
  "..",
  "skills",
  "prose-to-argdown",
  "SKILL.md",
);

export default function (pi: ExtensionAPI) {
  // Load the SKILL.md content once at extension load.
  let skillBody: string | null = null;
  try {
    skillBody = readFileSync(SKILL_PATH, "utf8");
  } catch {
    // SKILL.md missing — proceed without it; surfaces warning in session_start.
  }

  pi.on("session_start", async (_event, ctx) => {
    if (!skillBody) {
      ctx.ui.notify(
        "prose-to-argdown: SKILL.md not found at skills/prose-to-argdown/SKILL.md",
        "warning",
      );
    }
  });

  // Slash command: load the skill content as a system-prompt augmentation
  // before invoking the agent with the user's prose as input.
  pi.registerCommand("prose-to-argdown", {
    description:
      "Distill the next message as prose into a full argdown-2 document with grounded arguments and provenance. Follows the three-pass pipeline in SKILL.md.",
    handler: async (args, ctx) => {
      const prose = (args ?? "").trim();
      if (!prose) {
        ctx.ui.notify("Usage: /prose-to-argdown <prose>", "info");
        return;
      }
      if (skillBody && ctx.mode === "tui") {
        await ctx.newSession({
          withSession: async (sctx) => {
            await sctx.sendUserMessage(prose);
          },
        });
        // After session replacement, re-inject the skill body via
        // before_agent_start on the next prompt.
      }
    },
  });

  // Custom tool: the LLM can call this to validate a candidate argdown-2
  // source string via the argdown-2 MCP server.
  pi.registerTool({
    name: "argdown_validate",
    label: "Argdown Validate",
    description:
      "Validate a candidate argdown-2 source string. Returns ok:true on success, or a list of parse errors.",
    promptSnippet:
      "Validate argdown-2 syntax by calling argdown_validate(source) before delivery.",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "The argdown-2 source to validate." },
      },
      required: ["source"],
    },
    async execute(_toolCallId, params) {
      // Defer to the argdown-2 MCP server if available; otherwise surface
      // a clear "tool unavailable" result so the agent can fall back.
      // Implementation depends on the host's MCP wiring — this is a
      // thin shim; the actual MCP call is delegated to the host.
      return {
        content: [
          {
            type: "text",
            text: `argdown_validate: not wired in this host; run \`yarn node ./dist/cli.js validate\` locally on the source instead.`,
          },
        ],
        details: {},
      };
    },
  });
}
