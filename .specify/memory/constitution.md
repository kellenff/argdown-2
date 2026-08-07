<!-- Sync Impact Report
- Version change: N/A → 1.0.0 (initial ratification; pre-template placeholder file replaced)
- Modified principles: 5 placeholder slots → 5 concrete principles aligned to observed pipeline
- Added sections: Technology Constraints & Distribution; Development Workflow & Quality Gates
- Removed sections: none (template preserved)
- Deferred items: none — all template placeholders resolved from observed codebase
-->
# argdown-2 Constitution

`argdown-2` is a TypeScript library and stdio MCP server for loading, validating,
and solving EDN argument graphs (grounded Dung, bipolar, evidential, preferred,
stable, complete). The shipped artifact is the `argdown-2-mcp` stdio binary;
there is no GUI or web service. This constitution governs technical decisions
across the library, the CLI, the MCP server, the Claude Code plugin, and the Pi
coding-agent package — all share the same `load → validate → solve` pipeline
and the same quality gates.

## Core Principles

### I. Pipeline Purity (Library-First, Non-Negotiable)

The library is a strict three-stage data pipeline:

1. `load(source)` — strict EDN parse + Zod schema decode + cross-reference
   validation. Returns `Effect<Document, LoadError, never>`. `LoadError =
   EdnError | SchemaError | ValidateError`.
2. `validate(value)` — schema + semantic checks on a pre-parsed value.
   Returns `Effect<Document, SchemaError | ValidateError, never>`.
3. `solve(document)` — post-order evaluation of the component tree.
   Returns `Effect<ComponentSolveResult, SolveError>`. `SolveError = never`
   in v1 by design (the alias reserves the failure channel without
   committing to typed failures).

Public pipeline functions MUST return `Effect` values. The library MUST NOT
throw on any user input. A malformed or invalid document MUST fail with a
tagged error; it MUST NEVER produce a partial document. Builder mutations
(`apply`, `emptyDocument`) return `Effect<AppliedEdit, BuilderError>`;
refusals surface as typed `BuilderCode` values, not exceptions.

Rationale: a pure pipeline with a typed failure channel lets the CLI, the
MCP server, and downstream consumers unwrap at the boundary (`Effect.match`)
without exception-handling logic scattered across call sites.

### II. Wire Stability (EDN Theory Tags Are Spec-Frozen)

The namespaced EDN tags (`casualtheorics.argdown2/document`,
`casualtheorics.argdown2.solver/*`, `casualtheorics.argdown2.argdown/*`,
`casualtheorics.argdown2.aggregate/*`, `casualtheorics.argdown2.observer/*`,
`casualtheorics.argdown2.projection/*`) and the `SOLVER_TAGS` tuple are
**additive**. Removing, renaming, or changing the semantics of any existing
theory tag is a MAJOR-version break for the library and MUST be paired with
a migration entry in `CHANGELOG.md`.

New solver roots (`evidential` in `0.2.0-alpha5`) are added by extending
`SOLVER_TAGS` in `src/model.ts`; consumers cannot invent theory tags without
forking the library. Relation kinds are governed by
`supportedRelationKinds(solver)`; unsupported kinds fail validation with
`semantic/unsupported-relation-kind` and the builder refuses them early
with `builder/unsupported-relation-kind`.

Rationale: the EDN wire format is the contract every downstream tool, skill,
and example depends on. Speculative renaming breaks every consumer in lock
step; additive evolution preserves them.

### III. Test-First, Effect-Composition Discipline (Testing Standards)

Tests are written before code changes (red-green-refactor). The canonical
test pattern is `Effect.runSync(Effect.match(load(source), {...}))` for sync
pipeline code and `Effect.runPromise(Effect.match(effect, {...}))` for async
MCP I/O (`src/test-support.ts:runLoad`, `src/mcp/io.test.ts:runEffectAsync`).
Tests use `@std/testing/bdd` (`describe`/`it`) and `@std/expect`.

Every public function in the pipeline MUST have:

- A positive test covering the success path.
- A negative test for every tagged failure channel it can produce.
  `load` ⇒ `EdnError | SchemaError | ValidateError`; `apply` ⇒ every
  `BuilderCode` (`builder/invalid-id`, `builder/duplicate-id`,
  `builder/missing-id`, `builder/unsupported-relation-kind`,
  `builder/unsupported-solver`, `builder/invalid-projection-bounds`); MCP
  I/O ⇒ every `McpIoError` (`Read`, `Write`, `Parse`).
- A parity test when the function maps to a known external reference
  (`examples/argdown1-censorship.edn` is the canonical fixture).

Snapshots for CLI output formats live in `src/cli/__snapshots__/` and are
updated by setting `UPDATE_SNAPSHOTS=1` (`src/cli/snapshots.test.ts:30-33`).

Rationale: typed failure channels are only safe when every channel is
exercised by a test; otherwise the typed union silently rots.

### IV. End-to-End MCP Coverage (Integration Testing)

The MCP server is **not** a separate code path. Every one of the 14 builder
tools (`create_document`, `add_statement`, `update_statement`, `add_argument`,
`add_inference`, `add_relation`, `add_solver`, `set_import`, `remove_import`,
`remove_element`, `remove_relation`, `list_elements`, `validate`, `solve`)
calls the same `load` / `validate` / `solve` / `apply` pipeline as the
library. Therefore:

- Every tool MUST have a round-trip test in `src/mcp/tools.test.ts`
  (path mode + source mode where the tool accepts a document ref).
- The server MUST have an in-memory handshake test in
  `src/mcp/server.test.ts` that verifies the tool registry matches the
 14-tool contract and that `create_document` + `add_statement` round-trip
  succeeds end to end.
- The compiled binary MUST pass `deno run -A scripts/probe-mcp-stdio.ts
 <bin>` before any release. This is wired into `.github/workflows/ci.yml`
  (`Probe host MCP binary`) and `.github/workflows/release.yml` (`Probe
 Linux MCP binary`).
- MCP tool names are a stable contract. Renaming a tool requires a
  deprecation bridge and a CHANGELOG entry.

Rationale: a builder refactor that breaks the library but is caught only
by unit tests would still ship a broken MCP binary; the stdio probe is
the only check that exercises the actual shipped artifact.

### V. Builder-as-Authoring, Strict UX Contracts (UX Consistency)

EDN graphs are mutated exclusively through the 14 builder MCP tools and
the builder's library surface (`apply`, `emptyDocument`). **Hand-editing
`.edn` files is forbidden** in `README.md` (Claude Code and Pi install
sections), the Claude Code plugin docs, and the Pi skill prompts. This
rule exists because the builder performs identity resolution (prose → id
slugification), interface repair (`repairInterface`), and refusal checks
that hand-written EDN will silently bypass.

User-experience contracts enforced across all surfaces:

- **Document refs.** Every tool that takes a document accepts exactly one
  of `path` (filesystem `.edn`, atomic write via temp + rename) or `source`
  (full text, returns updated text). Both are refused with `mcp/invalid-ref`
  if both or neither are provided.
- **Atomic write.** Path-mode mutations MUST write to
  `.${Date.now()}.argdown-2.tmp` and `rename` to the target
  (`src/mcp/io.ts:saveDocumentRefEffect`). Partial writes on disk are a
  data-loss bug.
- **Mutation response shape.** Success: `{ ok: true, warnings, diff,
 path|source }`. Builder refusal: `{ ok: false, refused: { code, message
 }, warnings, diff }`. I/O or load failure: `{ ok: false, errors }`. The
  JSON shape is a contract; consumers depend on it (`src/mcp/tools.ts`).
- **Solver semantics.** There is no `--semantics` CLI flag. Solver choice
  is read from each component's tag
  (`#casualtheorics.argdown2.solver/<name>`). This applies uniformly to
  the library, the CLI, and the MCP `solve` tool.
- **CLI exit codes.** `0` success; `1` parse / validation / solve error
  (diagnostics on stderr); `2` usage error (unknown flag, missing path,
  unknown subcommand).
- **CLI formats.** Solve output is one of `table | dot | mermaid | json`
  (default `table`). Each format has a snapshot in
  `src/cli/__snapshots__/mixed-semantics.<format>.txt`.
- **Refusals are typed, not silent.** Builder refusals fail fast; the
  MCP client receives a typed `BuilderCode` rather than a stringly-typed
  error or, worse, a partial document.

Rationale: agent-driven authoring depends on predictable, typed, atomic
mutation; UX drift here silently corrupts downstream graphs.

## Technology Constraints & Distribution

- **Runtime.** Deno is the only day-to-day runtime. Version is pinned in
  `scripts/deno-version` (currently `2.4.5`) and consumed by both
  `setup-deno@v2` and the host-target compile script
  (`scripts/compile-mcp.sh`). The MCP binary is compiled directly from
  `src/mcp/cli.ts`; **no bundler step** (no esbuild, no tsdown, no
  separate bundled entrypoint).
- **TypeScript.** `compilerOptions.strict = true` and
  `noImplicitAny = true`. JSR slow-types MUST remain clean; CI runs
  `deno task publish:dry-run` in the `dry-run-publish` job and the
  package MUST pass.
- **npm allowlist.** `deno.json` imports MAY declare only
  `npm:zod@`, `npm:effect@`, `npm:@modelcontextprotocol/sdk@`
  (with or without the leading `/`). Any other `npm:` specifier fails
  CI (`scripts/check-npm-allowlist.sh`, enforced by
  `src/npm-allowlist.test.ts`).
- **EDN parser.** `edn-parser-js` is vendored at
  `./vendor/edn-parser-js/lib/index.js`; do **not** import it from npm.
  Vendor updates are a deliberate change, not a routine bump.
- **Lint baseline.** `deno task lint` runs `deno lint src scripts pi`
  with the following rules excluded: `no-sloppy-imports`,
  `require-await`. Any new rule exclusion requires a CHANGELOG note.
- **Distribution channels.**
  - Library: JSR (`@casualtheorics/argdown-2`). Every merge to `main`
    publishes a `*-dev.{utcTimestamp}` prerelease
    (`.github/workflows/release.yml:publish-jsr-dev`).
  - Native MCP binaries: GitHub Releases only, for `x86_64-apple-darwin`,
    `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`,
    `aarch64-unknown-linux-gnu`. Stable release is triggered by a
    `deno.json` version bump and a matching `scripts/argdown-2-mcp.version`
    (enforced by `release.yml:Verify launcher pin matches deno.json version`).
  - Pi coding agent: root `package.json` (name `argdown-2-pi`,
    `pi-package` keyword) plus `pi/extensions/argdown-2-mcp.ts`. Unix only.
  - Claude Code: `.claude-plugin/marketplace.json` and `plugins/argdown-2/`
    with the shared launcher copy and skills. The plugin launcher copy
    MUST stay byte-equivalent to canonical `scripts/argdown-2-mcp` and
    `scripts/argdown-2-mcp.version` (enforced by
    `src/claude-plugin.test.ts` and `src/pi-package.test.ts`).
- **Launcher behavior.** `bash scripts/argdown-2-mcp` resolves in this
  order: `ARGDOWN2_MCP_BIN` override → versioned `XDG_CACHE_HOME`
  cache → download with `sha256sums.txt` verification → `exec`. The
  launcher test (`scripts/argdown-2-mcp.test.sh`) covers all four paths
  including checksum mismatch and unsupported OS.

## Development Workflow & Quality Gates

Day-to-day tasks (`deno.json`) — all MUST pass on every PR:

| Task | Purpose |
| --- | --- |
| `test` | `deno test -A --frozen --parallel src/` |
| `check` | `deno check --frozen src/index.ts src/mcp/cli.ts` |
| `lint` | `deno lint src scripts pi` |
| `fmt` / `fmt:check` | `deno fmt` / `--check` over `src scripts pi` |
| `mcp` | `deno run -A src/mcp/cli.ts` (stdio from source) |
| `compile:mcp` | `bash scripts/compile-mcp.sh` (host target) |
| `check:mcp-deno` | Sanity check the MCP Deno entry compiles |
| `probe:mcp` | `deno run -A scripts/probe-mcp-stdio.ts <bin>` |
| `cli` | `deno run -A src/cli.ts` |
| `check:cli-deno` | `deno check --frozen src/cli.ts` |
| `check:npm-allowlist` | Enforces npm-import allowlist (see above) |
| `publish:dry-run` | `deno publish --dry-run --allow-dirty` (slow-types) |

**Pull-request CI** (`.github/workflows/ci.yml`) runs every gate above
plus compiles the host MCP binary and probes it. The `dry-run-publish`
job runs `deno task publish:dry-run`. **A PR that fails any gate is not
mergeable.**

**Release CI** (`.github/workflows/release.yml`) runs the same gates on
`main`, then always publishes a JSR `*-dev.*` prerelease. A
`deno.json` version bump (detected vs `HEAD~1`) triggers a stable
release: launcher-pin check, multi-target compile, Linux probe,
checksum generation, GitHub Release with the four binaries and
`sha256sums.txt`, and a stable JSR publish (tolerating "already
published").

**Test discipline for solver / reduce changes.** Changes to any file in
`src/{grounded,multi-extension,reduce-*,component-eval,model,validate,schema}.ts`
MUST add or update a fixture-driven test in `src/bench.fixtures/` (the
eight committed fixtures: `small-minimal`, `small-relations`,
`small-argument`, `medium-censorship`, `heavy-attacks`,
`deep-arguments`, `large-stress`, `mixed-semantics`). The
`mixed-semantics` fixture doubles as the CLI snapshot driver. A future
automated bench harness is allowed; the regression coverage is not.

**Pre-release smoke test.** MCP changes MUST be exercised via
`deno task mcp` followed by `create_document` → `add_statement` →
`add_relation` → `solve`. This is the canonical end-to-end check
(AGENTS.md §"MCP server smoke test") and complements the binary probe.

**Code style.** `.editorconfig` mandates UTF-8, LF, 2-space indent,
final newline. TypeScript imports use `.js` extensions
(`./schema.js` not `./schema.ts`) per Deno's ESM conventions. The
Vitest config files (`vitest.config.ts`, `vitest.mutation.config.ts`)
are legacy artifacts and MUST NOT be introduced as a runner.

## Governance

- **Authority.** This constitution supersedes `AGENTS.md`, `README.md`,
  individual skill prompts, and ad-hoc conventions where they conflict.
  Where it is silent, `AGENTS.md` is the runtime development guidance
  and `README.md` is the user-facing contract.
- **Amendment procedure.**
  1. Open a PR that edits `.specify/memory/constitution.md`.
  2. Update the version footer and prepend a `<!-- Sync Impact Report -->`
     comment summarizing the version bump rationale, modified
     principles, added/removed sections, and any deferred items.
  3. Bump `CONSTITUTION_VERSION` per semantic versioning:
     - **MAJOR** — remove or redefine an existing principle, change a
       non-negotiable rule, or alter a wire-stability commitment.
     - **MINOR** — add a new principle or section, or materially expand
       guidance for an existing one.
     - **PATCH** — clarifications, typo fixes, non-semantic refinements.
  4. If a principle change conflicts with current code, the PR MUST
     either ship the corresponding code change in the same PR or carry
     a `TODO(<PRINCIPLE>): explanation` follow-up.
- **Compliance review.** PR review MUST verify:
  - `deno task test`, `deno task lint`, `deno task fmt:check`,
    `deno task check`, `deno task check:npm-allowlist`,
    `deno task check:mcp-deno`, and (for MCP-touching changes)
    `deno task probe:mcp` all pass.
  - `deno task publish:dry-run` passes for any change to
    `src/index.ts` or the public type re-exports.
  - `src/bench.fixtures/` is updated for solver/reduce changes.
  - Tool names and MCP JSON shapes are not changed silently.
  - New `BuilderCode` values are added to the exhaustive list above and
    tested.
- **Complexity budget.** Library surface changes that add public types,
  new solver tags, or new MCP tools require a CHANGELOG entry under
  `[Unreleased]` in the same PR. Builder complexity is justified per
  branch (`apply.ts` switch cases are documented in their `invalidId`
  / `invalidIdList` / `refuse` helpers).

**Version**: 1.0.0 | **Ratified**: 2026-08-07 | **Last Amended**: 2026-08-07
