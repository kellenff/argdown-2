# Feature Specification: argdown-2 v1 Baseline (Constitution-Aligned)

**Feature Branch**: `[20260807-v1-baseline]`
**Created**: 2026-08-07
**Status**: Draft
**Input**: User description: "create a spec that aligns with the current featureset"

> This is a **baseline spec**: it documents the user-visible surface
> that `argdown-2` v1.0.0 must deliver. Every user story is mapped to
> one or more principles in `.specify/memory/constitution.md` (v1.0.0)
> in the **Constitution Cross-Reference** appendix at the end of this
> document. The spec is **prospective gate material**, not a
> retrospective description of what shipped in `0.2.0-alpha4`: any
> principle not satisfied by the current alpha is a v1 release blocker.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Load and validate an EDN argument graph safely (Priority: P1)

As a downstream library consumer, I want to load an EDN argument graph
from a string and get a typed `Document` back, with all malformed input
surfacing as a tagged error rather than a thrown exception or a partial
document.

**Why this priority**: `load` is the single entry point for every
consumer (library, CLI, MCP server). A user who cannot trust the
return shape cannot use the library safely.

**Independent Test**: Run `Effect.runSync(Effect.match(load(source),
{ onFailure, onSuccess }))` against a syntactically valid EDN document
and confirm `onSuccess` is invoked with a `Document`. Run it against
malformed EDN, a Zod schema violation, and a broken cross-reference and
confirm `onFailure` is invoked with the right tagged union member each
time (`EdnError`, `SchemaError`, `ValidateError`).

**Acceptance Scenarios**:

1. **Given** a syntactically valid EDN string that decodes to a tagged document map, **When** I call `load(source)`, **Then** the Effect succeeds with a `Document` and no partial state is observable.
2. **Given** an EDN string with unbalanced brackets, **When** I call `load(source)`, **Then** the Effect fails with an `EdnError` carrying a `Diagnostic` whose path points at the offending form.
3. **Given** an EDN value whose root is not a `#casualtheorics.argdown2/document` map, **When** I call `validate(value)`, **Then** the Effect fails with a `SchemaError`.
4. **Given** an EDN document whose `:root` references an `:elements` ID that does not exist, **When** I call `load(source)`, **Then** the Effect fails with a `ValidateError` whose `Diagnostic.path` is a semantic path (e.g. `[:elements, 3, ':to']`).

---

### User Story 2 — Solve a graph with one of six solvers and get a typed result (Priority: P1)

As a user, I want to compute argument labels (or extensions) by
choosing a solver root tag, and get back per-component `native`,
`aggregate`, `boundary`, `children`, and `warnings` layers without
guessing the result shape.

**Why this priority**: `solve` is the system's reason for being. Every
graph flows through it, and its result shape is consumed by the CLI
formaters, the MCP `solve` tool, and downstream skill prompts.

**Independent Test**: Run `Effect.runSync(solve(document))` on a
`medium-censorship` fixture with `grounded` and confirm `.native.kind
=== 'labels'`. Run it on the same fixture with `bipolar` and confirm
the label for `:a` is `in` (deductive support). Run it with
`preferred` and confirm `.native.kind === 'extensions'` with at least
one extension. Run it on a self-attacking argument and confirm `undec`
is emitted rather than throwing.

**Acceptance Scenarios**:

1. **Given** a document whose `:root` is `#casualtheorics.argdown2.solver/grounded`, **When** I call `solve(document)`, **Then** `.native` is `{ kind: 'labels', values: Map<EntityId, Label> }` where `Label = 'in' | 'out' | 'undec'`.
2. **Given** a document whose `:root` is `#casualtheorics.argdown2.solver/preferred`, **When** I call `solve(document)`, **Then** `.native` is `{ kind: 'extensions', values: Set<Set<EntityId>> }`.
3. **Given** a solver that does not support a relation kind present in `:elements` (e.g. `support` under `grounded`), **When** I call `load(source)` on it, **Then** the Effect fails with a `ValidateError` carrying the diagnostic `semantic/unsupported-relation-kind`.
4. **Given** a malformed argument (cycle, self-attack), **When** I call `solve(document)`, **Then** the Effect still succeeds; the result carries `Label = 'undec'` for the affected arguments and a `warnings` array otherwise.

---

### User Story 3 — Trust the EDN theory tag registry to be additive and spec-frozen (Priority: P1)

As a downstream consumer who imports `SOLVER_TAGS` and the namespaced
EDN tags from `jsr:@casualtheorics/argdown-2`, I want to be guaranteed
that no existing tag is renamed, removed, or semantically changed
without a major version bump and a `CHANGELOG.md` migration entry.

**Why this priority**: the EDN wire format is the contract every
consumer, skill, and example depends on. A silent renaming breaks
every consumer in lock step.

**Independent Test**: Import the public tag constants from the JSR
package, diff the list against the in-repo registry, and confirm zero
divergence. Read `CHANGELOG.md` and confirm there is no
tag-rename entry under `[Unreleased]` (which would mean a v1 release
blocker).

**Acceptance Scenarios**:

1. **Given** the published JSR `@casualtheorics/argdown-2` package, **When** I read the tag constants `DOCUMENT_TAG`, `SOLVER_TAGS`, and the `argdown/*` constants, **Then** they match the namespaced strings declared in `src/model.ts`.
2. **Given** a new solver root is proposed for v1, **When** it is added, **Then** it is added to `SOLVER_TAGS` (not a fork); existing tags are untouched; `CHANGELOG.md` gains an `[Unreleased]` entry describing the addition.
3. **Given** a relation kind (`support`) that is consumed by `bipolar` and `evidential` but not `grounded`, **When** I add a `support` relation under a `grounded` root, **Then** validation fails with `semantic/unsupported-relation-kind` and the builder refuses with `builder/unsupported-relation-kind` — no silent omission.

---

### User Story 4 — Mutate graphs only through the 14 builder MCP tools (Priority: P1)

As an agent or skill author, I want a single, typed, atomic mutation
surface so that identity resolution, interface repair, and refusal
checks cannot be bypassed by hand-editing an `.edn` file.

**Why this priority**: agent-driven authoring depends on predictable,
typed, atomic mutation. UX drift here silently corrupts downstream
graphs.

**Independent Test**: From any MCP client, call `create_document` →
`add_statement` → `add_relation` → `solve` and confirm each call
returns the documented JSON shape and the on-disk `.edn` (if path mode)
is updated atomically. Hand-edit the file between calls and confirm
the next mutation surfaces a `ValidateError` rather than silently
corrupting state.

**Acceptance Scenarios**:

1. **Given** a fresh filesystem path with no existing `.edn` file, **When** I call `create_document` with `path`, **Then** the file is created with the canonical empty document template and a `path` echo in the response.
2. **Given** a `path` mode mutation, **When** the underlying write fails mid-stream, **Then** the original file on disk is unchanged (atomic temp + rename via `src/mcp/io.ts:saveDocumentRefEffect`).
3. **Given** a builder refusal (e.g. duplicate ID), **When** the tool returns, **Then** the response is `{ ok: false, refused: { code: 'builder/duplicate-id', message }, warnings, diff }` and the document on disk is unchanged.
4. **Given** both `path` and `source` are passed to a mutating tool, **When** the tool runs, **Then** it returns `mcp/invalid-ref` and does not mutate.

---

### User Story 5 — Use the same 14-tool MCP surface from any agent (Priority: P1)

As an MCP client user, I want every one of the 14 builder tools to be
available, byte-identically named, and producing byte-identical JSON
shapes whether I run the source (`deno task mcp`), the compiled host
binary, or the four release binaries — and whether the client is
Claude Code, Pi, or any stdio MCP client.

**Why this priority**: the tool registry is the contract every agent
integration depends on. Drift between source and binary is a silent
production break.

**Independent Test**: Run `deno task probe:mcp ./dist/mcp-bin/argdown-2-mcp-<host>`
and confirm the probe reports all 14 tools present and a healthy
handshake. Run the same probe against the four release binaries and
confirm identical results. Compare the source-run tool list and the
binary tool list via `claude plugin validate .` / `pi install --dry-run`.

**Acceptance Scenarios**:

1. **Given** the canonical tool list, **When** any MCP client enumerates the server's tools, **Then** the 14 names (`create_document`, `add_statement`, `update_statement`, `add_argument`, `add_inference`, `add_relation`, `add_solver`, `set_import`, `remove_import`, `remove_element`, `remove_relation`, `list_elements`, `validate`, `solve`) are present in the listed order.
2. **Given** the source run (`deno task mcp`), **When** I probe the handshake, **Then** it is byte-identical to the probe of the host compiled binary.
3. **Given** a `tools/list` response from any of the four release binaries, **When** I compare its JSON shape to the source-run response, **Then** they are structurally identical (same keys, same value types).

---

### User Story 6 — Install via Deno, Claude Code, Pi, or raw MCP client (Priority: P1)

As a user on macOS or Linux (x86_64 or aarch64), I want to install the
library or the MCP server with a single command, and have the launcher
verify binary integrity via `sha256sums.txt` and refuse to execute on
mismatch or unsupported host.

**Why this priority**: install friction is the user's first impression.
A failed install with no clear refusal message is a support incident.

**Independent Test**: From a clean machine, run `deno add jsr:@casualtheorics/argdown-2`,
then `/plugin marketplace add kellenff/argdown-2` + `/plugin install
argdown-2@argdown-2` in Claude Code, then `pi install git:github.com/kellenff/argdown-2`,
then `bash scripts/argdown-2-mcp` directly. Confirm each path works
without Deno or Node installed (binary path). Tamper with the cached
binary's `sha256sums.txt` and confirm the launcher refuses with a clear
message. Run the launcher on an unsupported OS and confirm refusal.

**Acceptance Scenarios**:

1. **Given** a clean machine with no Deno/Node installed, **When** I run `bash scripts/argdown-2-mcp`, **Then** the launcher downloads the correct native binary for the host triple into `XDG_CACHE_HOME`, verifies its `sha256sums.txt`, and `exec`s it.
2. **Given** `ARGDOWN2_MCP_BIN` is set to a local path, **When** the launcher runs, **Then** it `exec`s that path and does not contact the network.
3. **Given** a corrupted `sha256sums.txt`, **When** the launcher runs, **Then** it exits with a clear refusal message and does not execute the binary.
4. **Given** an unsupported OS triple, **When** the launcher runs, **Then** it exits with a clear refusal message and no partial download.

---

### User Story 7 — Run all 10 quality gates locally on a clean checkout (Priority: P1)

As a contributor, I want `deno task test`, `lint`, `fmt:check`,
`check`, `check:mcp-deno`, `compile:mcp`, `probe:mcp`,
`check:npm-allowlist`, `check:cli-deno`, and `publish:dry-run` all to
exit `0` on a clean checkout against the pinned Deno, so that any
green PR can be merged.

**Why this priority**: the gate suite is the project's automated proof
that the constitutional principles are still satisfied. A broken gate
is a v1 release blocker.

**Independent Test**: From `git clean -fdx`, install Deno
`scripts/deno-version` (currently `2.9.2`), run all 10+ tasks
sequentially, and confirm each exits `0`.

**Acceptance Scenarios**:

1. **Given** a clean checkout and the pinned Deno, **When** I run `deno task test`, **Then** it exits `0` with all `Deno.test` calls passing.
2. **Given** a clean checkout, **When** I run `deno task lint`, **Then** it exits `0` with no findings.
3. **Given** a clean checkout, **When** I run `deno task check`, **Then** it exits `0` (typechecks `src/index.ts` and `src/mcp/cli.ts` under TS strict defaults).
4. **Given** a clean checkout, **When** I run `deno task check:npm-allowlist`, **Then** it exits `0` and confirms only `zod`, `effect`, `@modelcontextprotocol/sdk` are allowed as `npm:` specifiers.
5. **Given** a clean checkout, **When** I run `deno task publish:dry-run`, **Then** it exits `0` with no JSR slow-types warnings.

---

### User Story 8 — Test discipline: every public pipeline function has positive, negative, and parity tests (Priority: P2)

As a downstream consumer who depends on the failure channels being
honest, I want every public pipeline function to have a positive test,
a negative test for every tagged failure channel it can produce, and a
parity test against `examples/argdown1-censorship.edn` where
applicable.

**Why this priority**: typed failure channels are only safe when every
channel is exercised by a test; otherwise the typed union silently rots.
This is an internal discipline but a v1 release gate.

**Independent Test**: For each of `load`, `validate`, `solve`,
`parseCandidate`, `apply`, `emptyDocument`, every tagged failure
channel (`EdnError`, `SchemaError`, `ValidateError`, each `BuilderCode`,
`McpIoError.{Read,Write,Parse}`) is reachable by a passing test.
`src/parity.test.ts` confirms grounded labels on the censorship
fixture match the pure-attack expected set.

**Acceptance Scenarios**:

1. **Given** the tagged failure union for `load`, **When** I scan the test files in `src/`, **Then** each member (`EdnError`, `SchemaError`, `ValidateError`) has at least one negative test exercising it.
2. **Given** the `BuilderCode` list, **When** I scan `src/builder/`, **Then** each code (`invalid-id`, `duplicate-id`, `missing-id`, `unsupported-relation-kind`, `unsupported-solver`, `invalid-projection-bounds`) is exercised by a negative test.
3. **Given** a change to any file in `src/{grounded,multi-extension,reduce-*,component-eval,model,validate,schema}.ts`, **When** the PR is opened, **Then** at least one of the eight fixtures in `src/bench.fixtures/` is updated or the test suite is unchanged.
4. **Given** `examples/argdown1-censorship.edn`, **When** I run `src/parity.test.ts`, **Then** the grounded labels match the pure-attack expected set (Dung semantics).

---

### Edge Cases

- **Self-attacking argument**: `solve` must produce `Label = 'undec'`, not throw, not produce a partial result.
- **Two-cycle (`a → b → a`)**: grounded labels both `undec`; extension solvers enumerate the cycle.
- **Orphan statement** (no relations touch it): remains in `:elements` and is labeled `in` under grounded.
- **Hand-written EDN** that bypasses `repairInterface`: validator refuses with `ValidateError`.
- **`support` under `grounded`**: builder refuses with `builder/unsupported-relation-kind`; validator fails with `semantic/unsupported-relation-kind`.
- **`undercut` under any solver**: refused by builder, failed by validator (no current solver consumes it).
- **Mid-write crash** during atomic write: original file on disk unchanged.
- **Corrupted `sha256sums.txt`** in launcher cache: refused with clear message.
- **Unsupported OS triple**: refused with clear message.
- **Solver result with empty `:elements`**: `solve` returns `native = { kind: 'labels', values: Map() }` for grounded; `Set<Set<EntityId>>` empty for extensions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `load(source)` MUST return `Effect.Effect<Document, LoadError, never>` where `LoadError = EdnError | SchemaError | ValidateError`. The Effect MUST NOT throw on any user input and MUST NOT produce a partial document on failure. *(US1)*
- **FR-002**: `validate(value)` MUST return `Effect.Effect<Document, SchemaError | ValidateError, never>` for a pre-parsed value. *(US1)*
- **FR-003**: `solve(document)` MUST return `Effect.Effect<ComponentSolveResult, SolveError>`. `SolveError` MUST be `never` in v1 by design (the alias reserves the failure channel without committing to typed failures). *(US2)*
- **FR-004**: The library MUST expose six solver roots: `grounded`, `bipolar`, `evidential` (label solvers), `preferred`, `stable`, `complete` (multi-extension solvers). Each MUST declare its supported relation kinds via `supportedRelationKinds(tag)`. *(US2)*
- **FR-005**: All namespaced EDN tag families — `casualtheorics.argdown2/document`, `casualtheorics.argdown2.solver/*`, `casualtheorics.argdown2.argdown/*`, `casualtheorics.argdown2.aggregate/*`, `casualtheorics.argdown2.observer/*`, `casualtheorics.argdown2.projection/*` — MUST be spec-frozen. New tags are additive; renaming or removing an existing tag is a MAJOR-version break paired with a `CHANGELOG.md` migration entry. *(US3)*
- **FR-006**: `SOLVER_TAGS` MUST be the canonical, exhaustive solver registry. New solvers MUST extend the tuple, not fork the registry. *(US3)*
- **FR-007**: The MCP server MUST expose exactly 14 tools with stable names: `create_document`, `add_statement`, `update_statement`, `add_argument`, `add_inference`, `add_relation`, `add_solver`, `set_import`, `remove_import`, `remove_element`, `remove_relation`, `list_elements`, `validate`, `solve`. *(US4, US5)*
- **FR-008**: Every mutating tool MUST accept exactly one of `path` (filesystem `.edn`, atomic write via temp + rename) or `source` (full document text, returns updated text). Both or neither MUST be refused with `mcp/invalid-ref`. *(US4)*
- **FR-009**: Path-mode mutations MUST write to `.${Date.now()}.argdown-2.tmp` and `rename` to the target (`src/mcp/io.ts:saveDocumentRefEffect`). Partial writes on disk are a data-loss bug and MUST be prevented. *(US4)*
- **FR-010**: Mutation response shapes MUST be: success `{ ok: true, warnings, diff, path|source }`; builder refusal `{ ok: false, refused: { code, message }, warnings, diff }`; load/IO failure `{ ok: false, errors }`. *(US4)*
- **FR-011**: The library MUST publish to JSR as `@casualtheorics/argdown-2`. Native MCP binaries MUST ship via GitHub Releases for `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`. The Claude Code marketplace entry MUST live at `.claude-plugin/marketplace.json`. The Pi coding-agent package MUST live at root `package.json` (unix only). *(US6)*
- **FR-012**: `bash scripts/argdown-2-mcp` MUST resolve in this order: `ARGDOWN2_MCP_BIN` override → versioned `XDG_CACHE_HOME` cache → download with `sha256sums.txt` verification → `exec`. *(US6)*
- **FR-013**: Native MCP binaries MUST compile directly from `src/mcp/cli.ts` with `deno task compile:mcp`. There MUST NOT be a separate bundler step (no esbuild, no tsdown, no bundled entrypoint). *(US6)*
- **FR-014**: All `deno task` invocations — `test`, `check`, `lint`, `fmt`, `fmt:check`, `mcp`, `compile:mcp`, `check:mcp-deno`, `probe:mcp`, `cli`, `check:cli-deno`, `check:npm-allowlist`, `publish:dry-run` — MUST exit `0` on a clean checkout against the pinned Deno. *(US7)*
- **FR-015**: `deno.json` imports MAY declare only `npm:zod@`, `npm:effect@`, `npm:@modelcontextprotocol/sdk@` (with or without the leading `/`). Any other `npm:` specifier MUST fail CI (`scripts/check-npm-allowlist.sh`). *(US7)*
- **FR-016**: The eight committed fixtures in `src/bench.fixtures/` — `small-minimal`, `small-relations`, `small-argument`, `medium-censorship`, `heavy-attacks`, `deep-arguments`, `large-stress`, `mixed-semantics` — MUST exercise the solver/reduce/eval paths on every commit. *(US8)*
- **FR-017**: Every public pipeline function MUST have a positive test, a negative test for every tagged failure channel it can produce, and a parity test against `examples/argdown1-censorship.edn` where applicable. *(US8)*

### Key Entities

- **Document**: a `#casualtheorics.argdown2/document` map with `:id` and an identified `:root` solver map. The root is itself a typed component; the document is the outermost unit of authorship.
- **Solver Component**: a typed component (`grounded` | `bipolar` | `evidential` | `preferred` | `stable` | `complete`) carrying `:id`, `:interface`, optional `:imports`, and an `:elements` vector. Children may themselves be solver components (nested composition); evaluation is strictly bottom-up.
- **Theory Element**: a `statement`, `argument`, `inference`, `support`, `attack`, `contradiction`, or `undercut`. The latter is currently rejected by every solver.
- **Boundary**: a per-solver typed confidence projection. Parents see only each child's boundary confidence; `IN → 1`, `OUT → 0`, `UNDEC → nil` for grounded boundaries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can load and solve any EDN graph from `examples/` end-to-end via the library, CLI, and MCP server, and the `native` results are identical across all three surfaces. *(US1, US2, US8)*
- **SC-002**: Every tagged failure channel (`EdnError`, `SchemaError`, `ValidateError`, every `BuilderCode`, `McpIoError.{Read,Write,Parse}`) is reachable by a passing test in the suite. *(US1, US8)*
- **SC-003**: A consumer's hand-written EDN that bypasses the builder's `repairInterface` is refused by validation with a typed `ValidateError`; the system never silently accepts it. *(US2, US3, US4)*
- **SC-004**: The 14 MCP tool names and JSON response shapes are byte-identical between the source run (`deno task mcp`), the host binary, and the four release binaries. *(US4, US5)*
- **SC-005**: Installing via `deno add jsr:@casualtheorics/argdown-2`, Claude Code marketplace, and `pi install git:github.com/kellenff/argdown-2` all succeed without Deno or Node prerequisites on the consumer machine (binary path). *(US6)*
- **SC-006**: A corrupted `sha256sums.txt` or unsupported host OS results in a clear, non-executing refusal from the launcher. *(US6)*
- **SC-007**: All `deno task` invocations exit `0` on `git clean -fdx` against Deno `2.9.2`. *(US7)*
- **SC-008**: A change to any file in `src/{grounded,multi-extension,reduce-*,component-eval,model,validate,schema}.ts` is rejected by CI unless at least one fixture in `src/bench.fixtures/` is updated or the existing test suite remains green unchanged. *(US8)*

## Assumptions

- Spec applies to **v1.0.0** release scope; the project is currently `0.2.0-alpha4` and v1 is gated on all 17 functional requirements being met.
- Hand-editing EDN remains forbidden across all surfaces (Claude Code README, Pi skill prompts, this spec). The rule survives v1.
- The six-solver set is exhaustive for v1; `undercut` and ASPIC+ remain out of scope.
- Distribution channels (JSR + GitHub Releases + Claude Code marketplace + Pi) are exhaustive for v1; no PyPI, npm, or Homebrew tap is in scope.
- No GUI, no web service, no `--semantics` CLI flag — solver choice is per-component and read from the EDN root tag.
- macOS and Linux on x86_64 and aarch64 are the supported consumer platforms; Windows remains out of scope for the launcher (per the current bash launcher design).
- The `sanitizeOps: false` workaround in `src/pi-package.test.ts:109-131` is preserved verbatim (still load-bearing on Deno 2.9.2).

## Constitution Cross-Reference *(appendix)*

This spec is a baseline; the following table maps each functional
requirement to the constitutional principle it gates on.

| FR | User Story | Constitution anchor |
|---|---|---|
| FR-001 | US1 | I. Pipeline Purity — `load` returns `Effect`, never throws, never partial |
| FR-002 | US1 | I. Pipeline Purity — `validate` for pre-parsed values |
| FR-003 | US2 | I. Pipeline Purity — `solve` returns `Effect` with `SolveError = never` |
| FR-004 | US2 | II. Wire Stability — solver tag registry + `supportedRelationKinds` |
| FR-005 | US3 | II. Wire Stability — namespaced tags spec-frozen, additive only |
| FR-006 | US3 | II. Wire Stability — `SOLVER_TAGS` is the canonical exhaustive registry |
| FR-007 | US4, US5 | IV. End-to-End MCP Coverage — 14-tool contract is stable |
| FR-008 | US4 | V. Builder-as-Authoring — `path`/`source` ref contract |
| FR-009 | US4 | V. Builder-as-Authoring — atomic write via temp + rename |
| FR-010 | US4 | V. Builder-as-Authoring — response shape contract |
| FR-011 | US6 | IX. Technology Constraints & Distribution — channels |
| FR-012 | US6 | IX. Technology Constraints & Distribution — launcher resolution order |
| FR-013 | US6 | IX. Technology Constraints & Distribution — direct compile, no bundler |
| FR-014 | US7 | IX. Development Workflow & Quality Gates — gate suite |
| FR-015 | US7 | IX. Technology Constraints & Distribution — npm allowlist |
| FR-016 | US8 | III. Test-First / Effect-Composition Discipline — fixture coverage |
| FR-017 | US8 | III. Test-First / Effect-Composition Discipline — positive/negative/parity |

**Anti-violation audit**: any PR that weakens the gates behind these
FRs (e.g. relaxes a `BuilderCode` exhaustive check, removes a fixture,
or introduces a new `npm:` specifier outside the allowlist) MUST be
rejected at review per the constitution's Compliance Review section.
