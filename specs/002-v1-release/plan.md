# Implementation Plan: Cut argdown-2 v1.0.0 Release

**Branch**: `[002-v1-release]` | **Date**: 2026-08-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-v1-release/spec.md`

## Summary

Convert the current `0.2.0-alpha4` artifact into a stable `1.0.0`
artifact across every distribution channel: JSR library, four native
MCP binaries on GitHub Releases, Claude Code marketplace, Pi
coding-agent package, and the embedded MCP server version string.
The plan executes the six pinned version-string updates required for
distribution parity (FR-001 through FR-006), closes the
`[Unreleased]` CHANGELOG block under a dated `[1.0.0] - 2026-08-07`
section (FR-007), runs every Deno quality gate on the bumped commit
(FR-008 / SC-005), compiles four native MCP binaries (FR-009),
probes the Linux binary (FR-010), generates `sha256sums.txt`
(FR-011), creates the GitHub Release (FR-012), and publishes the
JSR stable version (FR-013). No new functionality ships — this is a
stability boundary cut (FR-014). README refresh is deferred to a
separate fresh grfp run (FR-015 / Q2).

## Technical Context

**Language/Version**: Deno 2.9.2 (pinned in `scripts/deno-version`,
consumed by `setup-deno@v2` and `scripts/compile-mcp.sh`);
TypeScript with `compilerOptions.strict = true` and
`noImplicitAny = true`.

**Primary Dependencies** (unchanged by this cut — all already in
`deno.json#imports`):
- `npm:effect@^4.0.0-beta.101` (runtime)
- `npm:zod@4.4.3` (schema decode)
- `npm:/@modelcontextprotocol/sdk@1.29.0/` (MCP stdio)
- `jsr:@optique/core@^1.2.0` and `jsr:@optique/run@^1.2.0` (CLI parser)
- `jsr:@std/assert@1`, `jsr:@std/expect@1`, `jsr:@std/testing@1` (tests)
- `edn-parser-js` vendored at `./vendor/edn-parser-js/lib/index.js`

**Storage**: N/A (no new data; the cut touches existing text/JSON
files only).

**Testing**: `deno test -A --frozen --parallel src/` (the `test`
task in `deno.json`); `@std/testing/bdd` (`describe`/`it`) and
`@std/expect`. Vitest config files at repo root are legacy and
MUST NOT be used.

**Target Platform** (per FR-009):
- Library: any Deno target via JSR.
- Native MCP binaries: `x86_64-apple-darwin`,
  `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`,
  `aarch64-unknown-linux-gnu` (compiled by
  `scripts/compile-mcp.sh --all`).

**Project Type**: library + CLI + MCP stdio server + Claude Code
plugin + Pi package (no type change from this cut).

**Performance Goals**:
- SC-002 implies a sub-60s `bash scripts/argdown-2-mcp` first-run
  on a typical broadband connection (the launcher test suite
  `scripts/argdown-2-mcp.test.sh` already exercises all four
  launcher paths).
- No other performance target applies — this cut is text-only
  except for the binary compile step, which is bounded by the
  existing `compile-mcp.sh` invocation.

**Constraints**:
- npm allowlist is closed: only `zod`, `effect`,
  `@modelcontextprotocol/sdk` may be imported (Constitution
  §"Technology Constraints & Distribution"); the cut does not add
  any new imports, so the allowlist is untouched.
- No MCP bundler step (Constitution §"Technology Constraints &
  Distribution"); binaries are compiled directly from
  `src/mcp/cli.ts`.
- Lint baseline (`deno task lint`) MUST stay clean; the cut does
  not add new rules or new exclusions.
- The four binaries MUST be compiled with the same Deno release
  pinned by `scripts/deno-version` (`compile-mcp.sh:7-8, 30-33`
  enforces `deno --version == $DENO_VERSION`).

**Scale/Scope**:
- 6 files touched for version pins:
  `deno.json`, `scripts/argdown-2-mcp.version`,
  `plugins/argdown-2/scripts/argdown-2-mcp.version` (which must
  stay byte-equivalent to its canonical sibling),
  `plugins/argdown-2/.claude-plugin/plugin.json`, root
  `package.json` (+ regenerated `package-lock.json`), and
  `src/mcp/server.ts` (the embedded MCP server version).
- 1 file for CHANGELOG closure (`CHANGELOG.md`).
- 0 files for code changes (FR-014).
- 0 files for README (FR-015 / Q2 deferred to grfp run).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1
design.*

| # | Principle | Applies to this cut? | Plan compliance |
|---|-----------|----------------------|-----------------|
| I | Pipeline Purity (library never throws, returns Effects) | Indirectly — cut doesn't change library surface | ✓ No code change to `src/` |
| II | Wire Stability (EDN theory tags frozen, additive) | Directly — `1.0.0` is the wire-stability boundary | ✓ Cut uses SemVer MAJOR (`0.2.0-alpha4` → `1.0.0`) per Constitution §II; CHANGELOG entry names the boundary explicitly |
| III | Test-First, Effect-Composition Discipline | Indirectly — parity tests in `src/claude-plugin.test.ts` and `src/pi-package.test.ts` already exist and enforce version-pin parity | ✓ FR-008 requires `deno task test` to pass; FR-015 forbids new code |
| IV | End-to-End MCP Coverage (14 tools, stdio probe) | Directly — `deno task probe:mcp` is the gate | ✓ FR-010 runs probe against Linux binary; FR-011 confirms 4 binaries compile; the 14-tool contract is unchanged from `0.2.0-alpha4` |
| V | Builder-as-Authoring UX Contracts | N/A — no UX surface change | ✓ N/A |
| Tech | Constraints & Distribution (npm allowlist, no bundler, lint baseline, channel matrix) | Directly — the cut must not widen the allowlist, must not introduce a bundler step, must keep the binary target matrix intact | ✓ Cut uses only the existing channels and tools; no `npm:` specifier is added |
| Workflow | Quality Gates (test, lint, fmt, check, npm-allowlist, mcp-deno, publish:dry-run) | Directly — every gate must pass on the bumped commit | ✓ FR-008 enumerates every gate; SC-005 confirms green CI before merge |
| Governance | CHANGELOG entry required for surface changes | Directly — the cut is itself a CHANGELOG entry | ✓ FR-007 creates the `[1.0.0] - 2026-08-07` section with full content previously under `[Unreleased]` |

**Gate outcome**: All gates pass without violation. No entry needed
in "Complexity Tracking" below.

*Post-design re-check (after Phase 1)*: All gates remain passing.
The contracts in [`contracts/`](contracts/) document four external
contracts (version-pin parity, binary asset bundle, GitHub Release,
JSR stable publish); none introduce new dependencies, new
bundling steps, new tool surface, or new lint rules. The
Constitution §"Complexity budget" exception does not apply — the
cut is a stability boundary, not a complexity addition (FR-014).

## Project Structure

### Documentation (this feature)

```text
specs/002-v1-release/
├── plan.md              # This file
├── research.md          # Phase 0 output (cut-mechanics research)
├── data-model.md        # Phase 1 output (Release / Version pin / Native MCP binary)
├── quickstart.md        # Phase 1 output (end-to-end release validation)
├── contracts/           # Phase 1 output (version-pin parity, binary asset bundle, checksums)
├── checklists/
│   └── requirements.md  # Already exists from /speckit.specify
└── tasks.md             # Phase 2 output — NOT created by /speckit.plan
```

### Source Code (repository root)

The cut does not introduce or remove source files. It touches:

```text
.
├── deno.json                                  # version: 0.2.0-alpha4 → 1.0.0
├── package.json                               # version: 0.2.0-alpha4 → 1.0.0
├── package-lock.json                          # regenerated from package.json
├── CHANGELOG.md                               # [Unreleased] → [1.0.0] - 2026-08-07
├── plugins/argdown-2/
│   ├── .claude-plugin/plugin.json             # version: 0.2.0-alpha4 → 1.0.0
│   └── scripts/argdown-2-mcp.version          # 0.2.0-alpha4 → 1.0.0
├── scripts/
│   ├── argdown-2-mcp.version                  # 0.2.0-alpha4 → 1.0.0
│   ├── compile-mcp.sh                         # unchanged (used as-is)
│   ├── argdown-2-mcp.test.sh                  # unchanged (existing test)
│   ├── probe-mcp-stdio.ts                     # unchanged (existing probe)
│   ├── check-mcp-deno.sh                      # unchanged
│   └── check-npm-allowlist.sh                 # unchanged
├── src/mcp/server.ts                          # embedded version constant 0.2.0-alpha4 → 1.0.0
├── .github/workflows/release.yml              # unchanged (used as-is)
└── dist/mcp-bin/                              # produced by compile-mcp.sh --all (gitignored)
    ├── argdown-2-mcp-x86_64-apple-darwin
    ├── argdown-2-mcp-aarch64-apple-darwin
    ├── argdown-2-mcp-x86_64-unknown-linux-gnu
    ├── argdown-2-mcp-aarch64-unknown-linux-gnu
    └── sha256sums.txt
```

**Structure Decision**: The cut is a release-process operation on
the existing repository layout. No new directories, no new files
outside `dist/mcp-bin/` (which is the canonical artifact directory
already used by `scripts/compile-mcp.sh:9`). The repository already
implements the four-channel distribution surface (Constitution
§"Technology Constraints & Distribution") and the cut only
synchronizes version strings across that surface.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be
> justified.

No violations. Section intentionally empty.