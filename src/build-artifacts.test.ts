import { assertEquals } from "@std/assert";
import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

describe("deno package contract", () => {
  it("declares JSR name, version, and library export", () => {
    const deno = readJson("deno.json") as {
      name: string;
      version: string;
      exports: string | Record<string, string>;
    };
    expect(deno.name).toBe("@casualtheorics/argdown-2");
    expect(deno.version).toMatch(/^\d+\.\d+\.\d+/);
    const exportPath = typeof deno.exports === "string"
      ? deno.exports
      : deno.exports["."];
    expect(exportPath).toBe("./src/index.ts");
    expect(existsSync(join(root, "src/index.ts"))).toBe(true);
  });

  it("vendors edn-parser-js instead of npm:", () => {
    const deno = readJson("deno.json") as { imports: Record<string, string> };
    expect(deno.imports["edn-parser-js"]).toBe(
      "./vendor/edn-parser-js/lib/index.js",
    );
    expect(existsSync(join(root, "vendor/edn-parser-js/lib/index.js"))).toBe(
      true,
    );
  });

  it("has no package.json (Yarn/npm package removed)", () => {
    expect(existsSync(join(root, "package.json"))).toBe(false);
  });

  it("declares publish:dry-run task for JSR slow-types verification", () => {
    const deno = readJson("deno.json") as {
      tasks?: Record<string, string>;
    };
    expect(deno.tasks?.["publish:dry-run"]).toBe(
      "deno publish --dry-run --allow-dirty",
    );
  });
});

Deno.test("JSR slow-types check passes", async () => {
  const cmd = new Deno.Command("deno", {
    args: ["publish", "--dry-run", "--allow-dirty"],
    cwd: root,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  const output = new TextDecoder().decode(stdout) +
    new TextDecoder().decode(stderr);
  assertEquals(code, 0, output);
  assertEquals(
    output.includes("Checking for slow types in the public API"),
    true,
  );
  assertEquals(output.includes("Dry run complete"), true);
});
