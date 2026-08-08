# CLI Surface Contract

**Date**: 2026-08-07
**Branch**: `20260807-v1-baseline`
**Spec anchor**: (cross-references FR-010, FR-014)
**Constitution anchor**: Principle V (Builder-as-Authoring, Strict UX Contracts)

## Surface

The `argdown-2` CLI is a developer convenience wrapper around the
library's `load` + `solve` (or `validate`) pipeline. It is **not**
a separately versioned public binary; it is shipped as a `deno task`
(`deno task cli`) for day-to-day local use.

The shipped binary is the **MCP server** (`argdown-2-mcp`); the CLI
exists to make local debugging trivial without invoking an MCP
client.

## Invocation

```bash
argdown-2 <input>                  # solve, table output (back-compat)
argdown-2 --format=<fmt> <input>   # solve, format from {table, dot, mermaid, json}
argdown-2 --dry-run <input>        # validate only (back-compat)
argdown-2 solve <input>            # explicit solve subcommand
argdown-2 validate <input>         # explicit validate subcommand
argdown-2 -                        # read from stdin
argdown-2 --help                   # usage + format list
```

`<input>` is a path to an `.edn` file, or `-` for stdin.

## Subcommands

### `solve` (default)

Load + solve a document and render the result.

```bash
argdown-2 solve [--format=<fmt>] [--help] <input>
```

Default format: `table`.

### `validate`

Load + validate a document and print diagnostics (no solve).

```bash
argdown-2 validate [--help] <input>
```

## Flags

| Flag | Subcommand | Default | Purpose |
|---|---|---|---|
| `--format=<fmt>` | solve | `table` | One of `table`, `dot`, `mermaid`, `json`. |
| `--dry-run` | (any) | false | Validate only; skip solve. |
| `--help` | (any) | false | Show usage + format list. |

Unknown flags → exit code `2` (usage error).

## Output formats

### `table`

Human-readable text table. Default for `solve`. Snapshot fixture:
`src/cli/__snapshots__/mixed-semantics.table.txt`.

### `dot`

Graphviz DOT. Suitable for `dot -Tsvg foo.dot > foo.svg`. Snapshot
fixture: `src/cli/__snapshots__/mixed-semantics.dot.txt`.

### `mermaid`

Mermaid diagram. Suitable for GitHub markdown. Snapshot fixture:
`src/cli/__snapshots__/mixed-semantics.mermaid.txt`.

### `json`

Machine-readable JSON. Same shape as the `solve` MCP tool's result
(`ComponentSolveResult` with `native` / `aggregate` / `boundary` /
`children` / `warnings`).

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success. |
| `1` | Parse / validation / solve error. Diagnostics on stderr. |
| `2` | Usage error: unknown flag, missing path, unknown subcommand. |

## Stderr / stdout split

- **stdout**: rendered result (table / dot / mermaid / json).
- **stderr**: usage messages; diagnostics on error.

## Stdin

`-` as the input argument reads EDN source from stdin until EOF.

## Solver semantics

There is **no `--semantics` CLI flag**. Solver choice is read from
each component's tag
(`#casualtheorics.argdown2.solver/<name>`). This applies uniformly
to the library, the CLI, and the MCP `solve` tool.

## Stability

- Subcommands: **frozen** (renames require a major version bump).
- Flags: **additive** (new optional flags OK; new required flags
  are breaking).
- Output format byte-stream: **not a contract**. Snapshots may
  evolve without a major version bump; only the JSON shape is a
  contract (it mirrors `ComponentSolveResult`).
- Exit codes: **frozen**.

## Anti-patterns

- **Parsing CLI stdout**: only the `json` format is a stable machine
  contract; other formats may evolve.
- **Assuming a default format**: `table` is the default for `solve`;
  pin `--format=json` if you depend on a stable wire shape.
