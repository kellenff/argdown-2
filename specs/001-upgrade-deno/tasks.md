---
description: "Task list for upgrading the pinned Deno runtime from 2.4.5 to 2.9.2"
---

# Tasks: Upgrade Pinned Deno to Latest Stable

**Input**: Design documents from `/specs/001-upgrade-deno/`
**Prerequisites**: `plan.md` (required), `spec.md` (required), `research.md`, `data-model.md`, `contracts/`

**Tests**: No new unit tests are introduced — the feature is a runtime-version bump and is verified by the project's existing constitutional gate suite (`deno task test`, `lint`, `fmt:check`, `check`, `check:mcp-deno`, `compile:mcp`, `probe:mcp`, `check:npm-allowlist`, `publish:dry-run`) remaining green. Each user-story phase below treats the relevant subset of those gates as that story's "tests".

**Organization**: Tasks are grouped by user story to enable independent verification of each story's contract (local dev agreement, CI/Release agreement, native MCP binary agreement).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (`US1`, `US2`, `US3`)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: paths are repository-root-relative.
- The three files this feature touches all live at the repo root or one level down (`scripts/`, `.specify/memory/`, `src/`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the environment is in the right state to perform a runtime-version bump, and that the work tree is clean.

- [X] T001 [P] Confirm host Deno version is `2.9.2` by running `deno --version | head -n1 | awk '{print $2}'` and asserting it equals `2.9.2`; if it does not, run `deno upgrade` (or the documented install path) and re-check
- [X] T002 [P] Confirm work tree is on branch `001-upgrade-deno` with no uncommitted changes by running `git status --porcelain` and `git rev-parse --abbrev-ref HEAD`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pin bump itself. No user-story verification is meaningful until this lands.

**⚠️ CRITICAL**: No user-story work can begin until this phase is complete.

- [X] T003 Replace the single line in `scripts/deno-version` from `2.4.5` to `2.9.2` (this is the canonical pin file; every other runtime reference in the repo traces back to it)

**Checkpoint**: Foundation ready — the pin file is bumped, and `scripts/compile-mcp.sh` + `scripts/check-mcp-deno.sh` will now accept (and require) the host's `2.9.2` Deno.

---

## Phase 3: User Story 1 — Day-to-day development uses a current Deno (Priority: P1) 🎯 MVP

**Goal**: A contributor with Deno `2.9.2` installed can run the project's day-to-day development tasks (`test`, `lint`, `fmt:check`) and have them pass, with no local/remote drift.

**Independent Test**: Run `deno task test`, `deno task lint`, `deno task fmt:check` on a clean checkout and confirm all three exit `0`. Confirm the project's documented pin (`scripts/deno-version`) matches the installed Deno.

### Implementation for User Story 1

- [X] T004 [US1] Update the inline comment at `src/pi-package.test.ts:109-111` to read `Deno 2.4.5–2.9.2 sanitizeOps …` (the workaround is still load-bearing in 2.9.2 — see `research.md` item 10; do not delete the workaround)
- [X] T005 [P] [US1] Run `deno task lint` against the host and confirm exit code `0` with no findings
- [X] T006 [P] [US1] Run `deno task fmt:check` against the host and confirm exit code `0` (no diffs)
- [X] T007 [P] [US1] Run `deno task test` against the host and confirm exit code `0`; if any snapshot test fails, treat the failure per `quickstart.md` Step 4 (do not blanket-update snapshots)

**Checkpoint**: US1 verifiable independently. Local day-to-day development works on the new pin.

---

## Phase 4: User Story 2 — CI and release pipelines agree with the local pin (Priority: P1)

**Goal**: GitHub Actions workflows (`ci.yml`, `release.yml`) install Deno from the shared pin file; the constitution's documentation reference reflects the new pin; the typecheck and npm allowlist gates pass on the new pin.

**Independent Test**: Read `.github/workflows/ci.yml` and `.github/workflows/release.yml` and verify both workflows resolve to `scripts/deno-version` with no hard-coded secondary version literal. Run `deno task check` and `deno task check:npm-allowlist` and confirm both exit `0`.

### Implementation for User Story 2

- [X] T008 [US2] Update the `Runtime` paragraph in `.specify/memory/constitution.md` so the parenthetical reads `currently 2.9.2` (surrounding sentence structure preserved)
- [X] T009 [P] [US2] Run `deno task check` against the host and confirm exit code `0` (typechecks `src/index.ts` and `src/mcp/cli.ts` under TS 6.0 strict defaults; per `research.md` item 6, no new offenders expected)
- [X] T010 [P] [US2] Run `deno task check:npm-allowlist` against the host and confirm exit code `0` (allowlist unchanged in this PR; this is a sanity gate)
- [X] T011 [P] [US2] Verify `.github/workflows/ci.yml` and `.github/workflows/release.yml` still consume `scripts/deno-version` via `deno-version-file` and that no hard-coded Deno version literal exists anywhere in either workflow file

**Checkpoint**: US2 verifiable independently. CI and Release pipelines install the same Deno the docs pin, and the typecheck + npm-allowlist gates pass.

---

## Phase 5: User Story 3 — Native MCP binary still ships from the new pin (Priority: P2)

**Goal**: The host-target `argdown-2-mcp` binary compiles against the new pin, passes the stdio probe with all 14 tools present, and the JSR slow-types contract remains clean.

**Independent Test**: Compile the host-target binary, run `deno task probe:mcp <bin>` against it, and confirm the probe reports a healthy handshake with all 14 MCP tools available. Run `deno task publish:dry-run` and confirm slow-types clean.

### Implementation for User Story 3

- [X] T012 [US3] Run `deno task check:mcp-deno` against the host and confirm exit code `0` (this script enforces host Deno matches the pin, then runs `deno check --frozen` against `src/mcp/cli.ts`; a non-zero exit here means the host pin does not yet match `scripts/deno-version`, which would have failed T001)
- [X] T013 [US3] (depends on T012) Run `deno task compile:mcp` against the host and confirm it writes `dist/mcp-bin/argdown-2-mcp-<host-triple>`; this also regenerates any `deno.lock` entries whose integrity hashes changed under 2.9.2's resolver
- [X] T014 [US3] (depends on T013) Run `deno task probe:mcp ./dist/mcp-bin/argdown-2-mcp-<host-triple>` and confirm the probe reports a healthy handshake with all 14 MCP tools (`create_document`, `add_statement`, `update_statement`, `add_argument`, `add_inference`, `add_relation`, `add_solver`, `set_import`, `remove_import`, `remove_element`, `remove_relation`, `list_elements`, `validate`, `solve`)
- [X] T015 [P] [US3] (independent of T012–T014) Run `deno task publish:dry-run` against the host and confirm exit code `0` with no slow-types warnings

**Checkpoint**: US3 verifiable independently. Native MCP binary compiles, serves all 14 tools, and the JSR slow-types check remains clean.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Atomicity check, end-to-end re-validation, and guardrails against silent scope creep.

- [X] T016 Run the full 10-step validation sweep from `specs/001-upgrade-deno/quickstart.md` end-to-end on the upgrade branch; every step exits `0`
- [X] T017 Confirm `CHANGELOG.md` is intentionally untouched (no new `[Unreleased]` entry was added in this PR — runtime pin bumps are housekeeping per the spec's Clarifications section and the amended FR-005)
- [X] T018 Confirm the diff is bounded to exactly three files plus regenerated `deno.lock` entries: `scripts/deno-version`, `.specify/memory/constitution.md`, `src/pi-package.test.ts` (per FR-006 atomicity; no surprise scope creep)
- [X] T019 [P] Confirm `deno.lock` is committed with `version: 5` schema unchanged; the resolver output may have new integrity hashes, but the schema header MUST NOT change
- [X] T020 [P] Confirm `.editorconfig` hygiene on the three modified files (UTF-8, LF, final newline) — the project's style baseline per Constitution §"Code style"

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — runs immediately against the host.
- **Foundational (Phase 2)**: Depends on Phase 1 (T001, T002) — the pin bump is meaningless without a verified `2.9.2` host and a clean tree.
- **User Stories (Phases 3–5)**: All depend on Phase 2 (T003).
  - **US1 (P1)** can start as soon as T003 lands; T004 (inline comment) edits a different file than T003 and can run in parallel with T005–T007 if the implementer splits the work.
  - **US2 (P1)** can start as soon as T003 lands; T008 (constitution reference) edits a different file than T003 and T004, and T009–T011 are independent read-only verifications.
  - **US3 (P2)** can start as soon as T003 lands; T012–T014 are sequential (compile depends on check, probe depends on compile); T015 is independent of T012–T014.
- **Polish (Phase 6)**: Depends on all three story phases completing green.

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational (T003). No dependency on US2 or US3.
- **US2 (P1)**: Starts after Foundational (T003). No dependency on US1 or US3.
- **US3 (P2)**: Starts after Foundational (T003). No dependency on US1 or US2.

### Within Each User Story

- Literal edits first (`T004` for US1; `T008` for US2; none for US3).
- Verifications (gate tasks) after the literal edits.
- For US3: `check:mcp-deno` → `compile:mcp` → `probe:mcp` is a strict pipeline; do not parallelize these three.

### Parallel Opportunities

- **Phase 1**: T001 and T002 run in parallel.
- **Phase 3**: T005, T006, T007 run in parallel (different gates, different processes).
- **Phase 4**: T009, T010, T011 run in parallel.
- **Phase 5**: T015 runs in parallel with the T012 → T013 → T014 chain.
- **Phase 6**: T017, T018, T019, T020 are read-only checks and run in parallel.
- **Across stories (if multiple implementers)**: US1, US2, US3 can be worked on concurrently once Phase 2 lands, because they edit disjoint files and exercise disjoint subsets of the gate suite.

---

## Parallel Example: User Story 1

```bash
# After T003 (pin bump) and T004 (inline comment) are committed, run the three
# US1 gate tasks in parallel — they each invoke a distinct deno task and touch
# disjoint subsystems (lint rules, formatting, test runner):

# Terminal 1
deno task lint

# Terminal 2
deno task fmt:check

# Terminal 3
deno task test
```

All three must exit `0` for US1 to be considered verified.

---

## Parallel Example: User Story 3

```bash
# T015 (publish:dry-run) can run in parallel with the T012 → T013 → T014 chain:

# Terminal A (independent)
deno task publish:dry-run

# Terminal B (sequential within the chain)
deno task check:mcp-deno && \
  deno task compile:mcp && \
  deno task probe:mcp ./dist/mcp-bin/argdown-2-mcp-$(uname -m | sed 's/arm64/aarch64/;s/x86_64/x86_64/')-$(uname -s | tr A-Z a-z)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002).
2. Complete Phase 2: Foundational (T003).
3. Complete Phase 3: User Story 1 (T004 → T005, T006, T007).
4. **STOP and VALIDATE**: Re-run T005, T006, T007 from a fresh shell; if all three pass, the MVP is complete and the local dev story is shipped.

### Incremental Delivery

1. Setup + Foundational → pin file bumped; foundation ready.
2. Add US1 → three day-to-day gates green → local dev is safe (MVP).
3. Add US2 → typecheck + npm-allowlist green + workflow files verified → CI/Release agreement shipped.
4. Add US3 → host-target binary compiles + probe passes + slow-types clean → native MCP binary is safe.
5. Phase 6 Polish → atomicity, no CHANGELOG drift, full quickstart sweep → PR ready.

### Parallel Team Strategy

With multiple developers working on disjoint machines:

1. Dev A completes Setup + Foundational (T001–T003).
2. Once T003 lands:
   - Dev A: US1 literal edit (T004), then US1 gates (T005–T007).
   - Dev B: US2 literal edit (T008), then US2 gates (T009–T011).
   - Dev C: US3 chain (T012 → T013 → T014) and T015 in parallel.
3. All converge on Phase 6 Polish (T016–T020).

---

## Notes

- This is a "tiny literal change, large verification surface" feature — three files edited, but nine constitutional gates must remain green.
- The `sanitizeOps: false` workaround in `src/pi-package.test.ts:109-131` is still load-bearing in Deno 2.9.2 (`research.md` item 10). Do not delete or "fix" it as part of this PR; a future Deno release may close the gap and the workaround will become removable, but that is a separate change.
- `deno.lock` schema (`version: 5`) is unchanged by this bump. Only integrity hashes may shift where the new resolver produces different outputs.
- `CHANGELOG.md` is intentionally untouched (per the spec's Clarifications section and the amended FR-005).
- The Release workflow's multi-target compile and GitHub Release cut run on `deno.json#version` bumps only. This PR does NOT bump `deno.json#version`; a separate Release PR (or the same PR if the release matrix needs refresh) handles that step.
- The `[P]` marker means the task can run in parallel with other `[P]` tasks that touch disjoint files / processes.
- The `[Story]` label maps the task to the spec's user story for traceability.
- Each user story is independently completable and verifiable.
- Avoid: weakening any gate to make it pass (per FR-008 / SC-004). If a gate fails, treat it as a real signal and fix the underlying cause, do not relax the gate.