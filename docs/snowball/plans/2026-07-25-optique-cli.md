# Optique CLI Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled `parseArgs` in `src/cli.ts` with an `@optique/core` parser combinator consumed via `@optique/run`; add `solve` and `validate` subcommands while preserving bare-invocation and `--dry-run` as back-compat synonyms.

**Architecture:** New `src/cli/parser.ts` exposes the combinator as a typed value. `src/cli/dispatch.ts` normalizes the parsed shape (flips `--dry-run` → `validate`) and routes to the existing `runValidate` / `runSolve` (untouched). `src/cli.ts` becomes a 10-line entry that calls `await run(parser, ...)` from `@optique/run`, which owns argv reading, `--help`/`--version` printing, and exit-code-2 for usage errors. The dispatcher only ever returns 0 or 1.

**Tech Stack:** Deno 2 + `@optique/core` v1.2.0 + `@optique/run` v1.2.0 (both from JSR). Existing `src/cli/{validate,solve,format,load,input,output}.ts` are untouched. Vitest is not used — this project uses `deno test`.

**Spec:** [`../specs/2026-07-25-optique-cli-design.md`](../specs/2026-07-25-optique-cli-design.md)

---

## File Structure

| File | Change | Purpose |
| --- | --- | --- |
| `deno.json` | Modify | Add `@optique/core` + `@optique/run` to `imports`. |
| `src/cli.ts` | Rewrite | Bin entry: import `parser`, call `run()` from `@optique/run`. |
| `src/cli/parser.ts` | Create | Parser combinator (subcommands + bare invocation + shared options). Exports `parser`, `ParserOutput`, and the `CliResult` discriminated union. |
| `src/cli/dispatch.ts` | Create | `normalize(parsed: ParserOutput): CliResult` + `dispatch(parsed: ParserOutput): Promise<number>`. |
| `src/cli/help-footer.ts` | Create | Rich footer text (output-format descriptions, exit codes, solver-tag notes). |
| `src/cli/help.ts` | Delete | Auto-gen help comes from Optique; footer is in `help-footer.ts`. |
| `src/cli/cli.test.ts` | Delete | Replaced by `parser.test.ts`. |
| `src/cli/parser.test.ts` | Create | Pure parser-shape tests + help snapshot + 3 subprocess exit-code tests. |
| `src/cli/__snapshots__/help.txt` | Create | Frozen help-text output for regression. |
| `README.md` | Modify | Add subcommand examples. |
| `CHANGELOG.md` | Modify | Add unreleased entry. |

Unchanged: `src/cli/{validate,solve,format,format-table,format-json,format-dot,format-mermaid,load,input,output}.ts` and their tests; `src/cli/snapshots.test.ts`; `src/cli/format-*.test.ts`.

---

## Task 1: Add Optique dependencies

**Files:**
- Modify: `deno.json:39-47` (the `imports` block)

- [ ] **Step 1: Edit `deno.json` imports**

Open `deno.json` and add the two Optique imports alongside the existing entries. Keep the alphabetical-ish ordering the file already uses.

Add these two lines inside the `imports` object (place them after the existing `@std/testing/` line at the bottom):

```jsonc
"@optique/core": "jsr:@optique/core@^1.2.0",
"@optique/run": "jsr:@optique/run@^1.2.0",
```

- [ ] **Step 2: Verify the cache resolves**

Run: `deno cache --reload src/cli.ts`

Expected: Deno fetches `@optique/core` and `@optique/run` from JSR, prints their versions, and exits 0. (No errors about missing modules.)

- [ ] **Step 3: Verify the type check passes (still nothing referencing Optique)**

Run: `deno task check:cli-deno`

Expected: exits 0. The deno.json change alone doesn't reference Optique; this confirms the existing `src/cli.ts` still type-checks.

- [ ] **Step 4: Commit**

```bash
git add deno.json
git commit -m "build: add @optique/core and @optique/run to deno.json imports"
```

---

## Task 2: Write failing parser-shape tests

**Files:**
- Create: `src/cli/parser.test.ts`

These tests use Optique's pure `parseSync(parser, args)` API to feed synthetic argv arrays and assert on the parsed `ParserOutput` shape. They cover the cases in the spec's Test-strategy §Layer 1 table.

- [ ] **Step 1: Write the test file**

Create `src/cli/parser.test.ts` with this exact content:

```ts
import { assertEquals } from "@std/assert";
import { parseSync } from "@optique/core/parser";
import { parser, type ParserOutput } from "./parser.ts";

function ok(args: readonly string[]): ParserOutput {
  const r = parseSync(parser, args);
  if (!r.success) {
    throw new Error(`expected success, got error: ${JSON.stringify(r.error)}`);
  }
  return r.value;
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
    dryRun: false,
  });
});

Deno.test("parser: --format=json sets format", () => {
  const r = ok(["--format=json", "foo.edn"]);
  assertEquals(r.action, "solve");
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
});

Deno.test("parser: missing path is a parse error", () => {
  const r = err([]);
  assertEquals(r.success, false);
});

Deno.test("parser: subcommand with missing path is a parse error", () => {
  const r = err(["solve"]);
  assertEquals(r.success, false);
});

Deno.test("parser: extra positional is a parse error", () => {
  const r = err(["foo.edn", "bar.edn"]);
  assertEquals(r.success, false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --allow-all src/cli/parser.test.ts`

Expected: FAIL with `Module not found: ./parser.ts` (or similar import error). The file doesn't exist yet.

- [ ] **Step 3: Commit the failing tests**

```bash
git add src/cli/parser.test.ts
git commit -m "test(cli): add failing parser-shape tests for Optique rewrite"
```

---

## Task 3: Implement the parser combinator

**Files:**
- Create: `src/cli/parser.ts`

This file exports `parser` (the combinator), `ParserOutput` (the raw shape Optique produces — every field optional except `action` and `path`), and the `CliResult` discriminated union. The dispatcher will narrow `ParserOutput` to `CliResult` in Task 4.

- [ ] **Step 1: Write `src/cli/parser.ts`**

Create `src/cli/parser.ts` with this exact content:

```ts
import {
  argument,
  command,
  constant,
  object,
  option,
  or,
} from "@optique/core/primitives";
import { choice, string } from "@optique/core/valueparser";
import { optional } from "@optique/core/modifiers";
import type { FormatName } from "./format.ts";

/** Final shape after dispatch normalization. */
export type CliResult =
  | { action: "solve"; path: string; format: FormatName; quiet: boolean }
  | { action: "validate"; path: string; quiet: boolean };

/** Raw shape produced by the parser combinator. */
export type ParserOutput = {
  action: "solve" | "validate";
  path: string;
  format?: FormatName;
  quiet?: boolean;
  dryRun?: boolean;
};

const sharedQuiet = option("--quiet");
const sharedFormat = option(
  "--format",
  choice(["table", "dot", "mermaid", "json"] as const, { default: "table" }),
);

const solveCommand = command(
  "solve",
  object({
    action: constant("solve"),
    path: argument(string({ metavar: "PATH" })),
    format: optional(sharedFormat),
    quiet: optional(sharedQuiet, { default: false }),
    dryRun: optional(option("--dry-run"), { default: false }),
  }),
);

const validateCommand = command(
  "validate",
  object({
    action: constant("validate"),
    path: argument(string({ metavar: "PATH" })),
    quiet: optional(sharedQuiet, { default: false }),
    dryRun: optional(option("--dry-run"), { default: false }),
  }),
);

const bareInvocation = object({
  action: constant("solve"),
  path: argument(string({ metavar: "PATH" })),
  format: optional(sharedFormat),
  quiet: optional(sharedQuiet, { default: false }),
  dryRun: optional(option("--dry-run"), { default: false }),
});

export const parser = or(solveCommand, validateCommand, bareInvocation);
```

Notes:
- `dryRun` is on every shape (with default `false`) so `ParserOutput.dryRun` is always a defined boolean.
- The bare invocation's `action` is always `"solve"` at parse time; the dispatcher flips it to `"validate"` when `dryRun === true`.

- [ ] **Step 2: Run the parser tests**

Run: `deno test --allow-all src/cli/parser.test.ts`

Expected: PASS. All 10 tests pass.

If any fail, read the actual vs expected output. Common first-time issues:
- "expected success, got error" — usually means the parser combinator didn't match; check `metavar: "PATH"` and that `choice(...)` accepts the format strings.
- Type errors — check the imports list (matches the exact module specifiers from `repos/optique/packages/core/deno.json`).

- [ ] **Step 3: Commit**

```bash
git add src/cli/parser.ts
git commit -m "feat(cli): Optique parser combinator with solve/validate subcommands"
```

---

## Task 4: Implement the dispatcher

**Files:**
- Create: `src/cli/dispatch.ts`

The dispatcher owns the `normalize()` step and the `switch` that routes to `runValidate` / `runSolve`. No new tests — the parser tests in Task 3 cover the normalization logic indirectly through the subprocess tests in Task 8, and the dispatcher's typed `switch` is structurally correct by virtue of the discriminated union.

- [ ] **Step 1: Write `src/cli/dispatch.ts`**

Create `src/cli/dispatch.ts` with this exact content:

```ts
import { runSolve } from "./solve.ts";
import { runValidate } from "./validate.ts";
import { readInput } from "./input.ts";
import type { CliResult, ParserOutput } from "./parser.ts";

/** Collapse a parser output to the dispatcher's typed input. */
export function normalize(p: ParserOutput): CliResult {
  if (p.action === "validate" || p.dryRun === true) {
    return { action: "validate", path: p.path, quiet: p.quiet ?? false };
  }
  return {
    action: "solve",
    path: p.path,
    format: p.format ?? "table",
    quiet: p.quiet ?? false,
  };
}

/** Route a parsed CLI invocation to its action handler. */
export async function dispatch(parsed: ParserOutput): Promise<number> {
  const result = normalize(parsed);
  const source = await readInput(result.path);
  switch (result.action) {
    case "validate":
      return runValidate(source, { quiet: result.quiet });
    case "solve":
      return runSolve(source, {
        quiet: result.quiet,
        format: result.format,
      });
  }
}
```

- [ ] **Step 2: Type-check**

Run: `deno task check:cli-deno`

Expected: PASS. The discriminated union ensures the `switch` is exhaustive without a fallthrough.

- [ ] **Step 3: Commit**

```bash
git add src/cli/dispatch.ts
git commit -m "feat(cli): dispatcher normalizing parser output to CliResult"
```

---

## Task 5: Create the help footer

**Files:**
- Create: `src/cli/help-footer.ts`

The footer is the rich semantics block (output formats, exit codes, solver-tag note) that Optique's auto-generated `--help` does not produce. It is plain text and a constant export.

- [ ] **Step 1: Write `src/cli/help-footer.ts`**

Create `src/cli/help-footer.ts` with this exact content:

```ts
export const VERSION = "0.2.0";

export const HELP_FOOTER = `

Output formats (solve only):
  table       Markdown-flavored; per-solver headings (## solver/<tag>,
              ### IN / ### OUT / ### UNDETERMINED). Empty groups omitted.
              Default.
  dot         Graphviz DOT with nested subgraphs per solver.
  mermaid     Mermaid markdown with nested subgraphs per solver.
  json        EDN-shaped JSON with per-component labels and per-statement
              labels threaded through. Machine-parseable.

Exit codes:
  0   Success
  1   Parse / validation / solve error (diagnostics on stderr)
  2   Usage error (unknown flag, missing path, unknown subcommand)

Solver semantics are read from the document's per-component solver tags
(#casualtheorics.argdown2.solver/grounded, .../bipolar, .../evidential,
etc.). There is no --semantics flag.
`;
```

- [ ] **Step 2: Commit**

```bash
git add src/cli/help-footer.ts
git commit -m "feat(cli): footer text appended to Optique-generated --help"
```

---

## Task 6: Rewrite `src/cli.ts` to use `@optique/run`

**Files:**
- Modify: `src/cli.ts` (full rewrite)

The new `src/cli.ts` is a 10-line entry: import `parser` and `dispatch`, call `run()` from `@optique/run` with the parser and a `program` config (name + version). Optique's `run()` handles argv reading, `--help`/`--version`, and exit-code-2 for usage errors.

- [ ] **Step 1: Rewrite `src/cli.ts`**

Replace the entire contents of `src/cli.ts` with:

```ts
#!/usr/bin/env -S deno run -A
import { run } from "@optique/run";
import { parser } from "./cli/parser.ts";
import { dispatch } from "./cli/dispatch.ts";
import { HELP_FOOTER, VERSION } from "./cli/help-footer.ts";

const program = {
  name: "argdown-2",
  version: VERSION,
};

await run(parser, {
  program,
  run: dispatch,
  help: { footer: HELP_FOOTER },
});
```

- [ ] **Step 2: Verify the binary runs**

Run: `deno task cli --help`

Expected: Optique's auto-generated help block (with subcommands, flags, positional argument) followed by the footer text from `help-footer.ts`. Exit 0.

- [ ] **Step 3: Verify a solve invocation works**

Run: `echo "#casualtheorics.argdown2/document {:id :quick :root #casualtheorics.argdown2.solver/grounded {:id :r :interface {:aggregate #casualtheorics.argdown2.aggregate/identity {:inputs [{:ref :a}]}} :elements [#casualtheorics.argdown2.argdown/statement {:id :a :text \"A\"}]}}" | deno task cli -`

Expected: Markdown table output with `#a` IN. Exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts
git commit -m "refactor(cli): wire Optique run() as the CLI entry point"
```

---

## Task 7: Snapshot the help text

**Files:**
- Modify: `src/cli/parser.test.ts` (append snapshot test)
- Create: `src/cli/__snapshots__/help.txt` (initial capture)

Render Optique's usage via `getUsage()` plus the footer, then assert against a frozen snapshot file. Future edits that change the parser shape or footer will fail this test and force a review.

- [ ] **Step 1: Inspect `getUsage` API**

Run: `deno eval "import { getUsage } from '@optique/core/usage'; console.log(typeof getUsage)"`

Expected: `function`. If it returns `undefined`, search `repos/optique/packages/core/src/usage.ts` for the actual export name and adjust the import accordingly (e.g., `getUsageString`, `formatUsage`).

- [ ] **Step 2: Append the snapshot test**

Append the following test to the bottom of `src/cli/parser.test.ts`:

```ts
import { getUsage } from "@optique/core/usage";

Deno.test("help text snapshot", async () => {
  const { parser } = await import("./parser.ts");
  const { HELP_FOOTER } = await import("./help-footer.ts");
  const usage = getUsage(parser, {
    program: { name: "argdown-2", version: "0.2.0" },
  });
  const text = (typeof usage === "string" ? usage : usage.text) + HELP_FOOTER;
  const snapshotPath = new URL("./__snapshots__/help.txt", import.meta.url);
  const expected = await Deno.readTextFile(snapshotPath);
  assertEquals(text, expected);
});
```

Note: if `getUsage` returns an object instead of a string, the `typeof usage === "string"` branch handles both shapes (string OR object with `.text`).

- [ ] **Step 3: Capture the initial snapshot**

Run:

```bash
deno eval "import { getUsage } from '@optique/core/usage'; import { parser } from './src/cli/parser.ts'; import { HELP_FOOTER } from './src/cli/help-footer.ts'; const u = getUsage(parser, { program: { name: 'argdown-2', version: '0.2.0' } }); const t = (typeof u === 'string' ? u : u.text) + HELP_FOOTER; await Deno.mkdir('src/cli/__snapshots__', { recursive: true }); await Deno.writeTextFile('src/cli/__snapshots__/help.txt', t); console.log('wrote', t.length, 'bytes');"
```

Expected: prints `wrote <N> bytes`. The `src/cli/__snapshots__/help.txt` file is created.

- [ ] **Step 4: Run the snapshot test**

Run: `deno test --allow-all src/cli/parser.test.ts`

Expected: PASS. The snapshot matches the rendered output.

- [ ] **Step 5: Commit**

```bash
git add src/cli/parser.test.ts src/cli/__snapshots__/help.txt
git commit -m "test(cli): snapshot --help output for parser-shape regression"
```

---

## Task 8: Add the three subprocess exit-code tests

**Files:**
- Modify: `src/cli/parser.test.ts` (append subprocess tests)

These three tests defend the exit-code contract: `0` for `--help`, `2` for usage errors, `1` for runtime errors. They shell out to the actual binary via `Deno.Command`.

- [ ] **Step 1: Append the subprocess tests**

Append the following block to `src/cli/parser.test.ts`:

```ts
Deno.test("exit code: --help exits 0", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "--help"],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  assertEquals(out.code, 0);
  const stdout = new TextDecoder().decode(out.stdout);
  if (!stdout.includes("Usage:")) {
    throw new Error(`expected 'Usage:' in stdout, got: ${stdout.slice(0, 200)}`);
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
  if (!stderr.toLowerCase().includes("not found")) {
    throw new Error(`expected 'not found' in stderr, got: ${stderr.slice(0, 200)}`);
  }
});
```

- [ ] **Step 2: Run only the subprocess tests**

Run: `deno test --allow-all src/cli/parser.test.ts -- --filter "exit code"`

Expected: 3 tests PASS, others unaffected.

- [ ] **Step 3: Commit**

```bash
git add src/cli/parser.test.ts
git commit -m "test(cli): subprocess exit-code contract for help/usage/runtime errors"
```

---

## Task 9: Delete the old files

**Files:**
- Delete: `src/cli/help.ts`
- Delete: `src/cli/cli.test.ts`

These are no longer referenced: `src/cli.ts` no longer imports from `help.ts`, and the parser combinator tests in `src/cli/parser.test.ts` supersede the hand-rolled `parseArgs` tests.

- [ ] **Step 1: Confirm no references remain**

Run: `rg "from \"./help\.js\"|from \"./cli/help\"|from \"./cli\.js\"" src/`

Expected: no matches. (Help.ts is no longer imported; cli.test.ts is not imported by anything.)

- [ ] **Step 2: Delete the files**

Run:

```bash
git rm src/cli/help.ts src/cli/cli.test.ts
```

Expected: two files deleted from the index.

- [ ] **Step 3: Run all CLI tests**

Run: `deno task test 2>&1 | head -50`

Expected: all tests pass (parser unit tests, snapshot, subprocess, formatter tests, action tests).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(cli): delete hand-rolled help.ts and parseArgs test"
```

---

## Task 10: Update `README.md` examples

**Files:**
- Modify: `README.md` (Examples section)

The README's existing Examples section lists the bare invocation. Add the two subcommand forms alongside it. Locate the existing examples (search for `argdown-2 foo.edn`) and add the new forms.

- [ ] **Step 1: Locate the examples block**

Run: `rg -n "argdown-2 foo\.edn" README.md`

Expected: prints the line number(s). Note the line number for Step 2.

- [ ] **Step 2: Add the subcommand examples**

Find the line that begins with `argdown-2 --format=dot foo.edn > foo.dot` (or whatever the existing examples show) and add two new lines immediately below it:

```md
argdown-2 validate foo.edn
argdown-2 solve --format=json foo.edn
```

Keep the blank line spacing consistent with the existing examples block.

- [ ] **Step 3: Verify formatting**

Run: `deno task fmt:check`

Expected: exits 0 (README.md is markdown, fmt-check will skip it, which is fine).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(cli): document solve/validate subcommands in README examples"
```

---

## Task 11: Update `CHANGELOG.md`

**Files:**
- Modify: `CHANGELOG.md` (add unreleased entry)

- [ ] **Step 1: Locate the unreleased section**

Run: `rg -n "^## " CHANGELOG.md | head -5`

Expected: first match is the unreleased section header (typically `## Unreleased` or `## [Unreleased]`).

- [ ] **Step 2: Add the entry**

Add a new bullet point at the top of the unreleased section's bullet list:

```md
- **CLI:** Argument parser rewritten on `@optique/core` + `@optique/run`. New `solve` and `validate` subcommands; the bare invocation (`argdown-2 foo.edn`) and `--dry-run` flag remain as back-compat synonyms. Exit codes (0/1/2) and output formats (table/dot/mermaid/json) are preserved.
```

If the unreleased section uses a different style (e.g., Keep-a-Changelog with sub-bullet groups), match the existing style.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(cli): CHANGELOG entry for Optique CLI rewrite"
```

---

## Task 12: Final quality gate

**Files:** none (verifies Tasks 1–11)

- [ ] **Step 1: Format**

Run: `deno task fmt`

Expected: no changes (everything should already be formatted from incremental edits).

- [ ] **Step 2: Lint**

Run: `deno task lint`

Expected: exits 0. If any warnings appear, fix them inline (likely in `src/cli/parser.ts` or `src/cli/dispatch.ts`).

- [ ] **Step 3: Type-check**

Run: `deno task check:cli-deno`

Expected: exits 0.

- [ ] **Step 4: Full test run**

Run: `deno task test`

Expected: all tests pass — parser-shape, snapshot, subprocess exit codes, formatters, action handlers, integration tests.

- [ ] **Step 5: Manual smoke test of the new subcommands**

Run:

```bash
echo "#casualtheorics.argdown2/document {:id :smoke :root #casualtheorics.argdown2.solver/grounded {:id :r :interface {:aggregate #casualtheorics.argdown2.aggregate/identity {:inputs [{:ref :a}]}} :elements [#casualtheorics.argdown2.argdown/statement {:id :a :text \"A\"}]}}" > /tmp/smoke.edn
deno task cli /tmp/smoke.edn
deno task cli validate /tmp/smoke.edn && echo "validate OK"
deno task cli solve --format=json /tmp/smoke.edn
rm /tmp/smoke.edn
```

Expected:
- First command prints a Markdown table with `#a IN`.
- `validate` exits 0 silently (it succeeds).
- `solve --format=json` prints JSON containing `"labels"`.

- [ ] **Step 6: Confirm clean tree**

Run: `git status`

Expected: clean working tree.

---

## Self-Review Checklist

After all 12 tasks, the engineer should verify:

- [ ] Every spec requirement is implemented:
  - Subcommands `solve` + `validate` ✓ (Task 3)
  - Bare-invocation synonym ✓ (Task 3, normalized in Task 4)
  - `--dry-run` synonym for `validate` ✓ (Task 3 + Task 4)
  - Exit codes 0/1/2 preserved ✓ (Task 6 + Task 8)
  - JSR-published Optique ✓ (Task 1)
  - Auto-gen help + footer ✓ (Tasks 5, 6, 7)
  - Stdin via `-` ✓ (Task 6 step 3)
  - Output formats unchanged ✓ (no formatter files touched)
  - README + CHANGELOG updated ✓ (Tasks 10, 11)
- [ ] No file under `src/cli/{validate,solve,format,load,input,output}.ts` was modified.
- [ ] `src/cli/help.ts` and `src/cli/cli.test.ts` are deleted from the tree.
- [ ] All commits are clean and individually revertable.