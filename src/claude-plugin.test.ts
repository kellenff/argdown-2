import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

const SKILLS = ["build-graph", "validate-debug", "interpret-solve"] as const;

describe("Claude Code plugin MCP config", () => {
  it("has a valid marketplace manifest for local install", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json") as {
      name: string;
      owner: { name: string };
      plugins: Array<{ name: string; source: string; description: string }>;
    };
    const manifest = readJson(
      "plugins/argdown-2/.claude-plugin/plugin.json",
    ) as { name: string };
    expect(marketplace.name).toBe("argdown-2");
    expect(marketplace.owner.name).toBeTruthy();
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]?.name).toBe(manifest.name);
    expect(marketplace.plugins[0]?.source).toBe("./plugins/argdown-2");
    expect(marketplace.plugins[0]?.description.length).toBeGreaterThan(10);
  });

  it("has a valid plugin manifest", () => {
    const manifest = readJson(
      "plugins/argdown-2/.claude-plugin/plugin.json",
    ) as {
      name: string;
      version: string;
      description: string;
    };
    const denoVersion = (readJson("deno.json") as { version: string }).version;
    expect(manifest.name).toBe("argdown-2");
    expect(manifest.version).toBe(denoVersion);
    expect(manifest.description.length).toBeGreaterThan(10);
  });

  it("exposes argdown-2 via CLAUDE_PLUGIN_ROOT launcher in plugin .mcp.json", () => {
    const mcp = readJson("plugins/argdown-2/.mcp.json") as {
      mcpServers: {
        "argdown-2": { command: string; args: string[] };
      };
    };
    const server = mcp.mcpServers["argdown-2"];
    expect(server.command).toBe("bash");
    expect(server.args).toEqual([
      "${CLAUDE_PLUGIN_ROOT}/scripts/argdown-2-mcp",
    ]);
  });

  it("keeps root mcp.json on the Deno binary launcher", () => {
    const mcp = readJson("mcp.json") as {
      mcpServers: {
        "argdown-2": { command: string; args: string[] };
      };
    };
    const server = mcp.mcpServers["argdown-2"];
    expect(server.command).toBe("bash");
    expect(server.args).toEqual(["scripts/argdown-2-mcp"]);

    const denoVersion = (readJson("deno.json") as { version: string }).version;
    const launcherVersion = readText("scripts/argdown-2-mcp.version").trim();
    expect(launcherVersion).toBe(denoVersion);
  });

  it("keeps plugin launcher copy in sync with canonical scripts/", () => {
    expect(readText("plugins/argdown-2/scripts/argdown-2-mcp")).toBe(
      readText("scripts/argdown-2-mcp"),
    );
    expect(readText("plugins/argdown-2/scripts/argdown-2-mcp.version").trim())
      .toBe(readText("scripts/argdown-2-mcp.version").trim());
  });

  it("ships skills that forbid hand-editing EDN", () => {
    for (const name of SKILLS) {
      const body = readText(
        `plugins/argdown-2/skills/${name}/SKILL.md`,
      );
      expect(body.length).toBeGreaterThan(50);
      expect(body.toLowerCase()).toMatch(/hand-?edit|never edit|do not edit/);
      expect(body.toLowerCase()).toMatch(/edn/);
      expect(body.toLowerCase()).toMatch(/mcp/);
    }
  });
});
