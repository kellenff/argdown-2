---
description: "Validation task list for the argdown-2 v1 baseline"
---

# Tasks: argdown-2 v1 Baseline (Constitution-Aligned)

**Input**: Design documents from `/specs/20260807-v1-baseline/`
**Prerequisites**: `plan.md` (required), `spec.md` (required for user stories), `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: The spec defines a **baseline**; validation tasks run the existing test suite in `src/`, `scripts/`, and the probe scripts. No new tests are added by this task list — adding new tests is itself a user-story task (US8 / FR-017).

**Organization**: Tasks are grouped by user story (US1–US8) to enable independent validation of each story's functional requirements. Each task is a concrete shell or `deno task` invocation; none requires writing new code.

## Format: `[ID] [P?] [Story] Description with file path`

- **[P]**: Can run in parallel (different files / disjoint processes).
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, ...). Setup and Foundational phases have NO story label.
- Exact file paths in every task description.

## Path Conventions

- Spec artifacts live at `specs/20260807-v1-baseline/`.
- Library, CLI, MCP source lives at `src/`.
- Bench fixtures live at `src/bench.fixtures/`.
- Distribution surfaces live at `scripts/`, `plugins/argdown-2/`, `pi/`, `.claude-plugin/`, `.github/workflows/`.
- All paths in tasks below are repository-root-relative.

---

## Phase 1: Setup (Baseline Pre-flight)

**Purpose**: Confirm the host environment matches the spec's preconditions before any FR validation begins.

- [ ] T001 Run `deno --version | head -n1 | awk '{print $2}'` and confirm output equals `2.9.2` (matches `scripts/deno-version`)
- [ ] T002 Run `git status --porcelain` and confirm output is empty (working tree clean)
- [ ] T003 Run `git rev-parse --abbrev-ref HEAD` and confirm output equals `20260807-v1-baseline` (matches the spec dir name)

**Checkpoint**: Setup complete — host Deno is `2.9.2`, working tree is clean, and the branch matches the spec.

---

## Phase 2: Foundational (Constitutional Cross-Reference Audit)

**Purpose**: Confirm the spec artifacts themselves are sound and that every FR's existence is recorded before per-story validation begins.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [ ] T004 Read `specs/20260807-v1-baseline/spec.md` and confirm the Constitution Cross-Reference appendix maps each of the 17 FRs (FR-001–FR-017) to a user story and a constitutional principle
- [ ] T005 Read `specs/20260807-v1-baseline/contracts/README.md` and confirm all five contract files (`library-api.md`, `mcp-tools.md`, `cli-surface.md`, `launcher.md`, `distribution.md`) are present at `specs/20260807-v1-baseline/contracts/`
- [ ] T006 Read `specs/20260807-v1-baseline/quickstart.md` and confirm 9 validation scenarios are present, one per SC
- [ ] T007 Read `specs/20260807-v1-baseline/research.md` and confirm the FR-by-FR Coverage Audit table records `✅ Implemented` for all 17 FRs

**Checkpoint**: Foundation ready — every spec artifact exists and the FR-by-FR audit confirms 17/17 implementation. Per-story validation can now begin in parallel.

---

## Phase 3: User Story 1 — Load and validate an EDN argument graph safely (Priority: P1) 🎯 MVP

**Goal**: Confirm that `load(source)` and `validate(value)` satisfy FR-001 and FR-002, that `Effect`-based failure channels are reachable, and that no partial document is ever produced.

**Independent Test**: Run the suite at `quickstart.md` Scenario 2 (`deno run -A` probe against `examples/argdown1-censorship.edn`) and Scenario 3 (`deno test -A src/{edn,validate,schema}.test.ts`). All must exit `0`.

### Validation for User Story 1

- [ ] T008 [US1] Read `src/index.ts:78-85` and confirm `load(source)` is declared with return type `Effect.Effect<Document, LoadError, never>` (FR-001)
- [ ] T009 [US1] Read `src/index.ts:69-76` and confirm `validate(value)` is declared with return type `Effect.Effect<Document, SchemaError | ValidateError, never>` (FR-002)
- [ ] T010 [US1] Run `deno test -A src/edn.test.ts` and confirm exit `0` (EdnError failure channel is reachable)
- [ ] T011 [P] [US1] Run `deno test -A src/schema.test.ts` and confirm exit `0` (SchemaError failure channel is reachable)
- [ ] T012 [P] [US1] Run `deno test -A src/validate.test.ts` and confirm exit `0` (ValidateError failure channel is reachable; cross-reference break, unsupported relation kind)

**Checkpoint**: US1 verified independently. Library's load + validate surfaces are complete and contract-correct.

---

## Phase 4: User Story 2 — Solve a graph with one of six solvers and get a typed result (Priority: P1)

**Goal**: Confirm that `solve(document)` and the six-solver registry satisfy FR-003 and FR-004, and that the per-component result shape is consistent.

**Independent Test**: Run `deno test -A src/{grounded,multi-extension,reduce-bipolar,reduce-evidential,component-eval}.test.ts` and `src/parity.test.ts`; all must exit `0`.

### Validation for User Story 2

- [ ] T013 [US2] Read `src/index.ts:87-91` and confirm `solve(document)` is declared with return type `Effect.Effect<ComponentSolveResult, SolveError>` and `SolveError` is `never` (FR-003)
- [ ] T014 [US2] Read `src/model.ts` and confirm `SOLVER_TAGS` contains exactly six entries: `grounded`, `bipolar`, `evidential`, `preferred`, `stable`, `complete` (FR-004 / FR-006)
- [ ] T015 [US2] Run `deno test -A src/solvers.test.ts src/grounded.test.ts src/multi-extension.test.ts src/reduce-bipolar.test.ts src/reduce-evidential.test.ts src/component-eval.test.ts` and confirm exit `0`
- [ ] T016 [P] [US2] Run `deno test -A src/parity.test.ts` and confirm exit `0` (grounded labels on `examples/argdown1-censorship.edn` match Dung pure-attack expected set)

**Checkpoint**: US2 verified independently. All six solver roots are exposed; `solve` returns the typed per-component result.

---

## Phase 5: User Story 3 — Trust the EDN theory tag registry (Priority: P1)

**Goal**: Confirm that the namespaced EDN tags and `SOLVER_TAGS` registry are spec-frozen and additive (FR-005, FR-006), and that no recent merge has renamed or removed a tag.

**Independent Test**: Read `CHANGELOG.md` `[Unreleased]` and confirm there is no tag-rename entry; read `src/model.ts` and confirm the namespaced tag constants are present.

### Validation for User Story 3

- [ ] T017 [US3] Read `src/model.ts` and confirm the namespaced tag families `casualtheorics.argdown2/document`, `casualtheorics.argdown2.solver/*`, `casualtheorics.argdown2.argdown/*`, `casualtheorics.argdown2.aggregate/*`, `casualtheorics.argdown2.observer/*`, `casualtheorics.argdown2.projection/*` are exported as constants (FR-005)
- [ ] T018 [US3] Read `CHANGELOG.md` `[Unreleased]` section and confirm there is no entry that renames or removes any existing tag (FR-005 / FR-006)

**Checkpoint**: US3 verified independently. Tag registry is spec-frozen and additive-only.

---

## Phase 6: User Story 4 — Mutate graphs only through the 14 builder MCP tools (Priority: P1)

**Goal**: Confirm that the 14-tool contract, document-ref contract, atomic write, and response-shape contract all satisfy FR-007 through FR-010.

**Independent Test**: Run `deno test -A src/mcp/tools.test.ts src/mcp/io.test.ts src/builder/apply.test.ts src/builder/types.test.ts`; all must exit `0`.

### Validation for User Story 4

- [ ] T019 [US4] Read `src/mcp/tools.ts` and confirm exactly 14 tool names are registered in canonical order: `create_document`, `add_statement`, `update_statement`, `add_argument`, `add_inference`, `add_relation`, `add_solver`, `set_import`, `remove_import`, `remove_element`, `remove_relation`, `list_elements`, `validate`, `solve` (FR-007)
- [ ] T020 [US4] Read `src/mcp/tools.ts` and confirm every mutating tool accepts exactly one of `path` or `source`; both/neither refused with `mcp/invalid-ref` (FR-008)
- [ ] T021 [US4] Read `src/mcp/io.ts:saveDocumentRefEffect` and confirm the atomic-write path writes to `.${Date.now()}.argdown-2.tmp` then `rename`s (FR-009)
- [ ] T022 [US4] Read `src/mcp/tools.ts` and confirm the three response shapes are implemented: success `{ ok, warnings, diff, path|source }`; refusal `{ ok: false, refused: { code, message }, warnings, diff }`; failure `{ ok: false, errors }` (FR-010)
- [ ] T023 [P] [US4] Run `deno test -A src/builder/apply.test.ts` and confirm exit `0` (every `BuilderCode` exercised by a negative test)

**Checkpoint**: US4 verified independently. Builder MCP surface is contract-correct and atomic.

---

## Phase 7: User Story 5 — Use the same 14-tool MCP surface from any agent (Priority: P1)

**Goal**: Confirm the tool registry is byte-identical between source run, host binary, and release binaries (SC-004).

**Independent Test**: Compile the host binary (`deno task compile:mcp`) and run the stdio probe (`deno task probe:mcp <bin>`); confirm all 14 tools present and a healthy handshake.

### Validation for User Story 5

- [ ] T024 [US5] Run `deno task compile:mcp` and confirm exit `0`; confirm `dist/mcp-bin/argdown-2-mcp-<host-triple>` is written
- [ ] T025 [US5] Run `deno task probe:mcp -- ./dist/mcp-bin/argdown-2-mcp-<host-triple>` and confirm exit `0`; confirm the probe reports a healthy handshake and lists all 14 tool names in canonical order (FR-007 / SC-004)
- [ ] T026 [P] [US5] Read `src/mcp/server.test.ts` and confirm the in-memory handshake test verifies the tool registry matches the 14-tool contract (FR-007)

**Checkpoint**: US5 verified independently. Source run and host binary expose byte-identical tool surfaces.

---

## Phase 8: User Story 6 — Install via Deno, Claude Code, Pi, or raw MCP client (Priority: P1)

**Goal**: Confirm that the four distribution channels (FR-011), the launcher resolution order (FR-012), and the direct-compile invariant (FR-013) are satisfied.

**Independent Test**: Run the quickstart Scenarios 6a–6e (`publish:dry-run`, pin diff, plugin equivalence, host compile, cross-platform probe).

### Validation for User Story 6

- [ ] T027 [US6] Read `.github/workflows/release.yml` and confirm it ships binaries for `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu` (FR-011)
- [ ] T028 [US6] Read `scripts/argdown-2-mcp` and confirm the resolution order is `ARGDOWN2_MCP_BIN` override → `XDG_CACHE_HOME` cache → download + `sha256sums.txt` verify → `exec` (FR-012)
- [ ] T029 [US6] Run `diff scripts/argdown-2-mcp plugins/argdown-2/scripts/argdown-2-mcp` and confirm exit `0` (launcher copy is byte-equivalent between canonical and Claude Code plugin)
- [ ] T030 [P] [US6] Run `diff scripts/argdown-2-mcp.version plugins/argdown-2/scripts/argdown-2-mcp.version` and confirm exit `0` (version pin copy is byte-equivalent)
- [ ] T031 [P] [US6] Read `scripts/compile-mcp.sh` and confirm it compiles `src/mcp/cli.ts` directly with no bundler step (FR-013)

**Checkpoint**: US6 verified independently. Distribution channels are present and the launcher invariants hold.

---

## Phase 9: User Story 7 — Run all 10 quality gates locally on a clean checkout (Priority: P1)

**Goal**: Confirm that the full `deno task` suite exits `0` (FR-014) and that the npm allowlist is enforced (FR-015).

**Independent Test**: Run `quickstart.md` Scenario 1 (gate sweep) and Scenario 9 (audit grep).

### Validation for User Story 7

- [ ] T032 [US7] Run `deno task test && deno task lint && deno task fmt:check && deno task check && deno task check:cli-deno && deno task check:mcp-deno && deno task check:npm-allowlist && deno task publish:dry-run` and confirm every command exits `0` (FR-014 / FR-015)
- [ ] T033 [P] [US7] Read `scripts/check-npm-allowlist.sh` and `src/npm-allowlist.test.ts` and confirm only `zod`, `effect`, `@modelcontextprotocol/sdk` are allowed as `npm:` specifiers (FR-015)
- [ ] T034 [P] [US7] Run `deno task publish:dry-run` in isolation and confirm exit `0` with no JSR slow-types warnings (SC-007)

**Checkpoint**: US7 verified independently. Quality gate suite is green; npm allowlist is enforced.

---

## Phase 10: User Story 8 — Test discipline: positive, negative, parity coverage (Priority: P2)

**Goal**: Confirm that every public pipeline function has positive + negative + parity test coverage (FR-016, FR-017), and that the eight bench fixtures cover the solver/reduce/eval paths.

**Independent Test**: Run `quickstart.md` Scenario 8 (fixture inventory) and Scenario 3 (failure-channel suite).

### Validation for User Story 8

- [ ] T035 [US8] Run `ls src/bench.fixtures/` and confirm exactly 8 fixtures are present: `small-minimal`, `small-relations`, `small-argument`, `medium-censorship`, `heavy-attacks`, `deep-arguments`, `large-stress`, `mixed-semantics` (FR-016)
- [ ] T036 [US8] Run `deno test -A src/{grounded,multi-extension,reduce-dung,reduce-bipolar,reduce-evidential,component-eval,model,validate,schema}.test.ts` and confirm exit `0` (FR-017 — fixture-driven coverage on solver / reduce / eval paths)

**Checkpoint**: US8 verified independently. Test discipline is observed across solver / reduce / eval files; eight bench fixtures are committed.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final all-clear summary, atomicity check, and confirmation that the baseline spec artifacts are ready for v1.0.0 release gate.

- [ ] T037 [P] Run the 9-line all-clear summary from `quickstart.md` and confirm 9 `✓` lines are emitted
- [ ] T038 [P] Run `git status --porcelain` and confirm output is empty (atomicity check: this branch should add only spec artifacts under `specs/20260807-v1-baseline/` plus `.specify/feature.json`)
- [ ] T039 [P] Read `specs/20260807-v1-baseline/checklists/requirements.md` and confirm all checklist items are checked (`[x]`)
- [ ] T040 [P] Confirm `CHANGELOG.md` was intentionally NOT modified by this branch (per the plan's Constraints section)

**Checkpoint**: All 17 FRs validated independently per their user stories; all 8 SCs achievable; baseline is release-gate ready.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — runs immediately against the host.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phases 3–10)**: All depend on Foundational (Phase 2) completion.
  - US1–US7 are P1 and can run in parallel (different `src/` subtrees, disjoint gates).
  - US8 (P2) can run in parallel with US1–US7 once Foundational lands.
- **Polish (Phase 11)**: Depends on all eight user-story phases completing green.

### User Story Dependencies

- **US1 (P1)**: Independent — only depends on Foundational. Maps to FR-001, FR-002.
- **US2 (P1)**: Independent — only depends on Foundational. Maps to FR-003, FR-004.
- **US3 (P1)**: Independent — only depends on Foundational. Maps to FR-005, FR-006.
- **US4 (P1)**: Independent — only depends on Foundational. Maps to FR-007, FR-008, FR-009, FR-010.
- **US5 (P1)**: Builds on US4's tool registry (FR-007) but is independently testable (source-run vs binary probe). Maps to FR-007.
- **US6 (P1)**: Independent — only depends on Foundational. Maps to FR-011, FR-012, FR-013.
- **US7 (P1)**: Independent — only depends on Foundational. Maps to FR-014, FR-015.
- **US8 (P2)**: Independent — only depends on Foundational. Maps to FR-016, FR-017.

### Within Each User Story

- File reads (audit tasks) first, file-readiness gate tasks after.
- For US1, US4, US5, US7: gate-running tasks (deno test / deno task) can run in parallel with each other when marked `[P]`.
- For US2, US3, US6, US8: reads and runs are mostly sequential within the story but parallel across stories.

### Parallel Opportunities

- **Phase 1**: T001, T002, T003 are sequential by design (verify the environment before any work).
- **Phase 3 (US1)**: T010, T011, T012 run in parallel (three independent test suites).
- **Phase 4 (US2)**: T015 and T016 can run in parallel (solver suite + parity suite are disjoint files).
- **Phase 5 (US3)**: T017 and T018 are independent reads.
- **Phase 6 (US4)**: T023 runs in parallel with the four read tasks (different files).
- **Phase 7 (US5)**: T024, T025, T026 are sequential (compile depends on source; probe depends on compile; server.test.ts is independent of the compile chain).
- **Phase 8 (US6)**: T029, T030, T031 run in parallel (different files / different gates).
- **Phase 9 (US7)**: T033, T034 run in parallel with T032's gates (different files / processes).
- **Phase 10 (US8)**: T035 and T036 are independent reads/runs.
- **Phase 11**: T037, T038, T039, T040 are all read-only and parallel.
- **Across stories**: US1, US2, US3, US4, US5, US6, US7, US8 can be worked on concurrently once Foundational lands because they exercise disjoint files and disjoint `deno task` invocations.

---

## Parallel Examples

### User Story 1 (US1)

```bash
# Phase 1 audit reads (sequential):
deno --version | head -n1 | awk '{print $2}'   # T001
git status --porcelain                         # T002
git rev-parse --abbrev-ref HEAD                # T003

# Phase 3 US1 gate runs (parallel — three independent test suites):
deno test -A src/edn.test.ts                  # T010 (EdnError)
deno test -A src/schema.test.ts               # T011 (SchemaError)
deno test -A src/validate.test.ts             # T012 (ValidateError)
```

### User Story 2 (US2)

```bash
# Read + run in sequence:
deno test -A src/solvers.test.ts src/grounded.test.ts src/multi-extension.test.ts src/reduce-bipolar.test.ts src/reduce-evidential.test.ts src/component-eval.test.ts  # T015
deno test -A src/parity.test.ts                                                                                                                                  # T016 (parallel to T015)
```

### User Story 7 (US7) — full gate sweep

```bash
deno task test                                    # T032 (gate 1)
deno task lint                                    # T032 (gate 2)
deno task fmt:check                               # T032 (gate 3)
deno task check                                   # T032 (gate 4)
deno task check:cli-deno                          # T032 (gate 5)
deno task check:mcp-deno                          # T032 (gate 6)
deno task check:npm-allowlist                     # T032 (gate 7)
deno task publish:dry-run                         # T032 (gate 8)
deno test -A src/npm-allowlist.test.ts            # T033 (parallel)
```

---

## Implementation Strategy

### MVP First (User Story 1 + US7)

The MVP for this validation baseline is **US1 (load + validate)** plus **US7 (gate sweep)**: together they prove the library works end-to-end and that every gate remains green.

1. Complete Phase 1: Setup (T001–T003).
2. Complete Phase 2: Foundational (T004–T007).
3. Complete Phase 3: US1 (T008–T012).
4. Complete Phase 9: US7 (T032–T034) — full gate sweep.
5. **STOP and VALIDATE**: re-run T010, T011, T012, T032; if all pass, the MVP validation is complete.

### Incremental Delivery

1. Setup + Foundational → spec artifacts audited, environment ready.
2. Add US1 → library load + validate surfaces confirmed (MVP).
3. Add US2 → six solver roots confirmed; per-component result shape confirmed.
4. Add US3 → tag registry spec-frozen; no recent rename.
5. Add US4 → 14-tool builder MCP surface confirmed.
6. Add US5 → source / binary parity confirmed via stdio probe.
7. Add US6 → distribution channels and launcher invariants confirmed.
8. Add US7 → quality gates green (overlaps with MVP).
9. Add US8 → test discipline and fixture coverage confirmed.
10. Phase 11 Polish → all-clear summary + atomicity + checklist + `CHANGELOG.md` untouched.

### Parallel Team Strategy

With multiple reviewers working on disjoint machines:

1. Reviewer A: Phase 1 (T001–T003) and Phase 2 (T004–T007) sequentially.
2. Once Phase 2 lands:
   - Reviewer A: US1 (T008–T012).
   - Reviewer B: US2 (T013–T016).
   - Reviewer C: US3 (T017–T018) and US6 (T027–T031).
   - Reviewer D: US4 (T019–T023) and US5 (T024–T026).
   - Reviewer E: US7 (T032–T034) and US8 (T035–T036).
3. All converge on Phase 11 Polish (T037–T040).

---

## Notes

- This is a **validation** task list, not an implementation list: every task is a read or a `deno task` / `deno test` invocation against the existing `0.2.0-alpha4` codebase. No `src/` files are modified by this list.
- Adding a new test (`src/*.test.ts`) is itself a US8 task if the existing coverage is found wanting — and per FR-017, this is a v1 release gate (P2 but required).
- `[P]` markers indicate tasks that touch disjoint files or invoke disjoint processes; running them concurrently is safe.
- `[Story]` labels map each task to its user story for traceability to `spec.md`'s acceptance scenarios.
- Each user story is independently completable and verifiable — that is the entire point of the spec's constitution-aligned structure.
- **Avoid**: weakening any test, snapshot, lint rule, or typecheck to make a gate pass (constitution Principle III + Compliance Review). If a gate fails, treat it as a real signal and fix the underlying cause; do not relax the gate.
- **Avoid**: skipping a task because "the FR is obviously implemented." Every audit task exists to produce an auditable artifact — the read or run output — that proves the implementation is present.
