# Optique CLI Parser — Design Spec

**Status:** Draft. Under brainstorming review.
**Date:** 2026-07-25
**Supersedes (in part):** [`2026-07-21-argdown-2-cli-design.md`](2026-07-21-argdown-2-cli-design.md)

## Context

The CLI shipped in 2026-07-21 ([`2026-07-21-argdown-2-cli-design.md`](2026-07-21-argdown-2-cli-design.md))
uses a hand-rolled argument parser in `src/cli.ts`. The 2026-07-21 spec
deliberately rejected subcommands in favor of a flag-driven single binary
(`--dry-run` for validate, default for solve). That decision held for the
initial release; this spec evolves it.

Three changes drive this spec:

1. The hand-rolled parser is bespoke and produces divergent error/help
   messages. A library swap brings standard help text generation, shell
   completion metadata, and uniform error reporting.
2. Subcommand expansion is now desired (see [Decision](#decision)).
3. Optique has been vendored at `repos/optique/` (commit
   `c83dd9476eb50e8bd7f50d9a4b98348b076ff298`, v1.2.0) and is ready to be
   consumed as a published dependency.

The Optique rewrite preserves the 2026-07-21 file layout (`src/cli/`,
`src/cli/{validate,solve,format,load,input,output}.ts`) and all output-format
specifications. What changes: the parser implementation, the help text
source (auto-gen + footer instead of hand-written), and the surface gains
two subcommands.

## Decision

| Decision | Choice | Rationale |
|---|---|---|
| CLI surface | Subcommands (`solve`, `validate`) with bare-invocation synonym | New users get explicit verbs; existing scripts keep working unchanged. |
| Optique source | Published JSR (`jsr:@optique/core@^1.2.0`, `jsr:@optique/run@^1.2.0`) | Conventional for a published library; decouples from `repos/optique/`. `repos/optique/` stays as a vendored reference copy. |
| Sub-deps | Bare `@optique/core` + `@optique/run` | Zod is for document validation; CLI argument shapes are simple enough to stay in built-in value parsers (`string`, `choice`). |
| Help text | Optique auto-generated + appended footer | Accurate auto-gen for the parser structure, plus the rich semantics block (exit codes, format descriptions, solver-tag notes). |
| Exit codes | 0=success, 1=runtime error, 2=usage error | Preserves the 2026-07-21 contract. `@optique/run` owns exit 2; dispatcher returns 0 or 1. |
| Process management | `@optique/run` owns argv/help/version/exit-2 | Standard. We only own dispatch (action → handler). |
| Tests | Pure parser tests + help snapshot + 3 subprocess exit-code checks | Fastest feedback on parser shape; defense-in-depth on the exit-code contract. |

### Why subcommands now (the reversal from 2026-07-21)

The 2026-07-21 spec argued that the CLI should be "closer to standard Unix
tooling (`cat`, `jq`, `sed`) than to a subcommand-based CLI" and that
subcommands would invite "feature creep in the command surface."

That argument still applies to *unjustified* subcommands. The 2026-07-25
position:

- `validate` and `solve` are **not** feature creep — they are the only
  two actions the CLI will ever expose. The library has exactly these two
  stages (load+validate, then solve).
- The bare invocation (`argdown-2 foo.edn`) and `--dry-run` are preserved
  as back-compat synonyms. Existing scripts continue to work.
- Optique's subcommand parser produces consistent help text and error
  messages between subcommands for free; building this by hand would be
  more code than swapping the parser.

If a third action ever appears, it joins as a third subcommand — which is
the right shape for a CLI that has more than one thing to do.

## Goal

1. Replace `src/cli.ts`'s hand-rolled `parseArgs` with an Optique parser
   combinator consumed via `@optique/run`.
2. Add `solve` and `validate` subcommands; preserve bare-invocation and
   `--dry-run` as back-compat synonyms.
3. Preserve the 2026-07-21 output-format spec verbatim.
4. Preserve the 2026-07-21 exit-code contract verbatim.
5. Document the new surface in README and CHANGELOG.

## Non-goals

- A third action. (If it shows up, it's a third subcommand — see Decision.)
- Config files, env-var defaults, shell completion scripts.
- A new library surface (`load`, `validate`, `solve`) — unchanged.
- Touching any file under `src/cli/{validate,solve,format,load,input,output}.ts`
  or their tests.

## Approach: Optique parser + `@optique/run`

### Parser combinator

The parser composes three pieces (full sketch in §Parser combinator below):

- **Shared options**: `--quiet`, `--format=<table|dot|mermaid|json>`
  (default: `table`).
- **Subcommands**: `solve <path>`, `validate <path>`.
- **Bare invocation**: `[flags] <path|->` with optional `--dry-run` flag
  that flips the dispatcher's action to `validate`.

The parsed result is a discriminated union:

```ts
type CliResult =
  | { action: "solve"; path: string; format: FormatName; quiet: boolean }
  | { action: "validate"; path: string; quiet: boolean };
```

The parser produces raw output that needs a one-step normalization
before the dispatcher's `switch`:

```ts
function normalize(p: ParserOutput): CliResult {
  // Subcommand paths: action is already final.
  // Bare invocation: --dry-run flips solve → validate.
  if (p.action === "validate") {
    return { action: "validate", path: p.path, quiet: p.quiet ?? false };
  }
  if (p.dryRun === true) {
    return { action: "validate", path: p.path, quiet: p.quiet ?? false };
  }
  return {
    action: "solve",
    path: p.path,
    format: p.format ?? "table",
    quiet: p.quiet ?? false,
  };
}

async function dispatch(parsed: ParserOutput): Promise<number> {
  const result = normalize(parsed);
  const source = await readInput(result.path);
  switch (result.action) {
    case "validate":
      return runValidate(source, { quiet: result.quiet });
    case "solve":
      return runSolve(source, { quiet: result.quiet, format: result.format });
  }
}
```

### File layout

```
src/cli.ts                  # bin entry: import parser, run()
src/cli/parser.ts           # parser combinator (new)
src/cli/dispatch.ts         # action dispatcher (new)
src/cli/help-footer.ts      # footer text (renamed from help.ts)
src/cli/help.ts             # DELETED (footer moves to help-footer.ts; auto-gen from Optique)
src/cli/input.ts            # unchanged
src/cli/load.ts             # unchanged
src/cli/solve.ts            # unchanged
src/cli/validate.ts         # unchanged
src/cli/format.ts           # unchanged
src/cli/format-table.ts     # unchanged
src/cli/format-json.ts      # unchanged
src/cli/format-dot.ts       # unchanged
src/cli/format-mermaid.ts   # unchanged
src/cli/output.ts           # unchanged
src/cli/__snapshots__/      # + help.txt (new snapshot)
src/cli/parser.test.ts      # NEW: parser-shape unit tests + 3 subprocess exit-code checks
src/cli/cli.test.ts         # DELETED (replaced by parser.test.ts)
src/cli/snapshots.test.ts   # unchanged (formatters)
src/cli/format-*.test.ts    # unchanged
src/cli/{validate,solve,load,input,output}.test.ts  # unchanged
```

### Parser combinator

```ts
// src/cli/parser.ts — sketch, not the final code

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
import type { FormatName } from "./format.js";

type CliResult =
  | { action: "solve"; path: string; format: FormatName; quiet: boolean }
  | { action: "validate"; path: string; quiet: boolean };

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
  }),
);

const validateCommand = command(
  "validate",
  object({
    action: constant("validate"),
    path: argument(string({ metavar: "PATH" })),
    quiet: optional(sharedQuiet, { default: false }),
  }),
);

const bareInvocation = object({
  action: constant("solve"), // flipped to "validate" by --dry-run post-parse
  path: argument(string({ metavar: "PATH" })),
  format: optional(sharedFormat),
  quiet: optional(sharedQuiet, { default: false }),
  dryRun: option("--dry-run"),
});

const parser = or(solveCommand, validateCommand, bareInvocation);
```

The `--dry-run` post-parse normalization is the `normalize()` function
in `src/cli/dispatch.ts` (see the §Parser combinator section below). The
parser combinator itself never collapses `solve` and `validate` into a
single shape — subcommand parses already have a final `action`, and the
bare invocation's `dryRun` field is just promoted to `action: "validate"`
by the normalizer. This keeps the parser declarative and the imperative
routing in one place.

### Help text

Optique auto-generates `--help` output from the parser combinator. We
append a footer from `src/cli/help-footer.ts`:

```
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
```

If `@optique/run`'s 1.2.0 `help` option doesn't accept a footer callback,
the fallback is a `--help` short-circuit in `src/cli.ts` that prints the
auto-gen block via `getUsage()` then appends the footer. Decision recorded
at implementation time.

### Exit codes

| Condition | Handler | Exit |
|---|---|---|
| `--help` / `--version` | `@optique/run` | 0 |
| Unknown flag / missing path / unknown subcommand | `@optique/run` | 2 |
| EDN parse error | `loadAndReport` → dispatcher | 1 |
| Validation error | `loadAndReport` → dispatcher | 1 |
| Solve error | `runSolve` | 1 |
| Success | dispatcher | 0 |

`@optique/run` owns all exit-2 cases. The dispatcher only ever returns 0
or 1.

### Stdin path

The `-` token is a plain `string()` argument. The handler passes it to
`readInput(path)` which already handles `path === "-"` → read from stdin.
No CLI parser-level special-casing.

### Dependencies

Add to `deno.json` `imports`:

```jsonc
"@optique/core": "jsr:@optique/core@^1.2.0",
"@optique/run":  "jsr:@optique/run@^1.2.0"
```

If JSR availability flakes at install time, the fallback is
`npm:@optique/core@^1.2.0` and `npm:@optique/run@^1.2.0`. Decision at
implementation time.

`repos/optique/` stays as a vendored reference copy. Future upgrades pull
there first, then bump the JSR version.

### Test strategy

**Layer 1 — parser unit tests** (`src/cli/parser.test.ts`).

Import `parser` and Optique's pure `parse()`. Each test feeds a synthetic
argv array and asserts on the `CliResult`:

| Input argv | Expected result |
|---|---|
| `["foo.edn"]` | `{ action: "solve", path: "foo.edn", format: "table", quiet: false }` |
| `["--format=json", "foo.edn"]` | `{ action: "solve", path: "foo.edn", format: "json", quiet: false }` |
| `["--dry-run", "foo.edn"]` | `{ action: "validate", path: "foo.edn", quiet: false }` |
| `["solve", "--format=dot", "foo.edn"]` | `{ action: "solve", ..., format: "dot" }` |
| `["validate", "--quiet", "foo.edn"]` | `{ action: "validate", path: "foo.edn", quiet: true }` |
| `["-", "--quiet"]` | `{ action: "solve", path: "-", quiet: true }` |
| `["--bogus"]` | parse error |
| `[]` | parse error (missing path) |
| `["solve"]` | parse error (missing path) |
| `["foo.edn", "bar.edn"]` | parse error (unexpected positional) |

**Layer 2 — help-text snapshot** (`src/cli/__snapshots__/help.txt`).

Render Optique's usage via `getUsage()` plus the footer. Snapshot the
combined string.

**Layer 3 — subprocess exit-code contract** (`src/cli/parser.test.ts`,
three tests at the bottom).

Three subprocess invocations via `deno run -A src/cli.ts`:

1. `argdown-2 --help` → exit 0, stdout contains the usage block.
2. `argdown-2 --bogus-flag` → exit 2, stderr contains a usage message.
3. `argdown-2 does-not-exist.edn` → exit 1, stderr contains a load error.

The dispatcher is not separately tested: it's a typed `switch` on a
discriminated union, and the Layer 1 parser tests already exercise the
two action paths (`validate`, `solve`) end-to-end via normalization. A
dedicated `dispatch.test.ts` would be redundant.

Existing `src/cli/snapshots.test.ts` and `src/cli/format-*.test.ts`
continue to test the formatters untouched. Existing
`src/cli/{validate,solve,load,input,output}.test.ts` continue to test
the actions untouched.

### Documentation migration

| Doc | Change |
|---|---|
| `README.md` | Add the new subcommand forms (`argdown-2 validate foo.edn`, `argdown-2 solve --format=json foo.edn`) alongside the bare invocation in the Examples section. |
| `CHANGELOG.md` | New entry under unreleased: "feat(cli): rewrite argument parser on `@optique/core` + `@optique/run`; add `validate` and `solve` subcommands; bare invocation and `--dry-run` remain as back-compat synonyms." |
| `src/cli/help-footer.ts` | New file replacing `help.ts`; footer text only. |

### Back-compat contract

| Old form | New form | Status |
|---|---|---|
| `argdown-2 foo.edn` | `argdown-2 foo.edn` | Works (bare → solve). |
| `argdown-2 --format=dot foo.edn` | Same | Works. |
| `argdown-2 --dry-run foo.edn` | Same (or `validate foo.edn`) | Works. |
| `argdown-2 --quiet foo.edn` | Same | Works. |
| `argdown-2 --help` / `--version` | Same | Works. |
| (new) | `argdown-2 solve foo.edn` | New. |
| (new) | `argdown-2 validate foo.edn` | New. |
| (new) | `argdown-2 solve --format=json -` | New (stdin). |

Exit codes, exit conditions, stdout/stderr destinations: identical to
2026-07-21.