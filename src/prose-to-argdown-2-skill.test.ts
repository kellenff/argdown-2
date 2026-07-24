import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = join(root, "plugins/argdown-2/skills/prose-to-argdown-2");
const skillPath = join(skillDir, "SKILL.md");

function readText(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

const FIXTURES = [
  "lead-essay",
  "research-abstract",
  "position-disagreement",
  "no-claims",
  "multi-paragraph",
  "ambiguous-prose",
  "legal-opinion-terry",
  "legal-brief-terry",
] as const;

describe("prose-to-argdown-2 skill", () => {
  it("ships SKILL.md with MCP-only EDN rules and three-pass pipeline", () => {
    expect(existsSync(skillPath)).toBe(true);
    const body = readFileSync(skillPath, "utf8");
    expect(body.length).toBeGreaterThan(2000);

    expect(body).toMatch(/^---\nname:\s*prose-to-argdown-2\n/m);
    expect(body.toLowerCase()).toMatch(/hand-?edit|never edit|do not edit/);
    expect(body.toLowerCase()).toMatch(/edn/);
    expect(body.toLowerCase()).toMatch(/mcp/);
    expect(body).toMatch(/create_document/);
    expect(body).toMatch(/add_statement/);
    expect(body).toMatch(/add_relation/);
    expect(body).toMatch(/add_argument/);
    expect(body).toMatch(/add_inference/);
    expect(body).toMatch(/validate/);
    expect(body).toMatch(/Pass 1/);
    expect(body).toMatch(/Pass 2/);
    expect(body).toMatch(/Pass 3/);
    expect(body).toMatch(/source-quote/);
    expect(body).toMatch(/source-line/);
    expect(body).toMatch(/bipolar/);
    expect(body).toMatch(/grounded/);
    expect(body).toMatch(/undercut/);
    expect(body).toMatch(/build-graph/);
    expect(body).toMatch(/validate-debug/);
    expect(body).toMatch(/interpret-solve/);
    expect(body).toMatch(/strongly implies/);
    expect(body).toMatch(/Self-verification/);
    expect(body).toMatch(/Legal filings/);
    expect(body).toMatch(/authority/);
    expect(body).toMatch(/WHEREFORE|relief/);
    expect(body).toMatch(/But see|Contra/);
    expect(body).toMatch(/verbatim/);
  });

  it("forbids undercut emission and hand-written EDN fallback", () => {
    const body = readFileSync(skillPath, "utf8").toLowerCase();
    expect(body).toMatch(/never emit `?undercut`?/);
    expect(body).toMatch(/do not hand-write edn/);
  });

  it("documents solver selection for support vs attack-only graphs", () => {
    const body = readFileSync(skillPath, "utf8");
    expect(body).toMatch(/Pass 0:\s*Solver plan/);
    expect(body).toMatch(/Any `support`/);
    expect(body).toMatch(/Only `attack` \/ `contradiction`/);
  });

  it("ships fixtures with input + assertions for each case", () => {
    for (const name of FIXTURES) {
      const dir = join(skillDir, "fixtures", name);
      expect(existsSync(join(dir, "input.txt"))).toBe(true);
      expect(existsSync(join(dir, "assertions.json"))).toBe(true);
      const assertions = JSON.parse(
        readFileSync(join(dir, "assertions.json"), "utf8"),
      ) as {
        fixture: string;
        mcp_only?: boolean;
        provenance_required?: boolean;
        expects_document?: boolean;
        refuse_extraction?: boolean;
      };
      expect(assertions.fixture).toBe(name);
      expect(assertions.mcp_only).toBe(true);
      if (name === "no-claims") {
        expect(assertions.refuse_extraction).toBe(true);
        expect(assertions.expects_document).toBe(false);
      } else {
        expect(assertions.expects_document).toBe(true);
        expect(assertions.provenance_required).toBe(true);
      }
      const input = readFileSync(join(dir, "input.txt"), "utf8").trim();
      expect(input.length).toBeGreaterThan(10);
    }
  });

  it("fixture directory contains only the expected cases", () => {
    const names = readdirSync(join(skillDir, "fixtures"), {
      withFileTypes: true,
    })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(names).toEqual([...FIXTURES].sort());
  });

  it("is registered alongside sibling skills in Claude and Pi tests", () => {
    const claude = readText("src/claude-plugin.test.ts");
    const pi = readText("src/pi-package.test.ts");
    expect(claude).toMatch(/"prose-to-argdown-2"/);
    expect(pi).toMatch(/"prose-to-argdown-2"/);
  });

  it("design spec exists for the EDN/MCP skill", () => {
    const spec = readText(
      "docs/snowball/specs/2026-07-24-prose-to-argdown-2-skill-design.md",
    );
    expect(spec).toMatch(/prose-to-argdown-2/);
    expect(spec).toMatch(/MCP builder/);
    expect(spec).toMatch(/never hand-edit/i);
  });

  it("MANUAL.md covers MCP-only smoke steps", () => {
    const manual = readFileSync(join(skillDir, "MANUAL.md"), "utf8");
    expect(manual).toMatch(/lead-essay/);
    expect(manual).toMatch(/no-claims/);
    expect(manual.toLowerCase()).toMatch(/hand-edit/);
    expect(manual).toMatch(/validate/);
  });
});

describe("prose-to-argdown-2 fixture assertion contracts", () => {
  it("lead-essay prefers bipolar and requires arguments", () => {
    const a = readJson(
      "plugins/argdown-2/skills/prose-to-argdown-2/fixtures/lead-essay/assertions.json",
    ) as {
      preferred_solver: string;
      expects_arguments: boolean;
      forbidden_relation_kinds: string[];
      min_statements: number;
    };
    expect(a.preferred_solver).toBe("bipolar");
    expect(a.expects_arguments).toBe(true);
    expect(a.forbidden_relation_kinds).toContain("undercut");
    expect(a.min_statements).toBeGreaterThanOrEqual(6);
  });

  it("ambiguous-prose forbids arguments and relations", () => {
    const a = readJson(
      "plugins/argdown-2/skills/prose-to-argdown-2/fixtures/ambiguous-prose/assertions.json",
    ) as {
      expects_arguments: boolean;
      max_arguments: number;
      max_relations: number;
      preferred_solver: string;
    };
    expect(a.expects_arguments).toBe(false);
    expect(a.max_arguments).toBe(0);
    expect(a.max_relations).toBe(0);
    expect(a.preferred_solver).toBe("grounded");
  });

  it("legal-opinion-terry requires verbatim authorities and fact/holding split", () => {
    const a = readJson(
      "plugins/argdown-2/skills/prose-to-argdown-2/fixtures/legal-opinion-terry/assertions.json",
    ) as {
      preferred_solver: string;
      must_capture_authorities: string[];
      separate_facts_from_holdings: boolean;
      forbid_invented_doctrine: boolean;
    };
    const input = readText(
      "plugins/argdown-2/skills/prose-to-argdown-2/fixtures/legal-opinion-terry/input.txt",
    );
    expect(a.preferred_solver).toBe("bipolar");
    expect(a.separate_facts_from_holdings).toBe(true);
    expect(a.forbid_invented_doctrine).toBe(true);
    expect(a.must_capture_authorities.length).toBeGreaterThanOrEqual(4);
    for (const cite of a.must_capture_authorities) {
      expect(input).toContain(cite);
    }
    expect(input).toContain("We merely hold today");
    expect(input).toContain("Officer McFadden testified");
  });

  it("legal-brief-terry requires relief, sections, and Terry cite", () => {
    const a = readJson(
      "plugins/argdown-2/skills/prose-to-argdown-2/fixtures/legal-brief-terry/assertions.json",
    ) as {
      must_capture_relief_span: string;
      expect_section_awareness: string[];
      must_capture_authorities: string[];
    };
    const input = readText(
      "plugins/argdown-2/skills/prose-to-argdown-2/fixtures/legal-brief-terry/input.txt",
    );
    expect(input).toContain(a.must_capture_relief_span);
    for (const section of a.expect_section_awareness) {
      expect(input).toContain(section);
    }
    for (const cite of a.must_capture_authorities) {
      expect(input).toContain(cite);
    }
  });
});
