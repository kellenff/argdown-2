# CLI Snapshot Tests Fix — Design Spec

**Status:** Draft. Under brainstorming review.
**Date:** 2026-07-25

## Context

`src/cli/snapshots.test.ts` was added in commit `c008a6472 test(cli):
add snapshot tests for formatters` (the only commit that touches this
file). The test has been failing ever since, surfacing as 4 pre-existing
failures that the EDN reader Effect refactor (spec
`2026-07-25-edn-effect-refactor-design.md`) noted in its handoff.

Two bugs ship together:

1. **Wrong `FIXTURE_PATH`** (line 3–6): `"../../bench.fixtures/mixed-semantics.edn"`
   from `src/cli/snapshots.test.ts` resolves to
   `<repo_root>/bench.fixtures/mixed-semantics.edn`. The actual fixture
   lives at `<repo_root>/src/bench.fixtures/mixed-semantics.edn` —
   only one `..` needed.

2. **Missing snapshot files** (`src/cli/__snapshots__/`): the directory
   contains only `help.txt` (unrelated). The 4 files referenced by the
   tests were never committed:
   - `mixed-semantics.table.txt`
   - `mixed-semantics.json.txt`
   - `mixed-semantics.dot.txt`
   - `mixed-semantics.mermaid.txt`

The CLI runs cleanly and produces deterministic output, confirmed by
`deno run -A src/cli.ts --format=table src/bench.fixtures/mixed-semantics.edn`.

Formatters also have unit tests (`format-table.test.ts`,
`format-json.test.ts`, `format-dot.test.ts`,
`format-mermaid.test.ts`) that test the format functions directly and
pass. The snapshot tests are the integration layer: subprocess + stdout
capture + file compare. They're the missing piece of the CLI's test
coverage.

## Decision

| Decision | Choice | Rationale |
|---|---|---|
| Snapshot intent | Capture current CLI output as ground truth | Snapshot tests fail on intentional format changes — that's their purpose. |
| Generation method | `UPDATE_SNAPSHOTS=1` env var in the test itself | Self-contained regeneration tool, one-shot via env var, no separate script to maintain. |
| Test refactor | DRY 4 copy-paste blocks into a single `for` loop over `FORMATS` | Smaller diff, easier to add formats later, regeneration logic lives in one place. |
| Commit cadence | Two commits (path/loop fix, then snapshot generation) | Auditability — second commit is the literal CLI output, generated from a known-working run. |

## File changes

**`src/cli/snapshots.test.ts`** — replace the whole file:

```ts
import { assertEquals } from "@std/assert";

const FIXTURE_PATH = new URL(
  "../bench.fixtures/mixed-semantics.edn",
  import.meta.url,
).pathname;

const FORMATS = ["table", "json", "dot", "mermaid"] as const;

async function runCli(
  args: string[],
): Promise<{ stdout: string; code: number }> {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", ...args, FIXTURE_PATH],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout } = await cmd.output();
  return { code, stdout: new TextDecoder().decode(stdout) };
}

for (const format of FORMATS) {
  Deno.test(`snapshot: --format=${format}`, async () => {
    const { code, stdout } = await runCli([`--format=${format}`]);
    // Always assert the CLI succeeds, even in update mode — a non-zero exit
    // would write garbage to the snapshot file.
    assertEquals(code, 0);
    const snapshotPath = new URL(
      `./__snapshots__/mixed-semantics.${format}.txt`,
      import.meta.url,
    ).pathname;
    if (Deno.env.get("UPDATE_SNAPSHOTS") === "1") {
      await Deno.writeTextFile(snapshotPath, stdout);
      return;
    }
    const expected = await Deno.readTextFile(snapshotPath);
    assertEquals(stdout, expected);
  });
}
```

**`src/cli/__snapshots__/`** — add 4 new files (generated):

- `mixed-semantics.table.txt`
- `mixed-semantics.json.txt`
- `mixed-semantics.dot.txt`
- `mixed-semantics.mermaid.txt`

## Generation procedure

**One-shot generation** (committed as the second commit):

```bash
UPDATE_SNAPSHOTS=1 deno test -A src/cli/snapshots.test.ts
```

Each test runs the CLI, asserts exit code 0 (preventing garbage writes
on a broken CLI), then writes its captured stdout to the snapshot file.

**Subsequent normal runs** assert stdout matches the snapshot:

```bash
deno test -A src/cli/snapshots.test.ts
```

**Future regeneration** (when a formatter change is intentional):

```bash
UPDATE_SNAPSHOTS=1 deno test -A src/cli/snapshots.test.ts
git add src/cli/__snapshots__/
git commit -m "test(cli): regenerate mixed-semantics snapshots"
```

## Verification

```bash
UPDATE_SNAPSHOTS=1 deno test -A src/cli/snapshots.test.ts
deno test -A --frozen src/cli/snapshots.test.ts
deno test -A --frozen src/
deno lint src/cli/snapshots.test.ts
deno fmt --check src/cli/snapshots.test.ts
```

Expected: all 4 snapshot tests pass; full suite (with the EDN refactor
applied) reports 0 failures from this refactor. Pre-existing failures
in any other file are out of scope.

## Out of scope (deferred)

- Adding snapshot tests for other CLI invocations (`--dry-run`,
  `validate` subcommand, etc.) — same pattern would apply if needed
  later.
- Snapshot drift tooling (e.g., `UPDATE_SNAPSHOTS=only-this-format`) —
  YAGNI; the env var is global to the test run.
- Cross-platform path handling (`new URL(...).pathname` on Windows) —
  project is unix-only per `package.json`.