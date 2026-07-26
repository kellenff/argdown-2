import { assertEquals } from "@std/assert";
import { parseSync } from "@optique/core/parser";
import { formatUsage } from "@optique/core/usage";
import { HELP_FOOTER } from "./help-footer.ts";
import { normalize, parser } from "./parser.ts";
import type { CliResult } from "./parser.ts";

function ok(args: readonly string[]): CliResult {
  const r = parseSync(parser, args);
  if (!r.success) {
    throw new Error(`expected success, got error: ${JSON.stringify(r.error)}`);
  }
  return normalize(r.value);
}

function err(args: readonly string[]): { success: false; message: string } {
  const r = parseSync(parser, args);
  if (r.success) {
    throw new Error(`expected failure, got value: ${JSON.stringify(r.value)}`);
  }
  // Failure result contains an error message; just confirm it's non-empty.
  return { success: false, message: JSON.stringify(r.error) };
}

Deno.test("parser: bare invocation defaults to solve", () => {
  assertEquals(ok(["foo.edn"]), {
    action: "solve",
    path: "foo.edn",
    format: "table",
    quiet: false,
  });
});

Deno.test("parser: --format=json sets format", () => {
  const r = ok(["--format=json", "foo.edn"]);
  assertEquals(r.action, "solve");
  if (r.action !== "solve") throw new Error("expected solve variant");
  assertEquals(r.format, "json");
});

Deno.test("parser: --dry-run flips to validate", () => {
  const r = ok(["--dry-run", "foo.edn"]);
  assertEquals(r.action, "validate");
  assertEquals(r.path, "foo.edn");
});

Deno.test("parser: solve subcommand with --format=dot", () => {
  const r = ok(["solve", "--format=dot", "foo.edn"]);
  assertEquals(r.action, "solve");
  if (r.action !== "solve") throw new Error("expected solve variant");
  assertEquals(r.format, "dot");
});

Deno.test("parser: validate subcommand with --quiet", () => {
  const r = ok(["validate", "--quiet", "foo.edn"]);
  assertEquals(r.action, "validate");
  assertEquals(r.quiet, true);
});

Deno.test("parser: stdin path '-'", () => {
  const r = ok(["-", "--quiet"]);
  assertEquals(r.action, "solve");
  assertEquals(r.path, "-");
  assertEquals(r.quiet, true);
});

Deno.test("parser: unknown flag is a parse error", () => {
  const r = err(["--bogus"]);
  assertEquals(r.success, false);
  if (!r.message || r.message === "undefined") {
    throw new Error("expected non-empty error message");
  }
});

Deno.test("parser: missing path is a parse error", () => {
  const r = err([]);
  assertEquals(r.success, false);
  if (!r.message || r.message === "undefined") {
    throw new Error("expected non-empty error message");
  }
});

Deno.test("parser: subcommand with missing path is a parse error", () => {
  const r = err(["solve"]);
  assertEquals(r.success, false);
  if (!r.message || r.message === "undefined") {
    throw new Error("expected non-empty error message");
  }
});

Deno.test("parser: extra positional is a parse error", () => {
  const r = err(["foo.edn", "bar.edn"]);
  assertEquals(r.success, false);
  if (!r.message || r.message === "undefined") {
    throw new Error("expected non-empty error message");
  }
});

Deno.test("help text snapshot", async () => {
  const text = formatUsage("argdown-2", parser.usage) + HELP_FOOTER;
  const snapshotPath = new URL("./__snapshots__/help.txt", import.meta.url);
  const expected = await Deno.readTextFile(snapshotPath);
  assertEquals(text, expected);
});

Deno.test("exit code: --help exits 0", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "--help"],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  assertEquals(out.code, 0);
  const stdout = new TextDecoder().decode(out.stdout);
  if (!stdout.includes("argdown-2")) {
    throw new Error(
      `expected 'argdown-2' in stdout, got: ${stdout.slice(0, 200)}`,
    );
  }
  if (!stdout.includes("Exit codes")) {
    throw new Error(
      `expected 'Exit codes' in stdout, got: ${stdout.slice(0, 200)}`,
    );
  }
});

Deno.test("exit code: unknown flag exits 2", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "--bogus-flag"],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  assertEquals(out.code, 2);
  const stderr = new TextDecoder().decode(out.stderr);
  if (stderr.length === 0) {
    throw new Error("expected non-empty stderr for usage error");
  }
});

Deno.test("exit code: missing file exits 1", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "does-not-exist.edn"],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  assertEquals(out.code, 1);
  const stderr = new TextDecoder().decode(out.stderr);
  if (!stderr.includes("No such file")) {
    throw new Error(
      `expected 'No such file' in stderr, got: ${stderr.slice(0, 200)}`,
    );
  }
});
