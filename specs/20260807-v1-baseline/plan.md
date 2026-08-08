# Implementation Plan: argdown-2 v1 Baseline (Constitution-Aligned)

**Branch**: `[20260807-v1-baseline]` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/20260807-v1-baseline/spec.md`

## Summary

This plan validates that the existing `argdown-2` codebase at `0.2.0-alpha4`
satisfies all 17 functional requirements in `spec.md` and produces a
verifiable baseline for v1.0.0 release gate. The plan produces no new
code; it generates **validation artifacts** that map every FR to a
concrete observable check, every acceptance scenario to a runnable test,
and every constitutional principle to an auditable artifact.

The technical approach is a **survey-and-prove** pass: confirm each FR's
existence in the current source tree (positive case) and confirm each
failure channel is exercised by a test (negative case), then commit the
artifacts as a one-time audit baseline. Any FR not satisfied is
recorded as a v1 release blocker in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 6.0.3 (bundled in Deno 2.9.2);
`compilerOptions.strict = true`, `noImplicitAny = true`. No `tsconfig`;
everything goes through `deno.json#compilerOptions`.

**Primary Dependencies**:
- Deno std: `@std/assert@1`, `@std/expect@1`, `@std/testing/bdd` (from `jsr:@std/testing@1`).
- `npm:zod@4.4.3` — EDN schema decoding (Constitution IX: allowlisted).
- `npm:effect@^4.0.0-beta.101` — typed-failure pipeline (Constitution IX: allowlisted).
- `npm:@modelcontextprotocol/sdk@1.29.0` — MCP server runtime (Constitution IX: allowlisted).
- `jsr:@optique/core@^1.2.0`, `jsr:@optique/run@^1.2.0` — CLI argument parser.
- Vendored: `./vendor/edn-parser-js/lib/index.js` (ESM);
  `./vendor/effect/` (ESM `npm:effect@4.0.0-beta.101` source).

**Storage**: N/A — no persistent storage is introduced or modified.
Documents live in `.edn` files at user-chosen filesystem paths.
Atomic-write guarantees are enforced in `src/mcp/io.ts`.

**Testing**: `deno test -A --frozen --parallel src/` (the canonical
`test` task). 51 `Deno.test` calls; snapshot tests gated by
`UPDATE_SNAPSHOTS=1`. Eight bench fixtures in `src/bench.fixtures/`.

**Target Platform**: Deno runtime on four host triples:
`x86_64-apple-darwin`, `aarch64-apple-darwin`,
`x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` (per
`scripts/compile-mcp.sh:12-17`). Consumer launcher is bash + macOS/Linux;
Windows is out of scope.

**Project Type**: TypeScript library + stdio MCP server (per
constitution header). No GUI, no web service, no CLI binary shipped
(the MCP server is the only shipped binary).

**Performance Goals**: N/A for this plan. The spec introduces no new
code paths; performance is bounded by the existing pipeline which has
no SLOs beyond "completes in user-visible time" (FR/SC-001).

**Constraints**:
- All 10 constitutional quality gates MUST pass on every PR (no test
  or snapshot may be weakened to make a gate pass).
- The compiled `argdown-2-mcp` binary's 14-tool surface MUST remain
  byte-identical to the source run.
- Distribution channels MUST stay within the four enumerated in FR-011.
- npm allowlist MUST stay at exactly three packages
  (`zod`, `effect`, `@modelcontextprotocol/sdk`).
- `CHANGELOG.md` MUST NOT gain an entry for this plan (it is a
  validation artifact, not a release).
- The `sanitizeOps: false` workaround in
  `src/pi-package.test.ts:109-131` MUST remain load-bearing on
  Deno 2.9.2 and MUST NOT be deleted by this plan.

**Scale/Scope**: One branch, one spec directory, five validation
artifacts (`plan.md`, `research.md`, `data-model.md`, `quickstart.md`,
`contracts/`). No `src/` files are touched. The plan produces a
baseline snapshot against which future PRs are measured.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
| --- | --- | --- |
| I. Pipeline Purity (Library-First, Non-Negotiable) | PASS (no impact) | `load`/`validate`/`solve` already return `Effect` with tagged failures; this plan produces no code. |
| II. Wire Stability (EDN Theory Tags Are Spec-Frozen) | PASS (no impact) | No tag rename, no new tag; this plan documents the existing registry. |
| III. Test-First, Effect-Composition Discipline | PASS (preserved) | Eight bench fixtures remain canonical; no test is added or weakened. |
| IV. End-to-End MCP Coverage (Integration Testing) | PASS (preserved) | `src/mcp/tools.test.ts` and `src/mcp/server.test.ts` remain the canonical MCP test surface; this plan documents their coverage map. |
| V. Builder-as-Authoring, Strict UX Contracts | PASS (no impact) | No new tool, no new response shape; the 14-tool contract is documented in `contracts/mcp-tools.md`. |
| IX. Technology Constraints & Distribution | PASS (preserved) | Pin stays at Deno 2.9.2; npm allowlist stays at three packages; vendor/ stays canonical. |
| IX. Development Workflow & Quality Gates | PASS (preserved) | All `deno task` invocations remain in scope; no gate is weakened. |

No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/20260807-v1-baseline/
├── plan.md              # This file
├── research.md          # Phase 0 output — FR coverage audit + decisions
├── data-model.md        # Phase 1 output — entities (Document, Solver Component, Boundary, etc.)
├── quickstart.md        # Phase 1 output — runnable validation scenarios per SC
├── contracts/           # Phase 1 output — interface contracts
│   ├── README.md        # Index of contracts
│   ├── library-api.md   # load / validate / solve / parseCandidate / apply / emptyDocument
│   ├── mcp-tools.md     # The 14-tool registry contract
│   ├── cli-surface.md   # Argument parser + exit codes + output formats
│   ├── launcher.md      # bash scripts/argdown-2-mcp resolution order + refusal semantics
│   └── distribution.md  # JSR / GitHub Releases / Claude Code marketplace / Pi package
├── spec.md              # From /speckit.specify
├── checklists/
│   └── requirements.md  # Spec quality checklist (already passed)
└── tasks.md             # NOT created by /speckit.plan
```

### Source Code (repository root)

```text
argdown-2/
├── src/                          # Library + MCP + CLI source
│   ├── index.ts                  # Public API re-exports (load, validate, solve, apply, etc.)
│   ├── cli.ts                    # @optique/run entry point
│   ├── model.ts                  # Document / SolverComponent / Boundary / SOLVER_TAGS
│   ├── schema.ts                 # Zod schema decode (decodeWire)
│   ├── validate.ts               # Cross-reference validator
│   ├── edn.ts                    # EDN read/write helpers
│   ├── component-eval.ts         # Bottom-up component evaluation
│   ├── grounded.ts               # Grounded solver
│   ├── reduce-dung.ts            # Dung attack reduction
│   ├── reduce-bipolar.ts         # Bipolar solver reduction
│   ├── reduce-evidential.ts      # Evidential solver reduction
│   ├── multi-extension.ts        # Preferred / stable / complete
│   ├── builder/                  # Effect-native builder
│   ├── cli/                      # CLI dispatch + formatters
│   ├── mcp/                      # MCP server + io + tools
│   └── *.test.ts                 # Co-located tests
├── examples/                     # EDN reference fixtures
├── scripts/                      # Launcher + compile + check scripts
├── plugins/argdown-2/            # Claude Code plugin (mirrors canonical scripts/)
├── pi/                           # Pi coding-agent package
├── .claude-plugin/               # Marketplace manifest
├── deno.json                     # Tasks, imports, compilerOptions
├── deno.lock                     # Dependency lockfile (version: 5)
├── package.json                  # Pi package manifest
├── mcp.json                      # Raw MCP client config example
└── .github/workflows/            # ci.yml, release.yml
```

**Structure Decision**: Single project layout (Option 1). No new
projects, no new packages, no frontend/backend split. The shipped
artifact is the stdio MCP binary; the library is consumed via JSR;
the CLI is a developer convenience. The validation artifacts in
`specs/20260807-v1-baseline/` are siblings to existing `specs/001-upgrade-deno/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No entries — Constitution Check passed cleanly. The plan produces
only documentation; no code is added, removed, or restructured.
