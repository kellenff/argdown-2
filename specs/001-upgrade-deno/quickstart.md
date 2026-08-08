# Quickstart: Upgrade Pinned Deno to Latest Stable — Validation Guide

**Date**: 2026-08-07
**Spec**: [spec.md](./spec.md)
**Research**: [research.md](./research.md)
**Data model**: [data-model.md](./data-model.md)
**Contracts**: [contracts/README.md](./contracts/README.md)

This guide walks a reviewer or maintainer through the end-to-end
validation of the Deno 2.4.5 → 2.9.2 upgrade. Every step is a real,
runnable command from the `deno.json` `tasks` table — no bespoke scripts,
no synthetic tooling. The expected outcomes are the same ones the CI
gate `Probe host MCP binary` checks, plus the constitutional gate suite
in `.specify/memory/constitution.md`.

## Prerequisites

- A clean checkout at the upgrade branch.
- The latest stable Deno installed on the host. Confirm with:
  ```
  deno --version
  ```
  Expect: `deno 2.9.2 (stable, release, <host-triple>)`.
- macOS or Linux host (the project publishes binaries for both; Windows
  is not a release target).
- The project files in scope, all on the upgrade branch:
  - `scripts/deno-version` contains `2.9.2`.
  - `scripts/compile-mcp.sh` and `scripts/check-mcp-deno.sh` are
    byte-identical to `main` (they read the pin; they don't hard-code).
  - `src/pi-package.test.ts:109-111` comment block references
    `Deno 2.4.5–2.9.2 sanitizeOps …` (workaround still load-bearing).
  - `.specify/memory/constitution.md` Runtime paragraph reads
    `currently 2.9.2`.

## Step 1 — confirm the host pin matches the repo pin

```
deno --version | head -n1 | awk '{print $2}'
```

Expected: `2.9.2`.

If mismatched, install the right Deno (`deno upgrade` or the project's
documented install path) before continuing. Do not edit the pin to match
a different host Deno.

## Step 2 — confirm the script-side guards accept the host

```
bash scripts/check-mcp-deno.sh
```

Expected: exits 0, prints `check-mcp-deno: ok`. The script refuses to run
when the host `deno` version does not equal the contents of
`scripts/deno-version`, so a successful exit is the explicit signal that
the pin and the host agree.

## Step 3 — confirm the type and lint gates are clean

```
deno task lint
deno task fmt:check
deno task check
```

Expected: each exits 0 with no findings. `deno task check` runs
`deno check --frozen` against `src/index.ts` and `src/mcp/cli.ts`,
which is the canonical typecheck.

If `deno task check` fails on existing code, the upgrade has surfaced a
TS 6.0 strict-adjacent regression that research.md item 6 anticipated as
low-likelihood. Do not relax the typecheck to make it pass; record the
failing file in a new bullet under the spec's "Edge Cases" and resolve
per FR-010.

## Step 4 — confirm the test gate is clean

```
deno task test
```

Expected: exits 0, all suites pass. The `Pi package MCP bridge` block
at `src/pi-package.test.ts:109-131` MUST continue to opt out of
`sanitizeOps` / `sanitizeResources` (workaround still load-bearing in
2.9.2; see research.md item 10).

If a snapshot test fails because the new V8/TS changed formatting, treat
that as a regression that needs investigation, not a snapshot-update
action — re-derive the expected output and confirm it is correct, then
update the snapshot with `UPDATE_SNAPSHOTS=1` only after confirming the
new output is intentional.

## Step 5 — confirm the npm allowlist gate

```
deno task check:npm-allowlist
```

Expected: exits 0. The allowlist is unchanged in this PR, so this is a
sanity check, not a new validation.

## Step 6 — confirm the JSR slow-types contract

```
deno task publish:dry-run
```

Expected: exits 0, no slow-types warnings. This is the same gate the
Release workflow's `dry-run-publish` CI job runs. A failure here blocks
the merge per Constitution Principle IV compliance review.

## Step 7 — compile the host-target MCP binary

```
deno task compile:mcp
```

Expected: exits 0 and writes `dist/mcp-bin/argdown-2-mcp-<host-triple>`.
The script `scripts/compile-mcp.sh` itself enforces that the host Deno
matches the pin before invoking `deno compile`, so a successful compile
is also a re-confirmation of Step 2.

## Step 8 — probe the compiled binary's stdio handshake

```
deno task probe:mcp ./dist/mcp-bin/argdown-2-mcp-<host-triple>
```

Expected: exits 0, reports a healthy handshake with all 14 MCP tools
available (`create_document`, `add_statement`, `update_statement`,
`add_argument`, `add_inference`, `add_relation`, `add_solver`,
`set_import`, `remove_import`, `remove_element`, `remove_relation`,
`list_elements`, `validate`, `solve`). This is the canonical end-to-end
check (Constitution Principle IV: "a builder refactor that breaks the
library but is caught only by unit tests would still ship a broken MCP
binary; the stdio probe is the only check that exercises the actual
shipped artifact").

## Step 9 — exercise the MCP smoke flow from source

```
deno task mcp &
PID=$!
sleep 1
kill $PID 2>/dev/null || true
```

Or, per the README's "MCP server smoke test" guidance, exercise
`create_document → add_statement → add_relation → solve` against a real
stdio client. The probe in Step 8 is the minimal end-to-end check; the
full smoke flow is the gold-standard review.

## Step 10 — confirm the constitution gate still passes

Open `.specify/memory/constitution.md` and confirm:

- Principle IV (End-to-End MCP Coverage) — Step 8 + Step 9.
- Technology Constraints → Runtime — pin reference now reads `2.9.2`.
- Development Workflow & Quality Gates — all eleven listed tasks pass.

## Done When

- Steps 1–8 all pass with exit code 0 on the upgrade branch.
- The compiled host-target binary passes the stdio probe (Step 8).
- The constitution's runtime pin reference and the in-source
  `Deno 2.4.5–2.9.2 sanitizeOps …` comment block both reflect the new
  version range.
- No `deno task` invocation has been weakened (no skipped test, no
  muted lint rule, no deleted snapshot, no relaxed typecheck).
- `CHANGELOG.md` is intentionally untouched (runtime pin bumps are
  housekeeping per the spec's Clarifications section).

The PR is then ready to push. The CI workflow runs the same gate suite
plus the Release-probe step on Linux; the Release workflow handles
multi-target compilation and GitHub Release publishing only when
`deno.json#version` is bumped (which it is not in this PR).