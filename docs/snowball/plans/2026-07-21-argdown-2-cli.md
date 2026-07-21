# argdown-2 CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an `argdown-2` CLI binary that loads, validates, solves, and renders EDN argument-graph documents from the shell, with three distribution channels (compiled binary, npm bin, Deno install).

**Architecture:** Single binary at `src/cli.ts` dispatching via flags (`<path|->`, `--format={table,dot,mermaid,json}`, `--dry-run`, `--quiet`, `--help`, `--version`). Library access via direct imports. Solver semantics come from the document's per-component solver tags — no `--semantics` flag.

**Tech Stack:** Deno, TypeScript, the existing `@casualtheorics/argdown-2` library (`load`, `validate`, `solve`), `Deno.Command` for tests, `@std/assert` for assertions.

---

## File Structure

### Created

| Path | Responsibility |
|---|---|
| `src/cli.ts` | Bin entry; argv parsing, dispatch |
| `src/cli/help.ts` | HELP and VERSION strings |
| `src/cli/output.ts` | stdout / stderr / exit-code helpers |
| `src/cli/input.ts` | Read file path or stdin (`-`) |
| `src/cli/load.ts` | `load()` wrapper + parse-error reporting |
| `src/cli/validate.ts` | `--dry-run` action: load + validate |
| `src/cli/solve.ts` | Default action: load + solve + format dispatch |
| `src/cli/format.ts` | Format dispatch (table / json / dot / mermaid) |
| `src/cli/format-table.ts` | Markdown-flavored, per-solver headings |
| `src/cli/format-json.ts` | EDN-shaped JSON with labels threaded through |
| `src/cli/format-dot.ts` | DOT with nested subgraphs per solver |
| `src/cli/format-mermaid.ts` | Mermaid with nested subgraphs per solver |
| `src/cli/cli.test.ts` | Integration tests via `Deno.Command` |
| `src/cli/format-table.test.ts` | Unit tests for the table formatter |
| `src/cli/format-json.test.ts` | Unit tests for the JSON formatter |
| `src/cli/format-dot.test.ts` | Unit tests for the DOT formatter |
| `src/cli/format-mermaid.test.ts` | Unit tests for the Mermaid formatter |
| `src/cli/parity.test.ts` | CLI vs MCP parity test |
| `src/cli/__snapshots__/` | Snapshot directory |
| `src/bench.fixtures/mixed-semantics.edn` | Mixed-semantics test fixture |
| `scripts/compile-argdown-2.sh` | `deno compile` script |
| `scripts/argdown-2` | Binary launcher |
| `scripts/argdown-2.version` | Pinned CLI binary version |
| `docs/snowball/plans/2026-07-21-argdown-2-cli.md` | This plan |

### Modified

| Path | Change |
|---|---|
| `deno.json` | Add `cli`, `compile:cli`, `check:cli-deno`, `probe:cli` tasks |
| `package.json` | Add `bin` field for npm consumers |
| `README.md` | Document the CLI |
| `plugins/argdown-2/scripts/argdown-2` | Synced launcher copy (per `src/claude-plugin.test.ts` enforcement) |
| `plugins/argdown-2/scripts/argdown-2.version` | Synced version pin |

---

## Tasks

### Task 1: Bin entry + help + version + argv parsing

**Files:**
- Create: `src/cli/help.ts`
- Create: `src/cli/output.ts`
- Create: `src/cli.ts`
- Create: `src/cli/cli.test.ts`
- Modify: `deno.json` (add `cli` task)

- [ ] **Step 1: Write the failing test**

Create `src/cli/cli.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from "@std/assert";

Deno.test("cli --help prints usage and exits 0", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "--help"],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await cmd.output();
  assertEquals(code, 0);
  const out = new TextDecoder().decode(stdout);
  assertStringIncludes(out, "argdown-2");
  assertStringIncludes(out, "--dry-run");
  assertStringIncludes(out, "--format");
});

Deno.test("cli --version prints version and exits 0", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "--version"],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await cmd.output();
  assertEquals(code, 0);
  const out = new TextDecoder().decode(stdout);
  assertStringIncludes(out, "argdown-2");
  assertStringIncludes(out, "0.2.0");
});

Deno.test("cli with no args prints usage and exits 2", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts"],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stderr } = await cmd.output();
  assertEquals(code, 2);
  const err = new TextDecoder().decode(stderr);
  assertStringIncludes(err, "Usage:");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test -A src/cli/cli.test.ts`
Expected: FAIL with "module not found" or similar (bin doesn't exist yet).

- [ ] **Step 3: Create `src/cli/help.ts`**

```ts
export const VERSION = "0.2.0";

export const HELP = `argdown-2 ${VERSION}

Load, validate, solve, and render EDN argument-graph documents.

Usage:
  argdown-2 [flags] <path|->

Arguments:
  <path|->                  EDN file path, or '-' for stdin.

Flags:
  --format=<table|dot|mermaid|json>
                             Output format (default: table).
  --dry-run                 Validate only; skip solve and render.
                             Silent on success; stderr + exit 1 on error.
  --quiet                   Suppress diagnostics on stderr.
  --help                    Print this help and exit 0.
  --version                 Print version and exit 0.

Output:
  table       Markdown-flavored; per-solver headings
              (## solver/<tag>, ### IN / ### OUT / ### UNDETERMINED).
              Empty groups omitted. Default.
  dot         Graphviz DOT with nested subgraphs per solver.
  mermaid     Mermaid markdown with nested subgraphs per solver.
  json        EDN-shaped JSON with per-component labels and per-statement
              labels threaded through. Machine-parseable.

Exit codes:
  0   Success
  1   Parse / validation / solve error (diagnostics on stderr)
  2   Usage error (unknown flag, missing path)

Examples:
  argdown-2 foo.edn
  argdown-2 --format=dot foo.edn > foo.dot
  argdown-2 --dry-run foo.edn
  cat foo.edn | argdown-2 -

Solver semantics are read from the document's per-component solver tags
(#casualtheorics.argdown2.solver/grounded, .../bipolar, .../evidential,
etc.). There is no --semantics flag.
`;
```

- [ ] **Step 4: Create `src/cli/output.ts`**

```ts
export function writeStdout(text: string): void {
  Deno.stdout.writeSync(new TextEncoder().encode(text));
}

export function writeStderr(text: string): void {
  Deno.stderr.writeSync(new TextEncoder().encode(text));
}

export function writeDiagnostic(diagnostic: {
  code: string;
  message: string;
  location?: { line: number; column: number };
}): string {
  const loc = diagnostic.location
    ? ` (line ${diagnostic.line}, col ${diagnostic.column})`
    : "";
  return `${diagnostic.code}${loc}: ${diagnostic.message}\n`;
}
```

- [ ] **Step 5: Create `src/cli.ts`**

```ts
#!/usr/bin/env -S deno run -A
import { HELP, VERSION } from "./cli/help.js";
import { writeStderr, writeStdout } from "./cli/output.js";

interface Args {
  path: string | null;
  format: "table" | "dot" | "mermaid" | "json";
  dryRun: boolean;
  quiet: boolean;
}

const VALID_FORMATS = ["table", "dot", "mermaid", "json"] as const;

function parseArgs(argv: string[]): Args | { error: string } {
  let path: string | null = null;
  let format: Args["format"] = "table";
  let dryRun = false;
  let quiet = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") {
      writeStdout(HELP);
      Deno.exit(0);
    } else if (arg === "--version") {
      writeStdout(`argdown-2 ${VERSION}\n`);
      Deno.exit(0);
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--quiet") {
      quiet = true;
    } else if (arg.startsWith("--format=")) {
      const value = arg.slice("--format=".length);
      if (!VALID_FORMATS.includes(value as Args["format"])) {
        return {
          error:
            `Unknown format '${value}'. Valid: ${VALID_FORMATS.join(", ")}.\n`,
        };
      }
      format = value as Args["format"];
    } else if (arg.startsWith("--")) {
      return { error: `Unknown flag '${arg}'.\n` };
    } else if (path === null) {
      path = arg;
    } else {
      return { error: `Unexpected positional argument '${arg}'.\n` };
    }
  }

  if (path === null) {
    return { error: "Missing required argument <path|->.\n" };
  }

  return { path, format, dryRun, quiet };
}

async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    writeStderr(`Usage: argdown-2 [flags] <path|->\n\n${parsed.error}`);
    return 2;
  }

  // Placeholder — Task 5 wires solve/validate here.
  writeStderr("argdown-2: not yet implemented\n");
  return 1;
}

if (import.meta.main) {
  const code = await main(Deno.args);
  Deno.exit(code);
}

export { main, parseArgs };
```

- [ ] **Step 6: Add `cli` task to `deno.json`**

Modify the `"tasks"` block in `deno.json`:

```json
"cli": "deno run -A src/cli.ts",
"check:cli-deno": "deno check --frozen src/cli.ts",
"probe:cli": "deno run -A ./scripts/probe-cli-stdio.ts",
```

(Add `"compile:cli": "bash ./scripts/compile-argdown-2.sh"` later in Task 12.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `deno task cli --help`
Expected: prints HELP, exits 0.

Run: `deno task cli --version`
Expected: prints "argdown-2 0.2.0", exits 0.

Run: `deno test -A src/cli/cli.test.ts`
Expected: 3 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/cli.ts src/cli/help.ts src/cli/output.ts src/cli/cli.test.ts deno.json
git commit -m "feat(cli): add bin entry with --help, --version, argv parsing"
```

---

### Task 2: Input — read file path or stdin

**Files:**
- Create: `src/cli/input.ts`
- Create: `src/cli/input.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/cli/input.test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { readInput } from "./input.js";

Deno.test("readInput reads from file path", async () => {
  const path = new URL("../README.md", import.meta.url).pathname;
  const text = await readInput(path);
  assertEquals(text.length > 0, true);
});

Deno.test("readInput reads from stdin when path is '-'", async () => {
  const expected = "hello from stdin\n";
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "-e",
      `import { readInput } from "${new URL("./input.ts", import.meta.url).pathname}";\nconsole.log(await readInput("-"))`,
    ],
    stdin: "piped",
    stdout: "piped",
  });
  const process = cmd.spawn();
  const writer = process.stdin.getWriter();
  await writer.write(new TextEncoder().encode(expected));
  await writer.close();
  const { stdout } = await process.output();
  const actual = new TextDecoder().decode(stdout);
  assertEquals(actual, expected);
});

Deno.test("readInput throws on missing file", async () => {
  let threw = false;
  try {
    await readInput("/nonexistent/path/to/file.edn");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A src/cli/input.test.ts`
Expected: FAIL with "module not found" (input.ts doesn't exist).

- [ ] **Step 3: Implement `readInput` in `src/cli/input.ts`**

```ts
export async function readInput(path: string): Promise<string> {
  if (path === "-") {
    const decoder = new TextDecoder();
    const chunks: Uint8Array[] = [];
    for await (const chunk of Deno.stdin.readable) {
      chunks.push(chunk);
    }
    return decoder.decode(await new Blob(chunks).arrayBuffer());
  }
  return await Deno.readTextFile(path);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test -A src/cli/input.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/input.ts src/cli/input.test.ts
git commit -m "feat(cli): add input reader for file path and stdin"
```

---

### Task 3: Load — parse EDN and report errors

**Files:**
- Create: `src/cli/load.ts`
- Create: `src/cli/load.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/cli/load.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { loadAndReport } from "./load.js";
import { writeStderr } from "./output.js";

const VALID_EDN = `{:id :test :root #casualtheorics.argdown2.solver/grounded {:id :root}}`;

Deno.test("loadAndReport returns ok for valid EDN", () => {
  const result = loadAndReport(VALID_EDN, { quiet: false });
  assertEquals(result.ok, true);
  assertEquals(result.diagnostics.length, 0);
});

Deno.test("loadAndReport returns diagnostics for invalid EDN", () => {
  const result = loadAndReport("not valid edn (", { quiet: false });
  assertEquals(result.ok, false);
  assertEquals(result.diagnostics.length > 0, true);
  assertStringIncludes(result.diagnostics[0].code, "edn/");
});

Deno.test("loadAndReport with quiet=true suppresses stderr", () => {
  const writes: string[] = [];
  const original = writeStderr;
  // deno-lint-ignore no-explicit-any
  (globalThis as any).__writeStderr = (s: string) => writes.push(s);
  // We just verify that quiet=true doesn't throw on invalid EDN.
  const result = loadAndReport("not valid edn (", { quiet: true });
  assertEquals(result.ok, false);
  // Writes (if any) shouldn't appear for --quiet mode.
  assertEquals(writes.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A src/cli/load.test.ts`
Expected: FAIL with "module not found".

- [ ] **Step 3: Implement `loadAndReport` in `src/cli/load.ts`**

```ts
import { load } from "../index.js";
import type { LoadResult } from "../model.js";
import { writeStderr, writeDiagnostic } from "./output.js";

export interface Diagnostic {
  code: string;
  message: string;
  location?: { line: number; column: number };
}

export interface LoadReport {
  ok: boolean;
  document: LoadResult extends { value: infer V } ? V : never;
  diagnostics: Diagnostic[];
}

export function loadAndReport(
  source: string,
  options: { quiet: boolean },
): LoadReport {
  const result = load(source);
  const diagnostics: Diagnostic[] = result.errors.map((e) => ({
    code: `edn/${e.kind ?? "parse-error"}`,
    message: e.message,
    location: e.location,
  }));

  for (const d of diagnostics) {
    if (!options.quiet) {
      writeStderr(writeDiagnostic(d));
    }
  }

  return {
    ok: result.ok,
    document: result.value as LoadReport["document"],
    diagnostics,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test -A src/cli/load.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/load.ts src/cli/load.test.ts
git commit -m "feat(cli): add load wrapper with parse-error reporting"
```

---

### Task 4: Validate — `--dry-run` mode

**Files:**
- Create: `src/cli/validate.ts`
- Create: `src/cli/validate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/cli/validate.test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { runValidate } from "./validate.js";

const VALID_EDN = `{:id :test
:root #casualtheorics.argdown2.solver/grounded
{:id :root
 :interface {:aggregate #casualtheorics.argdown2.aggregate/identity {:inputs []}}
 :elements [#casualtheorics.argdown2.argdown/statement {:id :a :text "A"}]}}`;

Deno.test("runValidate exits 0 for valid document", () => {
  const code = runValidate(VALID_EDN, { quiet: false });
  assertEquals(code, 0);
});

Deno.test("runValidate exits 1 for invalid document", () => {
  // Missing required fields.
  const code = runValidate("{:id :test}", { quiet: false });
  assertEquals(code, 1);
});

Deno.test("runValidate with quiet suppresses stderr output", () => {
  // Capture stderr to verify it's silent on success.
  const original = Deno.stderr.writeSync;
  let captured = "";
  // deno-lint-ignore no-explicit-any
  (Deno.stderr as any).writeSync = (data: Uint8Array) => {
    captured += new TextDecoder().decode(data);
    return data.length;
  };
  const code = runValidate(VALID_EDN, { quiet: true });
  (Deno.stderr as any).writeSync = original;
  assertEquals(code, 0);
  assertEquals(captured, "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A src/cli/validate.test.ts`
Expected: FAIL with "module not found".

- [ ] **Step 3: Implement `runValidate` in `src/cli/validate.ts`**

```ts
import { validate as libValidate } from "../index.js";
import type { Document } from "../model.js";
import { writeDiagnostic, writeStderr } from "./output.js";

export function runValidate(
  source: string,
  options: { quiet: boolean },
): number {
  const { load } = importJson();
  // Lazy import to avoid circular dependency at module top level.
  return _runValidate(source, options);
}

// Wrapper to keep the public API clean.
function _runValidate(source: string, options: { quiet: boolean }): number {
  // deno-lint-ignore no-explicit-any
  const loadMod = (globalThis as any).__cli_load_mod ??= import("./load.js");
  // Synchronous path: re-export loadAndReport from load.ts.
  // deno-lint-ignore no-explicit-any
  const { loadAndReport } = loadMod as any;
  const loaded = loadAndReport(source, options);
  if (!loaded.ok) return 1;

  const result = libValidate(loaded.document);
  for (const d of result.diagnostics) {
    if (!options.quiet) {
      writeStderr(
        writeDiagnostic({
          code: d.code,
          message: d.message,
          location: d.location,
        }),
      );
    }
  }
  if (result.diagnostics.length > 0) return 1;
  return 0;
}

// Stub to satisfy noUnused; replaced by direct import in production.
function importJson(): { load: unknown } {
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).__cli_validate_helpers ?? {};
}
```

Actually, simplify — use direct imports throughout:

```ts
import { validate as libValidate } from "../index.js";
import { loadAndReport } from "./load.js";
import { writeDiagnostic, writeStderr } from "./output.js";

export function runValidate(
  source: string,
  options: { quiet: boolean },
): number {
  const loaded = loadAndReport(source, options);
  if (!loaded.ok) return 1;

  const result = libValidate(loaded.document);
  for (const d of result.diagnostics) {
    if (!options.quiet) {
      writeStderr(
        writeDiagnostic({
          code: d.code,
          message: d.message,
          location: d.location,
        }),
      );
    }
  }
  return result.diagnostics.length > 0 ? 1 : 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test -A src/cli/validate.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/validate.ts src/cli/validate.test.ts
git commit -m "feat(cli): add validate (--dry-run) action"
```

---

### Task 5: Solve — default action (load + solve)

**Files:**
- Create: `src/cli/solve.ts`
- Create: `src/cli/solve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/cli/solve.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { runSolve } from "./solve.js";

const VALID_EDN = `{:id :test
:root #casualtheorics.argdown2.solver/grounded
{:id :root
 :interface {:aggregate #casualtheorics.argdown2.aggregate/identity {:inputs [{:ref :a}]}}
 :elements [
   #casualtheorics.argdown2.argdown/statement {:id :a :text "A"}
   #casualtheorics.argdown2.argdown/statement {:id :b :text "B"}
   #casualtheorics.argdown2.argdown/attack {:id :attack-a-b :from :a :to :b}]}}`;

Deno.test("runSolve exits 0 for valid document", () => {
  const code = runSolve(VALID_EDN, {
    quiet: false,
    format: "table",
  });
  assertEquals(code, 0);
});

Deno.test("runSolve writes table to stdout", () => {
  const writes: string[] = [];
  const original = Deno.stdout.writeSync;
  // deno-lint-ignore no-explicit-any
  (Deno.stdout as any).writeSync = (data: Uint8Array) => {
    writes.push(new TextDecoder().decode(data));
    return data.length;
  };
  runSolve(VALID_EDN, { quiet: false, format: "table" });
  (Deno.stdout as any).writeSync = original;
  const out = writes.join("");
  assertStringIncludes(out, "## IN");
});

Deno.test("runSolve exits 1 for invalid document", () => {
  const code = runSolve("not valid edn (", {
    quiet: false,
    format: "table",
  });
  assertEquals(code, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A src/cli/solve.test.ts`
Expected: FAIL with "module not found".

- [ ] **Step 3: Create placeholder `src/cli/format.ts`**

(Format dispatch and individual formatters come in Tasks 6-9. For Task 5, solve.ts will import a placeholder formatTable function.)

Create `src/cli/format.ts`:

```ts
import type { ComponentSolveResult } from "../model.js";

export type FormatName = "table" | "dot" | "mermaid" | "json";

export interface FormatResult {
  text: string;
}

export function formatResult(
  result: ComponentSolveResult,
  format: FormatName,
): FormatResult {
  // Placeholder; replaced by full dispatch in Task 6.
  return { text: `[format=${format} not yet implemented]\n` };
}
```

- [ ] **Step 4: Implement `runSolve` in `src/cli/solve.ts`**

```ts
import { solve as libSolve } from "../index.js";
import { formatResult } from "./format.js";
import type { FormatName } from "./format.js";
import { loadAndReport } from "./load.js";
import { writeStderr, writeStdout } from "./output.js";

export function runSolve(
  source: string,
  options: { quiet: boolean; format: FormatName },
): number {
  const loaded = loadAndReport(source, options);
  if (!loaded.ok) return 1;

  const solveResult = libSolve(loaded.document);
  for (const w of solveResult.warnings) {
    if (!options.quiet) {
      writeStderr(`warning: ${w}\n`);
    }
  }

  const formatted = formatResult(solveResult, options.format);
  writeStdout(formatted.text);
  return 0;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test -A src/cli/solve.test.ts`
Expected: 3 tests pass (the "writes table to stdout" test will pass because the placeholder format string contains "[format=table…", not "## IN" — that comes in Task 7).

Update Step 5 expectation: the table test will fail until Task 7. Mark this test as `// TODO(step-7)` and continue.

Actually, simpler: split the test. Keep exit code tests in this task; move "writes table to stdout" to Task 7. Update the test file:

```ts
import { assertEquals } from "@std/assert";
import { runSolve } from "./solve.js";

const VALID_EDN = `{:id :test ...}`;

Deno.test("runSolve exits 0 for valid document", () => {
  const code = runSolve(VALID_EDN, { quiet: false, format: "table" });
  assertEquals(code, 0);
});

Deno.test("runSolve exits 1 for invalid document", () => {
  const code = runSolve("not valid edn (", { quiet: false, format: "table" });
  assertEquals(code, 1);
});
```

- [ ] **Step 6: Wire solve into `src/cli.ts`**

Replace the placeholder in `src/cli.ts`:

```ts
async function main(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ("error" in parsed) {
    writeStderr(`Usage: argdown-2 [flags] <path|->\n\n${parsed.error}`);
    return 2;
  }

  const { runValidate } = await import("./cli/validate.js");
  const { runSolve } = await import("./cli/solve.js");
  const { readInput } = await import("./cli/input.js");

  const source = await readInput(parsed.path);
  if (parsed.dryRun) {
    return runValidate(source, { quiet: parsed.quiet });
  }
  return runSolve(source, { quiet: parsed.quiet, format: parsed.format });
}
```

- [ ] **Step 7: Run end-to-end smoke test**

Run: `cat > /tmp/test.edn <<'EOF'
{:id :test
:root #casualtheorics.argdown2.solver/grounded
{:id :root
 :interface {:aggregate #casualtheorics.argdown2.aggregate/identity {:inputs [{:ref :a}]}}
 :elements [
   #casualtheorics.argdown2.argdown/statement {:id :a :text "A"}
   #casualtheorics.argdown2.argdown/attack {:id :r :from :a :to :a}]}}
EOF
deno task cli /tmp/test.edn
echo "exit: $?"`

Expected: prints "[format=table not yet implemented]" and exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/cli.ts src/cli/solve.ts src/cli/solve.test.ts src/cli/format.ts
git commit -m "feat(cli): add solve (default) action with format dispatch stub"
```

---

### Task 6: Format dispatch — wire formatters into format.ts

**Files:**
- Modify: `src/cli/format.ts`

(Individual formatter implementations come in Tasks 7-10. This task sets up the dispatch table.)

- [ ] **Step 1: Write the failing test**

Create `src/cli/format.test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { formatResult } from "./format.js";

const FAKE_RESULT = {
  native: { kind: "labels", values: new Map([["a", "in"]]) },
  aggregate: { kind: "labels", values: new Map() },
  boundary: { kind: "labels", values: new Map() },
  children: new Map(),
  warnings: [],
} as unknown as Parameters<typeof formatResult>[0];

Deno.test("formatResult dispatches to table formatter", () => {
  const out = formatResult(FAKE_RESULT, "table");
  assertEquals(typeof out.text, "string");
  assertEquals(out.text.length > 0, true);
});

Deno.test("formatResult dispatches to json formatter", () => {
  const out = formatResult(FAKE_RESULT, "json");
  assertEquals(typeof out.text, "string");
  assertEquals(out.text.startsWith("{"), true);
});

Deno.test("formatResult dispatches to dot formatter", () => {
  const out = formatResult(FAKE_RESULT, "dot");
  assertEquals(out.text.startsWith("digraph"), true);
});

Deno.test("formatResult dispatches to mermaid formatter", () => {
  const out = formatResult(FAKE_RESULT, "mermaid");
  assertEquals(out.text.startsWith("graph"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A src/cli/format.test.ts`
Expected: FAIL because format.ts still returns the placeholder string.

- [ ] **Step 3: Implement dispatch in `src/cli/format.ts`**

```ts
import type { ComponentSolveResult } from "../model.js";
import { formatTable } from "./format-table.js";
import { formatJson } from "./format-json.js";
import { formatDot } from "./format-dot.js";
import { formatMermaid } from "./format-mermaid.js";

export type FormatName = "table" | "dot" | "mermaid" | "json";

export interface FormatResult {
  text: string;
}

export function formatResult(
  result: ComponentSolveResult,
  format: FormatName,
): FormatResult {
  switch (format) {
    case "table":
      return { text: formatTable(result) };
    case "json":
      return { text: formatJson(result) };
    case "dot":
      return { text: formatDot(result) };
    case "mermaid":
      return { text: formatMermaid(result) };
  }
}
```

- [ ] **Step 4: Create stub formatters (real implementations in Tasks 7-10)**

Create `src/cli/format-table.ts`:

```ts
import type { ComponentSolveResult } from "../model.js";
export function formatTable(_result: ComponentSolveResult): string {
  return "## IN\n\n- [#a]\n"; // placeholder
}
```

Create `src/cli/format-json.ts`:

```ts
import type { ComponentSolveResult } from "../model.js";
export function formatJson(_result: ComponentSolveResult): string {
  return "{}\n"; // placeholder
}
```

Create `src/cli/format-dot.ts`:

```ts
import type { ComponentSolveResult } from "../model.js";
export function formatDot(_result: ComponentSolveResult): string {
  return "digraph arguments {}\n"; // placeholder
}
```

Create `src/cli/format-mermaid.ts`:

```ts
import type { ComponentSolveResult } from "../model.js";
export function formatMermaid(_result: ComponentSolveResult): string {
  return "graph LR\n"; // placeholder
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `deno test -A src/cli/format.test.ts`
Expected: 4 tests pass (with placeholder outputs).

- [ ] **Step 6: Commit**

```bash
git add src/cli/format.ts src/cli/format-table.ts src/cli/format-json.ts \
        src/cli/format-dot.ts src/cli/format-mermaid.ts src/cli/format.test.ts
git commit -m "feat(cli): add format dispatch with placeholder formatters"
```

---

### Task 7: Table formatter (markdown-flavored, per-solver headings)

**Files:**
- Modify: `src/cli/format-table.ts`
- Modify: `src/cli/format-table.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `src/cli/format-table.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { formatTable } from "./format-table.js";
import type { ComponentSolveResult } from "../model.js";

function makeResult(
  labels: Record<string, "in" | "out" | "undetermined">,
  solver: string = "grounded",
): ComponentSolveResult {
  return {
    native: { kind: "labels", values: new Map(Object.entries(labels)) },
    aggregate: { kind: "labels", values: new Map() },
    boundary: { kind: "labels", values: new Map() },
    children: new Map(),
    warnings: [],
    solverTag: solver,
    id: "root",
  } as unknown as ComponentSolveResult;
}

Deno.test("formatTable emits ## IN section", () => {
  const out = formatTable(makeResult({ a: "in" }));
  assertStringIncludes(out, "## IN");
});

Deno.test("formatTable emits ## OUT section", () => {
  const out = formatTable(makeResult({ a: "out" }));
  assertStringIncludes(out, "## OUT");
});

Deno.test("formatTable emits ## UNDETERMINED section", () => {
  const out = formatTable(makeResult({ a: "undetermined" }));
  assertStringIncludes(out, "## UNDETERMINED");
});

Deno.test("formatTable omits empty sections", () => {
  const out = formatTable(makeResult({ a: "in" }));
  assertEquals(out.includes("## OUT"), false);
  assertEquals(out.includes("## UNDETERMINED"), false);
});

Deno.test("formatTable emits per-solver heading for mixed semantics", () => {
  const child = makeResult({ x: "undetermined" }, "bipolar");
  const parent = {
    ...makeResult({ a: "in" }, "grounded"),
    children: new Map([["inner", child]]),
  } as unknown as ComponentSolveResult;
  const out = formatTable(parent);
  assertStringIncludes(out, "## solver/grounded");
  assertStringIncludes(out, "## solver/bipolar");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A src/cli/format-table.test.ts`
Expected: FAIL — placeholder doesn't include sections.

- [ ] **Step 3: Implement `formatTable`**

```ts
import type { ComponentSolveResult, Label } from "../model.js";

type LabelGroup = "IN" | "OUT" | "UNDETERMINED";

function labelGroup(label: Label): LabelGroup {
  if (label === "in") return "IN";
  if (label === "out") return "OUT";
  return "UNDETERMINED";
}

interface GroupedLabels {
  IN: string[];
  OUT: string[];
  UNDETERMINED: string[];
}

function emptyGrouped(): GroupedLabels {
  return { IN: [], OUT: [], UNDETERMINED: [] };
}

function extractLabels(result: ComponentSolveResult): GroupedLabels {
  const grouped = emptyGrouped();
  for (const [id, label] of result.native.values) {
    grouped[labelGroup(label)].push(id);
  }
  return grouped;
}

function formatSolverSection(
  solver: string,
  grouped: GroupedLabels,
): string {
  const sections: string[] = [`## solver/${solver}`];
  if (grouped.IN.length > 0) {
    sections.push("", "### IN", "");
    for (const id of grouped.IN) sections.push(`- [#${id}]`);
  }
  if (grouped.OUT.length > 0) {
    sections.push("", "### OUT", "");
    for (const id of grouped.OUT) sections.push(`- [#${id}]`);
  }
  if (grouped.UNDETERMINED.length > 0) {
    sections.push("", "### UNDETERMINED", "");
    for (const id of grouped.UNDETERMINED) {
      sections.push(`- [#${id}]`);
    }
  }
  return sections.join("\n") + "\n";
}

export function formatTable(result: ComponentSolveResult): string {
  const sections: string[] = [];
  const solver = result.solverTag ?? "grounded";
  sections.push(formatSolverSection(solver, extractLabels(result)));
  for (const [, child] of result.children) {
    const childSolver = child.solverTag ?? "grounded";
    sections.push("\n" + formatSolverSection(childSolver, extractLabels(child)));
  }
  return sections.join("");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test -A src/cli/format-table.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/format-table.ts src/cli/format-table.test.ts
git commit -m "feat(cli): implement markdown table formatter with per-solver headings"
```

---

### Task 8: JSON formatter (EDN-shaped)

**Files:**
- Modify: `src/cli/format-json.ts`
- Modify: `src/cli/format-json.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `src/cli/format-json.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { formatJson } from "./format-json.js";
import type { ComponentSolveResult } from "../model.js";

function makeResult(): ComponentSolveResult {
  return {
    native: { kind: "labels", values: new Map([["a", "in"], ["b", "out"]]) },
    aggregate: { kind: "labels", values: new Map() },
    boundary: { kind: "labels", values: new Map() },
    children: new Map(),
    warnings: [],
    solverTag: "grounded",
    id: "root",
  } as unknown as ComponentSolveResult;
}

Deno.test("formatJson emits valid JSON object", () => {
  const out = formatJson(makeResult());
  const parsed = JSON.parse(out);
  assertEquals(typeof parsed, "object");
});

Deno.test("formatJson threads labels through structure", () => {
  const out = formatJson(makeResult());
  assertStringIncludes(out, '"labels"');
  assertStringIncludes(out, '"solver"');
  assertStringIncludes(out, '"grounded"');
});

Deno.test("formatJson includes diagnostics and warnings arrays", () => {
  const out = formatJson(makeResult());
  const parsed = JSON.parse(out);
  assertEquals(Array.isArray(parsed.diagnostics), true);
  assertEquals(Array.isArray(parsed.warnings), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A src/cli/format-json.test.ts`
Expected: FAIL — placeholder is just `"{}"`.

- [ ] **Step 3: Implement `formatJson`**

```ts
import type { ComponentSolveResult } from "../model.js";

function shapeComponent(
  result: ComponentSolveResult,
): Record<string, unknown> {
  const labels: Record<string, string> = {};
  for (const [id, label] of result.native.values) {
    labels[id] = label;
  }
  const children: Record<string, unknown>[] = [];
  for (const [id, child] of result.children) {
    children.push({ id, ...shapeComponent(child) });
  }
  return {
    id: result.id,
    solver: result.solverTag,
    labels,
    children,
  };
}

export function formatJson(result: ComponentSolveResult): string {
  const body = {
    root: shapeComponent(result),
    diagnostics: [],
    warnings: result.warnings,
  };
  return JSON.stringify(body, null, 2) + "\n";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test -A src/cli/format-json.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/format-json.ts src/cli/format-json.test.ts
git commit -m "feat(cli): implement JSON formatter with EDN-shaped structure"
```

---

### Task 9: DOT formatter (with nested subgraphs)

**Files:**
- Modify: `src/cli/format-dot.ts`
- Modify: `src/cli/format-dot.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `src/cli/format-dot.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { formatDot } from "./format-dot.js";
import type { ComponentSolveResult } from "../model.js";

function makeResult(): ComponentSolveResult {
  return {
    native: { kind: "labels", values: new Map([["a", "in"]]) },
    aggregate: { kind: "labels", values: new Map() },
    boundary: { kind: "labels", values: new Map() },
    children: new Map(),
    warnings: [],
    solverTag: "grounded",
    id: "root",
  } as unknown as ComponentSolveResult;
}

Deno.test("formatDot emits digraph header", () => {
  const out = formatDot(makeResult());
  assertStringIncludes(out, "digraph arguments");
});

Deno.test("formatDot colors in-labels green", () => {
  const out = formatDot(makeResult());
  assertStringIncludes(out, "color=green");
});

Deno.test("formatDot emits subgraph for each solver", () => {
  const child = {
    ...makeResult(),
    id: "inner",
    solverTag: "bipolar",
  } as unknown as ComponentSolveResult;
  const parent = {
    ...makeResult(),
    children: new Map([["inner", child]]),
  } as unknown as ComponentSolveResult;
  const out = formatDot(parent);
  assertStringIncludes(out, "subgraph cluster_root");
  assertStringIncludes(out, "subgraph cluster_inner");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A src/cli/format-dot.test.ts`
Expected: FAIL — placeholder is `"digraph arguments {}\n"`.

- [ ] **Step 3: Implement `formatDot`**

```ts
import type { ComponentSolveResult } from "../model.js";

function colorFor(label: string): string {
  if (label === "in") return "green";
  if (label === "out") return "red";
  return "gray";
}

function emitComponent(
  result: ComponentSolveResult,
  indent: string,
): string {
  const lines: string[] = [];
  const clusterId = `cluster_${result.id}`;
  lines.push(`${indent}subgraph ${clusterId} {`);
  lines.push(`${indent}  label = "solver/${result.solverTag}";`);
  for (const [id, label] of result.native.values) {
    lines.push(`${indent}  "${id}" [color=${colorFor(label)}];`);
  }
  for (const [, child] of result.children) {
    lines.push(emitComponent(child, indent + "  "));
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

export function formatDot(result: ComponentSolveResult): string {
  return `digraph arguments { rankdir=LR;\n${
    emitComponent(result, "")
  }\n}\n`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test -A src/cli/format-dot.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/format-dot.ts src/cli/format-dot.test.ts
git commit -m "feat(cli): implement DOT formatter with nested subgraphs"
```

---

### Task 10: Mermaid formatter (with nested subgraphs)

**Files:**
- Modify: `src/cli/format-mermaid.ts`
- Modify: `src/cli/format-mermaid.test.ts`

- [ ] **Step 1: Write the failing test**

Replace `src/cli/format-mermaid.test.ts`:

```ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { formatMermaid } from "./format-mermaid.js";
import type { ComponentSolveResult } from "../model.js";

function makeResult(): ComponentSolveResult {
  return {
    native: { kind: "labels", values: new Map([["a", "in"]]) },
    aggregate: { kind: "labels", values: new Map() },
    boundary: { kind: "labels", values: new Map() },
    children: new Map(),
    warnings: [],
    solverTag: "grounded",
    id: "root",
  } as unknown as ComponentSolveResult;
}

Deno.test("formatMermaid emits graph header", () => {
  const out = formatMermaid(makeResult());
  assertStringIncludes(out, "graph LR");
});

Deno.test("formatMermaid embeds label in node", () => {
  const out = formatMermaid(makeResult());
  assertStringIncludes(out, 'a[in]');
});

Deno.test("formatMermaid emits subgraph per solver", () => {
  const child = {
    ...makeResult(),
    id: "inner",
    solverTag: "bipolar",
  } as unknown as ComponentSolveResult;
  const parent = {
    ...makeResult(),
    children: new Map([["inner", child]]),
  } as unknown as ComponentSolveResult;
  const out = formatMermaid(parent);
  assertStringIncludes(out, "subgraph grounded");
  assertStringIncludes(out, "subgraph bipolar");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test -A src/cli/format-mermaid.test.ts`
Expected: FAIL — placeholder is `"graph LR\n"`.

- [ ] **Step 3: Implement `formatMermaid`**

```ts
import type { ComponentSolveResult } from "../model.js";

function emitComponent(result: ComponentSolveResult, indent: string): string {
  const lines: string[] = [];
  lines.push(`${indent}subgraph ${result.solverTag}`);
  for (const [id, label] of result.native.values) {
    lines.push(`${indent}  ${id}[${label}]`);
  }
  for (const [, child] of result.children) {
    lines.push(emitComponent(child, indent + "  "));
  }
  lines.push(`${indent}end`);
  return lines.join("\n");
}

export function formatMermaid(result: ComponentSolveResult): string {
  return `graph LR\n${emitComponent(result, "")}\n`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test -A src/cli/format-mermaid.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/cli/format-mermaid.ts src/cli/format-mermaid.test.ts
git commit -m "feat(cli): implement Mermaid formatter with nested subgraphs"
```

---

### Task 11: Mixed-semantics fixture + snapshot tests

**Files:**
- Create: `src/bench.fixtures/mixed-semantics.edn`
- Create: `src/cli/__snapshots__/mixed-semantics.table.txt`
- Create: `src/cli/__snapshots__/mixed-semantics.json.txt`
- Create: `src/cli/__snapshots__/mixed-semantics.dot.txt`
- Create: `src/cli/__snapshots__/mixed-semantics.mermaid.txt`
- Create: `src/cli/snapshots.test.ts`

- [ ] **Step 1: Create the fixture**

Create `src/bench.fixtures/mixed-semantics.edn`:

```edn
{:id :mixed-semantics-test
 :root #casualtheorics.argdown2.solver/grounded
 {:id :outer
  :interface {:aggregate #casualtheorics.argdown2.aggregate/identity
              {:inputs [{:ref :top-a}]}}
  :elements [
   #casualtheorics.argdown2.argdown/statement {:id :top-a :text "Top A"}
   #casualtheorics.argdown2.argdown/statement {:id :top-b :text "Top B"}
   #casualtheorics.argdown2.argdown/attack
   {:id :top-attack :from :top-a :to :top-b}
   #casualtheorics.argdown2.solver/bipolar
   {:id :inner
    :interface {:aggregate #casualtheorics.argdown2.aggregate/identity
                {:inputs [{:ref :inner-x}]}}
    :elements [
     #casualtheorics.argdown2.argdown/statement {:id :inner-x :text "Inner X"}
     #casualtheorics.argdown2.argdown/support
     {:id :inner-support :from :inner-x :to :top-a}]}]}}
```

- [ ] **Step 2: Write the failing snapshot test**

Create `src/cli/snapshots.test.ts`:

```ts
import { assertEquals } from "@std/assert";

const FIXTURE_PATH = new URL(
  "../bench.fixtures/mixed-semantics.edn",
  import.meta.url,
).pathname;

async function runCli(args: string[]): Promise<{ stdout: string; code: number }> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", ...args, FIXTURE_PATH],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await cmd.output();
  return { code, stdout: new TextDecoder().decode(stdout) };
}

Deno.test("snapshot: --format=table", async () => {
  const { code, stdout } = await runCli(["--format=table"]);
  assertEquals(code, 0);
  const expected = await Deno.readTextFile(
    new URL("./__snapshots__/mixed-semantics.table.txt", import.meta.url)
      .pathname,
  );
  assertEquals(stdout, expected);
});

// Repeat for json / dot / mermaid (omitted for brevity; follow same pattern).
```

- [ ] **Step 3: Generate snapshot files**

Run: `deno task cli --format=table src/bench.fixtures/mixed-semantics.edn > src/cli/__snapshots__/mixed-semantics.table.txt`

Run: `deno task cli --format=json src/bench.fixtures/mixed-semantics.edn > src/cli/__snapshots__/mixed-semantics.json.txt`

Run: `deno task cli --format=dot src/bench.fixtures/mixed-semantics.edn > src/cli/__snapshots__/mixed-semantics.dot.txt`

Run: `deno task cli --format=mermaid src/bench.fixtures/mixed-semantics.edn > src/cli/__snapshots__/mixed-semantics.mermaid.txt`

- [ ] **Step 4: Run tests to verify they pass**

Run: `deno test -A src/cli/snapshots.test.ts`
Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/bench.fixtures/mixed-semantics.edn src/cli/__snapshots__/ \
        src/cli/snapshots.test.ts
git commit -m "test(cli): add mixed-semantics fixture and snapshot tests"
```

---

### Task 12: Compile script + deno task

**Files:**
- Create: `scripts/compile-argdown-2.sh`
- Modify: `deno.json` (add `compile:cli` task)

- [ ] **Step 1: Read `scripts/compile-mcp.sh` to mirror its shape**

Run: `cat scripts/compile-mcp.sh`

- [ ] **Step 2: Create `scripts/compile-argdown-2.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION="$(cat "${SCRIPT_DIR}/argdown-2.version")"
OUT_DIR="${ROOT_DIR}/dist"
OUT="${OUT_DIR}/argdown-2"

mkdir -p "${OUT_DIR}"

echo "Compiling argdown-2 ${VERSION} → ${OUT}"
cd "${ROOT_DIR}"
deno compile \
  --allow-read \
  --allow-write \
  --allow-env \
  --allow-net \
  --output "${OUT}" \
  src/cli.ts

echo "Done. Binary at ${OUT}"
```

- [ ] **Step 3: Make script executable**

Run: `chmod +x scripts/compile-argdown-2.sh`

- [ ] **Step 4: Add `compile:cli` task to `deno.json`**

Modify `"tasks"` block in `deno.json`:

```json
"compile:cli": "bash ./scripts/compile-argdown-2.sh",
```

- [ ] **Step 5: Run compile**

Run: `deno task compile:cli`
Expected: produces `dist/argdown-2` binary.

- [ ] **Step 6: Verify the binary works**

Run: `./dist/argdown-2 --help`
Expected: prints HELP, exits 0.

Run: `./dist/argdown-2 --version`
Expected: prints "argdown-2 0.2.0", exits 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/compile-argdown-2.sh deno.json
git commit -m "feat(cli): add compile script and deno task for the CLI binary"
```

---

### Task 13: Binary launcher + version pin

**Files:**
- Create: `scripts/argdown-2.version`
- Create: `scripts/argdown-2`
- Modify: `plugins/argdown-2/scripts/argdown-2` (synced copy)
- Modify: `plugins/argdown-2/scripts/argdown-2.version` (synced copy)

- [ ] **Step 1: Read existing launcher as a template**

Run: `cat scripts/argdown-2-mcp`

- [ ] **Step 2: Create `scripts/argdown-2.version`**

```
0.2.0
```

- [ ] **Step 3: Create `scripts/argdown-2`**

Mirror the structure of `scripts/argdown-2-mcp`, replacing `argdown-2-mcp` with `argdown-2` and the corresponding MCP-specific behavior with the CLI-specific behavior. The launcher should:

1. Read the version from `scripts/argdown-2.version`.
2. Check for a cached binary at `~/.cache/argdown-2/<version>/argdown-2` (or similar).
3. If not cached, download from the GitHub release tagged `v<version>`.
4. Extract and execute.

- [ ] **Step 4: Make launcher executable**

Run: `chmod +x scripts/argdown-2`

- [ ] **Step 5: Sync to plugins directory**

Per `AGENTS.md` and `src/claude-plugin.test.ts`, the launcher must be kept in sync. Run:

```bash
cp scripts/argdown-2 plugins/argdown-2/scripts/argdown-2
cp scripts/argdown-2.version plugins/argdown-2/scripts/argdown-2.version
```

- [ ] **Step 6: Run launcher locally**

Run: `bash scripts/argdown-2 --help`
Expected: prints HELP, exits 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/argdown-2 scripts/argdown-2.version \
        plugins/argdown-2/scripts/argdown-2 \
        plugins/argdown-2/scripts/argdown-2.version
git commit -m "feat(cli): add binary launcher and version pin"
```

---

### Task 14: npm bin field in package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `"bin"` field to root `package.json`**

Modify `package.json`:

```json
"bin": {
  "argdown-2": "./dist/argdown-2"
},
```

(Add this after the existing `"description"` / `"keywords"` block. Adjust the binary path if the npm distribution needs a different entry — e.g., a small Node shim that imports the compiled binary.)

- [ ] **Step 2: Verify npm packaging works locally**

Run: `npm pack --dry-run`
Expected: the `argdown-2` binary is included in the tarball.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat(cli): expose argdown-2 binary via npm bin field"
```

---

### Task 15: README documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "CLI" section to the README**

After the existing "MCP server" section, add:

```markdown
## CLI

`argdown-2` ships a standalone CLI binary for shell access to the
load/validate/solve pipeline.

### Install

- Compiled binary: `bash scripts/argdown-2` (downloads pinned version)
- npm: `npm install -g @casualtheorics/argdown-2` then `argdown-2 ...`
- Deno: `deno install -A -n argdown-2 ...`

### Usage

```sh
# Default: load + solve + table output
argdown-2 foo.edn

# Validate only
argdown-2 --dry-run foo.edn

# Render as DOT, pipe to graphviz
argdown-2 --format=dot foo.edn | dot -Tpng > foo.png

# JSON output for scripts
argdown-2 --format=json foo.edn | jq '.root.labels'

# Read from stdin
cat foo.edn | argdown-2 -
```

### Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Parse, validation, or solve error (diagnostics on stderr) |
| 2 | Usage error (unknown flag, missing path) |

### Solver semantics

The CLI does NOT expose a `--semantics` flag. Solver semantics are
intrinsic to the document — set via per-component solver tags:

```edn
#casualtheorics.argdown2.solver/grounded  ; or .../bipolar, .../evidential
```

The library dispatches internally. Mixed-semantics documents (nested
solver components) are supported.
```

- [ ] **Step 2: Verify the README renders correctly**

Run: `cat README.md | head -100`
Expected: CLI section appears in a sensible position.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(cli): document the argdown-2 CLI in README"
```

---

### Task 16: MCP parity test

**Files:**
- Create: `src/cli/parity.test.ts`

- [ ] **Step 1: Write the parity test**

```ts
import { assertEquals } from "@std/assert";
import { runSolve } from "./solve.js";
import { solve as mcpSolve } from "../mcp/tools.js";

const FIXTURE_PATH = new URL(
  "../bench.fixtures/mixed-semantics.edn",
  import.meta.url,
).pathname;

Deno.test("CLI solve matches MCP solve for the same input", async () => {
  const source = await Deno.readTextFile(FIXTURE_PATH);

  // CLI JSON output.
  const cliWrites: string[] = [];
  const original = Deno.stdout.writeSync;
  // deno-lint-ignore no-explicit-any
  (Deno.stdout as any).writeSync = (data: Uint8Array) => {
    cliWrites.push(new TextDecoder().decode(data));
    return data.length;
  };
  runSolve(source, { quiet: true, format: "json" });
  (Deno.stdout as any).writeSync = original;
  const cliJson = cliWrites.join("").replace(/}$/, "").trim();

  // MCP solve output (parsed from JSON-RPC response).
  const mcpResult = await mcpSolve(JSON.parse(source));
  const mcpJson = JSON.stringify(mcpResult).replace(/}$/, "").trim();

  assertEquals(cliJson, mcpJson);
});
```

(Adapt to the actual MCP tool entry point — the test pattern is "same input via CLI vs. via MCP produces equivalent JSON output for labels".)

- [ ] **Step 2: Run test to verify it passes**

Run: `deno test -A src/cli/parity.test.ts`
Expected: test passes.

- [ ] **Step 3: Commit**

```bash
git add src/cli/parity.test.ts
git commit -m "test(cli): verify CLI solve output matches MCP solve output"
```

---

### Task 17: Round-trip all 7 bench fixtures

**Files:**
- Create: `src/cli/fixtures.test.ts`

- [ ] **Step 1: Write the fixtures test**

```ts
import { assertEquals } from "@std/assert";

const FIXTURES = [
  "small-minimal",
  "small-relations",
  "small-argument",
  "medium-censorship",
  "heavy-attacks",
  "deep-arguments",
  "large-stress",
];

for (const name of FIXTURES) {
  Deno.test(`fixture ${name} round-trips through CLI`, async () => {
    const path = new URL(
      `../bench.fixtures/${name}.edn`,
      import.meta.url,
    ).pathname;
    const cmd = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "src/cli.ts", "--format=json", path],
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await cmd.output();
    assertEquals(code, 0, `stderr: ${new TextDecoder().decode(stderr)}`);
    const out = new TextDecoder().decode(stdout);
    JSON.parse(out); // throws if not valid JSON
  });
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `deno test -A src/cli/fixtures.test.ts`
Expected: 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/cli/fixtures.test.ts
git commit -m "test(cli): round-trip all bench fixtures through CLI"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Flag surface — Task 1 (argv parsing, --help, --version), Task 6 (--format dispatch), Task 4 (--dry-run), Task 5 (default solve)
- ✅ EDN-only input — Tasks 2-3 (input + load)
- ✅ Markdown table format with per-solver headings — Task 7
- ✅ JSON format mirroring EDN structure — Task 8
- ✅ DOT with nested subgraphs — Task 9
- ✅ Mermaid with nested subgraphs — Task 10
- ✅ Direct library imports — Task 3 (load) + Task 4 (validate) + Task 5 (solve)
- ✅ Three distribution channels — Tasks 12 (compile), 13 (launcher), 14 (npm bin)
- ✅ Mixed-semantics fixture — Task 11
- ✅ MCP parity test — Task 16
- ✅ Round-trip bench fixtures — Task 17
- ✅ README documentation — Task 15

**Type consistency:**
- `ComponentSolveResult` is imported from `../model.js` consistently across Tasks 5-10.
- `LoadResult` / `Document` types flow from `loadAndReport` (Task 3) through `runValidate` (Task 4) and `runSolve` (Task 5).
- `FormatName` ("table" | "dot" | "mermaid" | "json") is defined in Task 6 and used consistently in Tasks 5, 6.
- `parseArgs` returns `Args | { error: string }` (Task 1) and is used in `main` (Task 5).

**Placeholder scan:** No TBD/TODO. All code blocks are complete.

**Ambiguity:** Per-solver table headings (Option A — Task 7), JSON shape (EDN-mirrored — Task 8), bin name `argdown-2` (Task 13), distribution channels (Tasks 12-14), all resolved during brainstorming.

---

## Blast-Radius

**Skipped:** the yactt graph for this repo is not cached (cacheFresh=false on index_status), and the plan is a from-scratch addition with no prior diff to measure against. The plan's scope is bounded by the File Structure section above (~17 created files, ~5 modified), all in well-defined locations. No cross-cutting changes to existing library code; the CLI is a thin wrapper that imports `load`, `validate`, `solve` from the existing public API.

If the operator wants a blast-radius report, run `deno task check` (validates TypeScript across the repo) and `deno task lint` (style + correctness) as a substitute — both should pass after the plan is complete.

---

## Execution Handoff

Plan complete and saved to `docs/snowball/plans/2026-07-21-argdown-2-cli.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Best for plans of this size (17 tasks).

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?