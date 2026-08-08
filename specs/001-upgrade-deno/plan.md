# Implementation Plan: Upgrade Pinned Deno to Latest Stable

**Branch**: `[001-upgrade-deno]` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-upgrade-deno/spec.md`

## Summary

Bump the project's single-source Deno pin from `2.4.5` to `2.9.2` (the
latest stable release at the time of this work), update the three
co-located literals that name a specific Deno version, and verify the
full constitutional gate suite (`test`, `lint`, `fmt:check`, `check`,
`check:mcp-deno`, `compile:mcp`, `probe:mcp`, `check:npm-allowlist`,
`publish:dry-run`) remains green without weakening any test, snapshot,
lint rule, or typecheck. Per the spec's Clarifications section, this PR
does **not** add a `CHANGELOG.md` entry (runtime pin bumps are
housekeeping).

The risk register in [research.md](./research.md) is GREEN: the
2.4.5 → 2.9.2 delta is mechanical — flag surface is identical, lockfile
schema (`version: 5`) is unchanged, all three `unstable` flags are
still required, the four release triples still cross-compile, the
`deno publish` flag surface is identical, and TS 6.0 introduces no new
strict default that the codebase trips. The `sanitizeOps` workaround in
`src/pi-package.test.ts:109-131` is still load-bearing in 2.9.2 and
must be preserved.

## Technical Context

**Language/Version**: TypeScript 6.0.3 (bundled in Deno 2.9.2);
`compilerOptions.strict = true`, `noImplicitAny = true`. No `tsconfig`
is used; everything goes through `deno.json#compilerOptions`.

**Primary Dependencies**:
- Deno std (`@std/assert@1`, `@std/expect@1`, `@std/testing/bdd` from `jsr:@std/testing@1`).
- `npm:zod@4.4.3`, `npm:effect@^4.0.0-beta.101`, `npm:@modelcontextprotocol/sdk@1.29.0` (allowlist per Constitution Principle IX).
- `jsr:@optique/core@^1.2.0`, `jsr:@optique/run@^1.2.0`.
- Vendored: `./vendor/edn-parser-js/lib/index.js` (ESM); `./vendor/effect/` (ESM `npm:effect@4.0.0-beta.101` source).

**Storage**: N/A — no persistent storage is introduced or modified.

**Testing**: `deno test -A --frozen --parallel src/` (`deno task test`).
51 `Deno.test` calls; snapshot tests in `src/cli/__snapshots__/` gated
by `UPDATE_SNAPSHOTS=1`.

**Target Platform**: Deno runtime on `x86_64-apple-darwin`,
`aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`,
`aarch64-unknown-linux-gnu` (per `scripts/compile-mcp.sh:12-17` and
Constitution Principle IX Distribution Channels).

**Project Type**: TypeScript library + stdio MCP server (per the
constitution header; no GUI, no web service).

**Performance Goals**: N/A — runtime-version bump; no perf-critical
change.

**Constraints**:
- All nine constitutional quality gates MUST pass without weakening any
  test, snapshot, lint rule, or typecheck (per FR-008 / SC-004).
- The compiled `argdown-2-mcp` binary's 14-tool surface MUST remain
  identical (per FR / SC-003 and Constitution Principle IV).
- The version bump MUST be atomic — one PR containing the literal
  bump and every co-located reference (per FR-006).
- `CHANGELOG.md` is intentionally excluded from the bump (per the
  spec's Clarifications section and FR-005 amendment).

**Scale/Scope**: One PR, three files touched (`scripts/deno-version`,
`.specify/memory/constitution.md`, `src/pi-package.test.ts`), plus
regenerated `deno.lock` entries and (for a release PR) refreshed
host-target binaries.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --- | --- | --- |
| I. Pipeline Purity (Library-First, Non-Negotiable) | PASS (no impact) | No change to `load`/`validate`/`solve` pipeline; no new typed-failure channel. |
| II. Wire Stability (EDN Theory Tags Are Spec-Frozen) | PASS (no impact) | No change to namespaced theory tags, `SOLVER_TAGS`, or relation-kind registry. |
| III. Test-First, Effect-Composition Discipline | PASS (preserved) | All 51 `Deno.test` calls and the 8 bench fixtures remain in scope; the `sanitizeOps` workaround in `src/pi-package.test.ts:109-131` is still required and is preserved verbatim. |
| IV. End-to-End MCP Coverage (Integration Testing) | PASS (preserved) | `src/mcp/tools.test.ts` and `src/mcp/server.test.ts` are unchanged; the stdio probe (`deno task probe:mcp <bin>`) is exercised against the recompiled binary in [quickstart.md](./quickstart.md) Step 8. |
| V. Builder-as-Authoring, Strict UX Contracts | PASS (no impact) | No change to the 14-tool surface, the JSON shapes, or the atomic-write contract. |
| IX. Technology Constraints & Distribution | PASS (preserved) | Pin moved only; npm allowlist (`zod`, `effect`, `@modelcontextprotocol/sdk`) unchanged; `vendor/edn-parser-js` and `vendor/effect/` are ESM and do not depend on Node-compat surface changes. |
| IX. Development Workflow & Quality Gates | PASS (preserved) | All eleven `deno task` invocations in the constitution's Day-to-day tasks table remain in scope and must pass; the new pin is exercised by `scripts/check-mcp-deno.sh` and `scripts/compile-mcp.sh` before any local or CI gate runs. |

No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/001-upgrade-deno/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── README.md
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── spec.md              # /speckit.specify command output
├── checklists/
│   └── requirements.md  # /speckit.specify command output
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

This feature touches three files in the existing single-project layout.
No new directories are created and no existing directories are
restructured.

```text
scripts/
├── deno-version         # The pin file (line 1 changes from "2.4.5" to "2.9.2")

.specify/memory/
└── constitution.md      # The "currently `2.4.5`" reference in the
                         # Technology Constraints → Runtime paragraph

src/
└── pi-package.test.ts   # The inline comment at lines 109-111 names a
                         # specific Deno version; update to name 2.4.5–2.9.2
```

**Structure Decision**: The project is a single-project TypeScript
library + stdio MCP server (default Option 1). The existing `src/`,
`pi/`, `scripts/`, `plugins/`, `vendor/`, `.github/`, and
`.specify/memory/` layout is preserved verbatim.

## Tasks outline (not the task list — see `/speckit.tasks`)

A high-level preview of the work the task generator will enumerate:

1. **Pin bump.** Edit `scripts/deno-version`: replace `2.4.5` with
   `2.9.2` (single-line literal).
2. **Inline comment refresh.** Edit `src/pi-package.test.ts:109-111`:
   change `Deno 2.4.5 sanitizeOps …` to `Deno 2.4.5–2.9.2 sanitizeOps …`
   (the workaround remains load-bearing; see research.md item 10).
3. **Constitution reference refresh.** Edit
   `.specify/memory/constitution.md` Technology Constraints → Runtime
   paragraph: change `currently 2.4.5` to `currently 2.9.2`. The
   surrounding sentence structure is preserved.
4. **Lockfile regeneration.** Run `deno task check` and
   `deno task compile:mcp` against the host's 2.9.2 — Deno will update
   `deno.lock` automatically where the new resolver produces different
   integrity hashes (e.g., for npm packages with new releases published
   after the lockfile was last frozen). The lockfile schema
   (`version: 5`) is unchanged.
5. **Constitutional gate sweep.** Run every `deno task` listed in
   `quickstart.md` Steps 2–8 on the upgrade branch. Treat any failure
   per FR-010: include the fix in this PR or file a `TODO()` follow-up
   with a clear owner.
6. **Probe the host-target binary.** Confirm the compiled
   `dist/mcp-bin/argdown-2-mcp-<host-triple>` reports all 14 tools on
   its stdio handshake. This is the canonical end-to-end check.

If the PR is intended to ship refreshed native binaries, the Release
workflow handles multi-target compilation and the GitHub Release cut.
The PR itself only needs to refresh the host-target binary if
`dist/mcp-bin/` is checked in (it is not — binaries are build-output).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Table left empty intentionally.

## Out of Scope (per the spec's Clarifications + Assumptions)

- `CHANGELOG.md` — runtime pin bumps are housekeeping.
- `deno.json#version` (package version, `0.2.0-alpha4`) — bumping is a
  release concern, gated by the Release workflow.
- New npm imports (would require an allowlist amendment).
- New `unstable` flag promotion / new TS strict defaults.
- Vendor tree updates (`vendor/edn-parser-js`, `vendor/effect/`) —
  assumed compatible with 2.9.2 (research.md item 8); if the gate sweep
  in step 5 above reveals otherwise, that becomes a follow-up.