import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

describe("Cursor plugin MCP config", () => {
  it("has a valid marketplace manifest for local install", () => {
    const marketplace = readJson(".cursor-plugin/marketplace.json") as {
      name: string;
      owner: { name: string };
      plugins: Array<{ name: string; source: string; description: string }>;
    };
    const manifest = readJson(".cursor-plugin/plugin.json") as { name: string };
    expect(marketplace.name).toBe("argdown-2");
    expect(marketplace.owner.name).toBeTruthy();
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]?.name).toBe(manifest.name);
    expect(marketplace.plugins[0]?.source).toBe(".");
    expect(marketplace.plugins[0]?.description.length).toBeGreaterThan(10);
  });

  it("has a valid plugin manifest", () => {
    const manifest = readJson(".cursor-plugin/plugin.json") as {
      name: string;
      version: string;
      description: string;
      logo: string;
    };
    expect(manifest.name).toBe("argdown-2");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.description.length).toBeGreaterThan(10);
    expect(manifest.logo).toBe("assets/logo.svg");
  });

  it("exposes argdown-2 via the Deno binary launcher", () => {
    const mcp = readJson("mcp.json") as {
      mcpServers: {
        "argdown-2": { command: string; args: string[] };
      };
    };
    const server = mcp.mcpServers["argdown-2"];
    expect(server.command).toBe("bash");
    expect(server.args).toEqual(["scripts/argdown-2-mcp"]);

    const denoVersion = (readJson("deno.json") as { version: string }).version;
    const launcherVersion = readFileSync(
      join(root, "scripts/argdown-2-mcp.version"),
      "utf8",
    ).trim();
    expect(launcherVersion).toBe(denoVersion);
  });

  it("keeps a Deno-based project MCP config for local clones", () => {
    const local = readJson(".cursor/mcp.json") as {
      mcpServers: {
        "argdown-2": { command: string; args: string[] };
      };
    };
    expect(local.mcpServers["argdown-2"]).toEqual({
      command: "deno",
      args: ["task", "mcp"],
    });
  });
});
