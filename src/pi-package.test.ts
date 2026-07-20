import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

import { connectArgdownMcp } from "../pi/extensions/mcp-bridge.ts";
import { resolveLauncherPath } from "../pi/extensions/resolve-launcher.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath: string): unknown {
  return JSON.parse(
    Deno.readTextFileSync(join(root, relativePath)),
  );
}

function readText(relativePath: string): string {
  return Deno.readTextFileSync(join(root, relativePath));
}

const SKILLS = ["build-graph", "validate-debug", "interpret-solve"] as const;

const TOOL_NAMES = [
  "add_argument",
  "add_inference",
  "add_relation",
  "add_statement",
  "create_document",
  "list_elements",
  "remove_element",
  "remove_relation",
  "solve",
  "update_statement",
  "validate",
].sort();

describe("Pi package", () => {
  it("has a valid root package.json Pi manifest", () => {
    const pkg = readJson("package.json") as {
      name: string;
      version: string;
      keywords: string[];
      dependencies: Record<string, string>;
      peerDependencies: Record<string, string>;
      files: string[];
      pi: { skills: string[]; extensions: string[] };
    };
    const denoVersion = (readJson("deno.json") as { version: string }).version;

    expect(pkg.name).toBe("argdown-2-pi");
    expect(pkg.version).toBe(denoVersion);
    expect(pkg.keywords).toContain("pi-package");
    expect(pkg.pi.skills).toEqual(["./plugins/argdown-2/skills"]);
    expect(pkg.pi.extensions).toEqual([
      "./pi/extensions/argdown-2-mcp.ts",
    ]);
    expect(pkg.dependencies["@modelcontextprotocol/sdk"]).toBe("1.29.0");
    expect(pkg.peerDependencies["@earendil-works/pi-coding-agent"]).toBe(
      "*",
    );
    expect(pkg.peerDependencies["typebox"]).toBe("*");
    expect(pkg.files).toEqual([
      "pi",
      "plugins/argdown-2/skills",
      "scripts",
      "package.json",
      "README.md",
    ]);

    for (const skill of SKILLS) {
      expect(
        existsSync(join(root, "plugins/argdown-2/skills", skill, "SKILL.md")),
      ).toBe(true);
    }
    expect(
      existsSync(join(root, "pi/extensions/argdown-2-mcp.ts")),
    ).toBe(true);
  });

  it("does not duplicate skills outside plugins/argdown-2/skills", () => {
    expect(existsSync(join(root, "pi/skills"))).toBe(false);
    expect(existsSync(join(root, "skills"))).toBe(false);
  });

  it("resolves the canonical launcher from the extension module URL", () => {
    const extensionUrl = new URL(
      "../pi/extensions/argdown-2-mcp.ts",
      import.meta.url,
    ).href;
    const launcher = resolveLauncherPath(extensionUrl);
    expect(launcher).toBe(join(root, "scripts/argdown-2-mcp"));
    expect(existsSync(launcher)).toBe(true);
  });

  it("extension entry default-exports a factory", () => {
    const source = readText("pi/extensions/argdown-2-mcp.ts");
    expect(source).toMatch(/export\s+default\s+async\s+function/);
  });
});

// StdioClientTransport.close() races a 2s setTimeout; Deno 2.4.5 sanitizeOps
// treats that timer as a leak even when .unref()'d. Isolate the subprocess
// bridge test so shape checks stay strict.
describe({
  name: "Pi package MCP bridge",
  sanitizeOps: false,
  sanitizeResources: false,
  fn() {
    it("bridges MCP over bash launcher (initialize + listTools)", async () => {
      const extensionUrl = new URL(
        "../pi/extensions/argdown-2-mcp.ts",
        import.meta.url,
      ).href;
      const session = await connectArgdownMcp(extensionUrl);

      try {
        expect(session.tools.map((t: { name: string }) => t.name).sort())
          .toEqual(TOOL_NAMES);
      } finally {
        await session.close();
      }
    });
  },
});
