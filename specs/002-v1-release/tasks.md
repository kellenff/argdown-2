# Tasks: Cut argdown-2 v1.0.0 Release

**Input**: Design documents from `/specs/002-v1-release/`
- [plan.md](plan.md) (required)
- [spec.md](spec.md) (required for user stories)
- [research.md](research.md)
- [data-model.md](data-model.md)
- [contracts/](contracts/)
- [quickstart.md](quickstart.md)

**Tests**: The release cut relies on existing parity tests
(`src/claude-plugin.test.ts:43-91`, `src/pi-package.test.ts:43-59`)
and the existing launcher test suite
(`scripts/argdown-2-mcp.test.sh`) as verification. No new test
tasks are generated — the spec does not request TDD.

**Organization**: Tasks are grouped by user story to enable
independent verification of each downstream-consumption outcome.
The cut is a single atomic commit (Phase 2) followed by
CI-driven `release.yml` execution (Phases 4–8).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies
  on incomplete tasks).
- **[Story]**: Which user story this task belongs to (e.g.,
  US1, US2, US3, US4, US5).
- Include exact file paths in descriptions.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify tooling and branch state before any edits.

- [ ] T001 Confirm branch is `002-v1-release` with no uncommitted
  changes (`git status --porcelain` returns empty)
- [ ] T002 Confirm Deno 2.9.2 is on `PATH` (`deno --version`
  matches `scripts/deno-version`)

---

## Phase 2: Foundational (Atomic Version-Pin Bump)

**Purpose**: Update all six version pins and close the
`[Unreleased]` CHANGELOG block in a single commit. This phase is
the cut itself — everything downstream runs against this commit.

**⚠️ CRITICAL**: All 9 edits below MUST land in a single commit
to keep the parity tests in `src/claude-plugin.test.ts` and
`src/pi-package.test.ts` green throughout.

- [ ] T003 [P] Update `deno.json:3` `"version": "0.2.0-alpha4"`
  → `"version": "1.0.0"` (FR-001, the canonical source of truth)
- [ ] T004 [P] Update `scripts/argdown-2-mcp.version:1`
  `0.2.0-alpha4` → `1.0.0` (FR-002, launcher pin)
- [ ] T005 [P] Update `plugins/argdown-2/scripts/argdown-2-mcp.version:1`
  `0.2.0-alpha4` → `1.0.0` (FR-003 part 1, plugin launcher pin)
- [ ] T006 [P] Update `plugins/argdown-2/.claude-plugin/plugin.json:4`
  `"version": "0.2.0-alpha4"` → `"version": "1.0.0"`
  (FR-004, marketplace plugin manifest)
- [ ] T007 [P] Update `package.json:3`
  `"version": "0.2.0-alpha4"` → `"version": "1.0.0"`
  (FR-005 part 1, Pi package root)
- [ ] T008 [P] Update `src/mcp/server.ts:21` `version: "0.2.0-alpha4"`
  → `version: "1.0.0"` (FR-006, embedded MCP server constant)
- [ ] T009 [P] Edit `CHANGELOG.md`: rename `[Unreleased]` heading
  to `[1.0.0] - 2026-08-07`, delete the 7-line alpha-rollback
  preamble (per Q1), preserve all `### Added` / `### Changed` /
  `### Removed` subsections, preserve the `[0.2.0-alpha4]` link
  reference at the file footer, optionally append a fresh empty
  `[Unreleased]` placeholder (FR-007 / FR-008)
- [ ] T010 Regenerate `package-lock.json` to reflect the
  `package.json#version` bump (run `yarn install` or the lockfile
  manager in use); confirm the root `version` field reads
  `1.0.0` and both `package-lock.json:3` and `package-lock.json:9`
  reference it (FR-005 part 2)
- [ ] T011 Verify byte-equivalence: `diff scripts/argdown-2-mcp
  plugins/argdown-2/scripts/argdown-2-mcp` and
  `diff scripts/argdown-2-mcp.version
  plugins/argdown-2/scripts/argdown-2-mcp.version` both report
  no diff (FR-003 part 2; enforced by
  `src/claude-plugin.test.ts:85-91`)
- [ ] T012 Stage all 9 edits and commit as a single atomic commit
  on the `002-v1-release` branch with a message that names the
  v1 cut (e.g., `chore(release): cut v1.0.0`)

**Checkpoint**: After this commit, `deno task test` MUST pass
because the parity tests now find all 6 pins reading `1.0.0`.
The `dry-run-publish` job should also pass.

---

## Phase 3: Quality Gates (Local Pre-Flight)

**Purpose**: Run every Deno quality gate locally before pushing,
so CI failures are caught early. Gates MUST be green before
opening the PR.

- [ ] T013 Run `deno task test` and confirm parity assertions in
  `src/claude-plugin.test.ts:43-91` and
  `src/pi-package.test.ts:43-59` pass (FR-001..FR-006; SC-005)
- [ ] T014 Run `deno task lint` and confirm exit 0 (lint baseline
  unchanged)
- [ ] T015 Run `deno task fmt:check` and confirm exit 0 (no
  formatting drift)
- [ ] T016 Run `deno task check` and confirm exit 0 (typecheck on
  `src/index.ts` and `src/mcp/cli.ts`)
- [ ] T017 Run `deno task check:npm-allowlist` and confirm exit 0
  (npm allowlist unchanged)
- [ ] T018 Run `deno task check:mcp-deno` and confirm exit 0 (MCP
  Deno entry compiles)
- [ ] T019 Run `deno task publish:dry-run` and confirm exit 0
  (JSR slow-types clean)
- [ ] T020 Run `bash scripts/argdown-2-mcp.test.sh` and confirm
  exit 0; the last line MUST read
  `argdown-2-mcp.test.sh: all ok` (SC-002)

**Checkpoint**: All 8 gates green. The PR is ready to push.

---

## Phase 4: User Story 1 — JSR Stable (Priority: P1) 🎯 MVP

**Goal**: A clean `deno add jsr:@casualtheorics/argdown-2`
resolves to a stable `1.0.0` version (not a `-dev.*` or
`-alpha.*` prerelease).

**Independent Test**: After merge, query
`https://jsr.io/@casualtheorics/argdown-2/meta.json` and confirm
`.versions["1.0.0"]` exists and is not yanked.

### Implementation for User Story 1

- [ ] T021 [US1] Push the `002-v1-release` branch to origin
  (`git push origin 002-v1-release`)
- [ ] T022 [US1] Open PR from `002-v1-release` → `main` with
  description that links the v1 baseline spec, names this as the
  v1 cut, and lists the 8 quality gates that pass locally (per
  Q5: PR description is the announcement surface)
- [ ] T023 [US1] Wait for CI green on the PR: every gate from
  Phase 3 plus the `dry-run-publish` job, plus the host MCP
  binary compile + probe
- [ ] T024 [US1] Merge the PR to `main` using a non-squash merge
  (so the commit hash matches what `release.yml:Detect version
  bump` reads against `HEAD~1`); merge triggers
  `release.yml:stable-release` automatically

**Checkpoint**: After this phase, `release.yml:stable-release`
runs on `main` and the JSR stable publish step
(`release.yml:230-247`) executes. The user story outcome is
realized once `.versions["1.0.0"]` exists on JSR.

---

## Phase 5: User Story 2 — MCP Binary via Launcher (Priority: P1)

**Goal**: `bash scripts/argdown-2-mcp` downloads the `v1.0.0`
native binary from GitHub Releases on a clean `XDG_CACHE_HOME`
and runs the 14-tool MCP contract.

**Independent Test**: After the release workflow completes, run
`gh release view v1.0.0 --json assets` and confirm 5 assets;
run the probe against each binary and confirm the
`initialize` handshake reports `version: "1.0.0"` and
`tools/list` returns the 14 contract tool names.

### Implementation for User Story 2

- [ ] T025 [US2] Wait for `release.yml:Compile MCP binaries`
  step (invokes `bash scripts/compile-mcp.sh --all`); confirm
  `dist/mcp-bin/argdown-2-mcp-{x86_64-apple-darwin,aarch64-apple-darwin,x86_64-unknown-linux-gnu,aarch64-unknown-linux-gnu}`
  exist (FR-009; SC-003 prerequisite)
- [ ] T026 [US2] Wait for `release.yml:Probe Linux MCP binary`
  step (`deno run -A scripts/probe-mcp-stdio.ts
  ./dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu`);
  confirm exit 0 and probe output lists all 14 tool names
  (FR-010; SC-006)
- [ ] T027 [US2] Wait for `release.yml:Generate checksums`
  step; confirm `dist/mcp-bin/sha256sums.txt` exists with
  exactly 4 lines (one per binary) (FR-011)
- [ ] T028 [US2] Wait for `release.yml:Create GitHub Release
  (binaries only)` step; confirm
  `gh release view v1.0.0 --json assets` returns 5 entries
  (4 binaries + `sha256sums.txt`) and `prerelease: false`
  (FR-012; SC-002, SC-003)

**Checkpoint**: User Story 2 outcome is realized once the GitHub
Release `v1.0.0` exists with 5 assets.

---

## Phase 6: User Story 3 — CHANGELOG Stability (Priority: P2)

**Goal**: The `v1.0.0` GitHub Release body is byte-equal to the
`[1.0.0] - 2026-08-07` section of `CHANGELOG.md`, so downstream
skill authors and example maintainers can cite a specific
version for pinning.

**Independent Test**: After the release, run
`diff <(gh release view v1.0.0 --json body -q .body) <(awk ...
CHANGELOG.md)` and confirm no diff.

### Implementation for User Story 3

- [ ] T029 [US3] Wait for `release.yml:Extract CHANGELOG notes`
  step (`release.yml:179-196`); confirm `release-notes.md` is
  populated with the content of the `[1.0.0] - 2026-08-07`
  section
- [ ] T030 [US3] Verify GitHub Release body byte-equality:
  `diff <(gh release view v1.0.0 --json body -q .body) <(awk
  -v v='1\.0\.0' '$0 ~ "^## \\[" v "\\]" { flag=1; next } /^## \[/
  && flag { flag=0 } flag' CHANGELOG.md)` reports no diff
  (SC-003)

**Checkpoint**: User Story 3 outcome is realized once the body
byte-equality check passes.

---

## Phase 7: User Story 4 — Marketplace + Pi Parity (Priority: P2)

**Goal**: The Claude Code marketplace plugin manifest
(`plugins/argdown-2/.claude-plugin/plugin.json`) and the root
Pi `package.json` both advertise `1.0.0`, so `/plugin install
argdown-2@argdown-2` and `pi install git:...` resolve to the
stable release.

**Independent Test**: After the cut, `deno task test` passes
with the parity assertions in `src/claude-plugin.test.ts:43-55`
(plugin.json == deno.json) and `src/pi-package.test.ts:43-59`
(package.json == deno.json).

### Implementation for User Story 4

- [ ] T031 [US4] Verify marketplace parity at the
  `v1.0.0` tag: `jq -r '.version'
  plugins/argdown-2/.claude-plugin/plugin.json` returns
  `1.0.0` (FR-004 verification)
- [ ] T032 [US4] Verify Pi package parity at the
  `v1.0.0` tag: `jq -r '.version' package.json` returns
  `1.0.0` (FR-005 verification)
- [ ] T033 [US4] Verify `package-lock.json` parity at the
  `v1.0.0` tag: `jq -r '.version' package-lock.json` and
  `jq -r '.packages[""].version' package-lock.json` both
  return `1.0.0` (FR-005 part 2 verification)

**Checkpoint**: User Story 4 outcome is realized once both
manifests read `1.0.0` and `deno task test` passes.

---

## Phase 8: User Story 5 — Cross-Channel Audit (Priority: P3)

**Goal**: Every shipped artifact (JSR library, 4 native MCP
binaries, marketplace plugin, Pi package, embedded MCP server
version string) reports `1.0.0` on inspection, with zero
channel drift.

**Independent Test**: For each distribution channel, read its
advertised version string and confirm the exact `1.0.0` value;
`for bin in dist/mcp-bin/argdown-2-mcp-*; do deno run -A
scripts/probe-mcp-stdio.ts "$bin"; done` reports
`serverVersion=1.0.0` for each.

### Implementation for User Story 5

- [ ] T034 [US5] Run the 6-pin equality check: walk every
  pinned location and confirm each reads `1.0.0`:
  ```bash
  for f in deno.json \
           scripts/argdown-2-mcp.version \
           plugins/argdown-2/scripts/argdown-2-mcp.version \
           plugins/argdown-2/.claude-plugin/plugin.json \
           package.json; do
    case "$f" in
      *.json) jq -r '.version' "$f" ;;
      *)      tr -d '[:space:]' < "$f" ;;
    esac
  done | sort -u
  ```
  Expected: exactly one line, `1.0.0` (FR-001..FR-006; SC-004)
- [ ] T035 [US5] Run the embedded-version check against every
  compiled binary: probe each of the four binaries (host binary
  in `dist/mcp-bin/argdown-2-mcp-${host_target}` and the other
  three via the launcher download path) and confirm the
  `initialize` response reports `serverInfo.version: "1.0.0"`
  (FR-006 verification; SC-001)

**Checkpoint**: User Story 5 outcome is realized once every
channel reads `1.0.0` and the embedded-version probe passes for
each binary.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all user stories and
end-to-end validation per `quickstart.md`.

- [ ] T036 Run the fresh `deno add` smoke: in a temp dir, run
  `deno init && deno add jsr:@casualtheorics/argdown-2` and
  confirm `deno.json` resolves to `jsr:@casualtheorics/argdown-2@^1.0.0`
  and `deno.lock` resolves to `1.0.0` (SC-001)
- [ ] T037 Run the fresh launcher-fetch smoke: in a temp
  `XDG_CACHE_HOME`, run `bash scripts/argdown-2-mcp` with the
  host target and confirm the stderr line names
  `argdown-2-mcp-<target> (v1.0.0)` and the cache directory
  `argdown-2/mcp/1.0.0/<host_target>/` is created (SC-002)
- [ ] T038 Verify all 8 success criteria pass by walking
  `specs/002-v1-release/spec.md:SC-001..SC-008` and confirming
  each is satisfied by the artifacts produced in Phases 4–8
- [ ] T039 Confirm `README.md` was NOT touched by this cut:
  `git diff -- README.md` against the v1 baseline merge commit
  must be empty (FR-015 / Q2 deferral to fresh grfp run)

**Checkpoint**: All 8 success criteria pass; the cut is
complete. The follow-up fresh grfp run is now unblocked.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — produces the
  single atomic version-pin commit that everything else reads.
- **Quality Gates (Phase 3)**: Depends on Phase 2 — must be
  green before pushing.
- **User Story 1 (Phase 4)**: Depends on Phases 2 + 3 —
  triggers the `release.yml` workflow on `main`.
- **User Story 2 (Phase 5)**: Depends on Phase 4 — the
  `release.yml:stable-release` job executes the compile,
  probe, checksum, and GitHub Release steps.
- **User Story 3 (Phase 6)**: Depends on Phase 5 — the
  GitHub Release must exist before its body can be compared.
- **User Story 4 (Phase 7)**: Depends on Phase 4 — the
  `v1.0.0` tag must exist before manifests can be checked
  against it.
- **User Story 5 (Phase 8)**: Depends on Phases 5 + 7 — every
  channel must have shipped its `1.0.0` artifact before the
  audit can confirm parity.
- **Polish (Phase 9)**: Depends on all user-story phases —
  consumes the artifacts produced by Phases 4–8.

### User Story Dependencies

- **US1 (JSR stable)**: Can start after Phases 2 + 3 — no
  dependency on US2/US3/US4/US5.
- **US2 (MCP binary)**: Can start after US1 (the release
  workflow runs serially — JSR stable and GitHub Release are
  sibling outputs of `release.yml:stable-release`).
- **US3 (CHANGELOG stability)**: Can start after US2 — needs
  the GitHub Release to verify body byte-equality.
- **US4 (Marketplace + Pi parity)**: Can start after US1 — the
  parity is asserted at the `v1.0.0` tag, which is created by
  the same `release.yml:stable-release` job.
- **US5 (Cross-channel audit)**: Can start after US2 + US4 —
  needs every channel's `1.0.0` artifact to exist before
  confirming zero drift.

### Within Each Phase

- T003–T010 are independent file edits — all marked [P].
- T011 depends on T003 + T004 (byte-equivalence check needs
  both pins updated).
- T012 depends on T003–T011 (single atomic commit).
- T013–T020 are sequential quality gates; each confirms a
  different invariant.
- T021–T024 (US1) are sequential: push → PR → CI → merge.
- T025–T028 (US2) are sequential steps of
  `release.yml:stable-release`; they share state via
  `dist/mcp-bin/`.
- T029–T030 (US3) sequential.
- T031–T033 (US4) can run in parallel after Phase 4 (each
  reads a different file).
- T034–T035 (US5) can run in parallel after Phase 5.
- T036–T039 (Polish) sequential.

### Parallel Opportunities

- **Phase 2**: T003, T004, T005, T006, T007, T008, T009 are
  all [P] — seven file edits in different files can land
  in any order before the atomic commit.
- **Phase 3**: T013–T020 can each run independently; in
  practice they're run sequentially for clearer reporting,
  but a CI matrix could parallelize them.
- **Phase 7**: T031, T032, T033 are [P] — three file reads
  with no dependencies.
- **Phase 8**: T034, T035 are [P] — one reads files, one
  probes binaries.

---

## Parallel Example: User Story 1

```bash
# T021: Push the branch
git push origin 002-v1-release

# T022: Open the PR (one shell call after T021)
gh pr create --base main --head 002-v1-release \
  --title "chore(release): cut argdown-2 v1.0.0" \
  --body "$(cat <<'EOF'
This PR cuts the v1.0.0 release of argdown-2. See specs/002-v1-release/spec.md.

Local pre-flight green:
- deno task test
- deno task lint
- deno task fmt:check
- deno task check
- deno task check:npm-allowlist
- deno task check:mcp-deno
- deno task publish:dry-run
- bash scripts/argdown-2-mcp.test.sh
EOF
)"

# T023: Wait for CI green (blocking; can be polled via gh pr checks)
gh pr checks --watch

# T024: Merge the PR (one shell call after T023 is green)
gh pr merge --merge --delete-branch=false
```

## Parallel Example: User Story 4

```bash
# T031, T032, T033 can run together after the v1.0.0 tag exists:
git checkout v1.0.0
(jq -r '.version' plugins/argdown-2/.claude-plugin/plugin.json) &
(jq -r '.version' package.json) &
(jq -r '.version' package-lock.json; \
 jq -r '.packages[""].version' package-lock.json) &
wait
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (the atomic version-pin commit).
3. Complete Phase 3: Quality Gates (local pre-flight green).
4. Complete Phase 4: User Story 1 (PR + merge + JSR stable publish).
5. **STOP and VALIDATE**: Confirm
   `https://jsr.io/@casualtheorics/argdown-2/meta.json` lists
   `1.0.0` as a stable version.
6. The MVP is "library consumer can `deno add jsr:@...` and get
   `1.0.0`".

### Incremental Delivery

The release cut is fundamentally one atomic operation followed
by CI automation; "incremental delivery" here means the
verification phases (5–9) can each complete as soon as the
upstream phase lands:

1. Phase 2 atomic commit + Phase 3 quality gates → "ready to
   push".
2. Phase 4 US1 (merge to main) → JSR stable version listed.
3. Phase 5 US2 (release.yml completes) → GitHub Release with
   5 assets.
4. Phase 6 US3 (release body verified) → CHANGELOG ↔ GitHub
   Release body byte-equality.
5. Phase 7 US4 (manifest parity verified) → marketplace + Pi
   read `1.0.0`.
6. Phase 8 US5 (cross-channel audit) → zero drift across all
   six channels.
7. Phase 9 Polish (quickstart validation) → all 8 success
   criteria pass; cut complete.

### Parallel Team Strategy

With a single release engineer the phases are sequential. If
two engineers coordinate:

- Engineer A: Phases 1–4 (setup, version-pin commit, gates,
  merge).
- Engineer B: Phases 5–6 (verify release.yml output as soon as
  merge lands).
- Both: Phase 7 + 8 + 9 (audit + polish in parallel).

---

## Notes

- The release cut is a stability boundary, not a feature
  delivery (FR-014). No new tests are generated; existing
  parity tests are the verification mechanism.
- The atomic commit in Phase 2 is the bisectable cut point —
  one commit, one tag, one GitHub Release, one JSR stable
  version.
- README refresh is deferred to a separate fresh grfp run
  (per Q2 / FR-015); the announcement surface is the PR
  description (per Q5).
- All file paths are relative to repository root unless
  otherwise noted.
- The launcher's existing test suite
  (`scripts/argdown-2-mcp.test.sh`) is the SC-002 verification
  mechanism — Phase 3 task T020 runs it locally before push.