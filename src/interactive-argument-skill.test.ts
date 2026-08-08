import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = join(root, "plugins/argdown-2/skills/interactive-argument");
const skillPath = join(skillDir, "SKILL.md");

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("interactive-argument skill", () => {
  it("ships SKILL.md with interactive loop, research gate, and MCP-only EDN rules", () => {
    expect(existsSync(skillPath)).toBe(true);
    const body = readFileSync(skillPath, "utf8");
    expect(body.length).toBeGreaterThan(1500);

    expect(body).toMatch(/^---\nname:\s*interactive-argument\n/m);
    expect(body).toMatch(/^description:\s*/m);
    expect(body).toMatch(/Use when/i);

    expect(body.toLowerCase()).toMatch(/hand-?edit|never edit|do not edit/);
    expect(body.toLowerCase()).toMatch(/edn/);
    expect(body.toLowerCase()).toMatch(/mcp/);
    expect(body).toMatch(/create_document|add_statement|add_relation/);
    expect(body).toMatch(/validate/);

    expect(body).toMatch(/prose/i);
    expect(body).toMatch(/clarif/i);
    expect(body).toMatch(/citation|authority/i);
    expect(body).toMatch(/research/i);
    expect(body).toMatch(/confirm/i);
    expect(body).toMatch(/one (question|move|clarifying)/i);

    expect(body).toMatch(/build-graph/);
    expect(body).toMatch(/validate-debug/);
    expect(body).toMatch(/interpret-solve/);
    expect(body).toMatch(/prose-to-argdown-2/);

    expect(body).toMatch(/Self-verification|Red flags|Rationalization/i);
    expect(body).toMatch(/implied confirmation|confirmation is implied/i);
    expect(body).toMatch(/never invent|do not invent/i);
  });

  it("description triggers on interactive build without summarizing the workflow steps", () => {
    const body = readFileSync(skillPath, "utf8");
    const fm = body.match(/^---\n([\s\S]*?)\n---\n/);
    expect(fm).not.toBeNull();
    const frontmatter = fm![1]!;
    expect(frontmatter).toMatch(/description:/);
    expect(frontmatter.toLowerCase()).toMatch(/use when/);
    // CSO: description must not be a mini runbook
    expect(frontmatter.toLowerCase()).not.toMatch(
      /propose a research brief|one move per turn|dispatch research agents/,
    );
  });

  it("forbids research without explicit confirmation and hand-written EDN fallback", () => {
    const body = readFileSync(skillPath, "utf8").toLowerCase();
    expect(body).toMatch(/explicit/);
    expect(body).toMatch(/confirm/);
    expect(body).toMatch(
      /do not hand-write edn|never hand-edit|do not write\/edit/,
    );
  });

  it("is registered alongside sibling skills in Claude and Pi tests", () => {
    const claude = readText("src/claude-plugin.test.ts");
    const pi = readText("src/pi-package.test.ts");
    expect(claude).toMatch(/"interactive-argument"/);
    expect(pi).toMatch(/"interactive-argument"/);
  });

  it("MANUAL.md covers prose-start, path-start, and research gate", () => {
    const manual = readFileSync(join(skillDir, "MANUAL.md"), "utf8");
    expect(manual).toMatch(/prose/i);
    expect(manual).toMatch(/path|\.edn/i);
    expect(manual.toLowerCase()).toMatch(/confirm/);
    expect(manual.toLowerCase()).toMatch(/research/);
    expect(manual.toLowerCase()).toMatch(/hand-edit/);
  });
});
