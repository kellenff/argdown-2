# Feature Specification: Cut argdown-2 v1.0.0 Release

**Feature Branch**: `[002-v1-release]`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "cut a 1.0 release"

> This spec governs the one-time work of cutting the first stable
> `1.0.0` release of `argdown-2`. The codebase already satisfies the
> v1 baseline documented in `specs/20260807-v1-baseline/spec.md`; what
> remains is the release-process work that converts the current
> `0.2.0-alpha4` artifact into a stable `1.0.0` artifact across every
> distribution channel (JSR library, native MCP binaries on GitHub
> Releases, Claude Code marketplace, Pi coding-agent package, npm
> package-lock).
>
> Scope is the release cut itself: version bumps, CHANGELOG closure,
> README refresh, multi-platform binary compilation, stdio probe,
> checksums, GitHub Release creation, and JSR stable publish. No new
> library features ship in `1.0.0`; every functional change is
> already in `0.2.0-alpha4` and is re-documented under
> `[1.0.0] - 2026-08-07`.

## Clarifications

### Session 2026-08-07

- Q: What should happen to the 7-line preamble in the current `[Unreleased]` block that explains why `0.2.0-alpha5` was reverted, when that block is promoted to `[1.0.0] - 2026-08-07`? → A: Remove the preamble entirely; let `[1.0.0]` start with `### Added`.
- Q: What is the scope of the README refresh in this release cut — only the opening blockquote that references `0.2.0-alpha4`, or every `0.2.0-alpha4` reference anywhere in the file? → A: Defer the README refresh entirely; a separate "fresh grfp run" will handle the README at the end of this spec.
- Q: Should the `[1.0.0] - 2026-08-07` date in `CHANGELOG.md` be hardcoded to today, or should it be the actual GitHub Release creation date (which may shift if the cut is retried)? → A: Hardcode `[1.0.0] - 2026-08-07` at PR time; do not change on retry.
- Q: Should the release engineer run an explicit consumer-facing smoke test (e.g., `deno add jsr:@casualtheorics/argdown-2` in a fresh directory, or `bash scripts/argdown-2-mcp` against a clean `XDG_CACHE_HOME` with a real round-trip) as a hard post-release acceptance step? → A: Rely on `release.yml`'s built-in probe + in-source tests; no extra post-release step.
- Q: After the cut lands, should the release engineer perform any post-cut announcement / observability step (e.g., a GitHub Discussion, a Discord post, a project README status badge update, or simply report completion in the PR description)? → A: Announce via the cut PR description (or merge commit message); no separate discussion thread or README badge.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Consume a stable v1.0.0 release from JSR (Priority: P1)

As a downstream library consumer, I want to import a stable, non-prerelease
version of `@casualtheorics/argdown-2` from JSR — one without a pre-release
tag — so that my `deno.lock` resolves a version that signals long-term
support and a frozen wire format, not an alpha that may break on the next
merge.

**Why this priority**: JSR is the library's primary distribution channel
(the constitutional "Distribution channels" section). A v1 release that
fails to publish a stable JSR version leaves every consumer stuck on an
alpha tag.

**Independent Test**: Query the JSR registry for
`@casualtheorics/argdown-2@1.0.0` and confirm the listed version is the
exact string `1.0.0` (no `-dev.*` or `-alpha.*` suffix), the publish
metadata reports a stable release, and the published API surface matches
the re-exports from `src/index.ts` documented in the v1 baseline spec.

**Acceptance Scenarios**:

1. **Given** a clean JSR registry, **When** `deno publish` runs against the
   `1.0.0` tag in `deno.json`, **Then** JSR lists `@casualtheorics/argdown-2@1.0.0`
   as a stable release with no prerelease qualifier.
2. **Given** a downstream consumer's `deno.lock`, **When** they
   `deno add jsr:@casualtheorics/argdown-2` after the cut, **Then** the
   resolved version is `1.0.0` (not `1.0.0-dev.<timestamp>`).
3. **Given** the published `1.0.0` artifact, **When** a consumer re-runs
   the v1 baseline acceptance scenarios from
   `specs/20260807-v1-baseline/spec.md`, **Then** every scenario passes
   against the published artifact exactly as it passed against the
   pre-release source.

---

### User Story 2 — Run the pinned MCP binary via the launcher (Priority: P1)

As a Claude Code or Pi consumer, I want `bash scripts/argdown-2-mcp` to
fetch and execute the `1.0.0` native binary from GitHub Releases, so
that the MCP server I install today continues to match the binary that
the launcher pins (instead of silently tracking whatever the latest
release is).

**Why this priority**: The launcher pins a specific version. Cutting a
release without updating the launcher pin leaves every Claude Code and
Pi install stuck on `0.2.0-alpha4` even after `1.0.0` ships — a silent
distribution failure the constitution explicitly guards against
(`src/claude-plugin.test.ts` enforces `scripts/argdown-2-mcp.version`
matches `deno.json#version`).

**Independent Test**: Run the existing launcher test suite
(`scripts/argdown-2-mcp.test.sh`, which exercises all four launcher
paths: `ARGDOWN2_MCP_BIN` override, versioned `XDG_CACHE_HOME`
cache, fresh download with `sha256sums.txt` verification, and
unsupported-OS refusal) plus the in-CI stdio probe from `release.yml`
against the `x86_64-unknown-linux-gnu` binary
(`scripts/probe-mcp-stdio.ts`). Together these confirm the
`v1.0.0` launcher behavior and the 14-tool contract without requiring
a human-driven post-release smoke test.

**Acceptance Scenarios**:

1. **Given** `scripts/argdown-2-mcp.version` reads `1.0.0`, **When** a
   Claude Code or Pi consumer invokes the launcher, **Then** the
   launcher downloads `argdown-2-mcp-<target>` from the `v1.0.0` GitHub
   Release and exits zero after a successful stdio round-trip
   (`initialize` → `tools/list`).
2. **Given** a corrupted cache entry for the `1.0.0` binary, **When**
   the launcher runs, **Then** it re-downloads from the release, the
   `sha256sums.txt` check rejects the corrupted file, and the
   corruption is reported with the expected checksum for diagnosis.
3. **Given** the four compiled binaries (`x86_64-apple-darwin`,
   `aarch64-apple-darwin`, `x86_64-unknown-linux-gnu`,
   `aarch64-unknown-linux-gnu`) on the GitHub Release, **When** any one
   is probed, **Then** the stdio handshake (`initialize` → `tools/list`)
   succeeds and the `listTools` payload lists exactly the 14 tool names
   in the v1 baseline contract.

---

### User Story 3 — Trust the v1 release as the stability boundary (Priority: P2)

As a downstream skill author or example maintainer, I want the v1.0.0
GitHub Release to carry an exact CHANGELOG section (not the prior
`Unreleased` block) so that I can cite a specific version when pinning
fixtures, examples, or skill prompts against the v1 wire format.

**Why this priority**: The v1 baseline spec calls out `specs/20260807-v1-baseline/spec.md:36-44`
("wire stability") as the principle every skill and example depends on.
A release whose `CHANGELOG.md` still says `[Unreleased]` for the
shipped content defeats that principle; downstream consumers cannot
pin against an unreleased section.

**Independent Test**: Read `CHANGELOG.md` at the `v1.0.0` tag and
confirm: (a) a `[1.0.0] - 2026-08-07` section exists with the full
content previously under `[Unreleased]`, with the alpha-rollback
preamble deleted; (b) no `[Unreleased]` section remains (unless
follow-up work is pending); (c) a `[0.2.0-alpha4]` reference link is
present at the bottom; (d) the GitHub Release body for `v1.0.0` is
byte-equal to that section.

**Acceptance Scenarios**:

1. **Given** the v1 release tag, **When** a maintainer reads
   `CHANGELOG.md`, **Then** the entries that previously lived under
   `[Unreleased]` are now under `[1.0.0] - 2026-08-07`, with no
   `[Unreleased]` section remaining and a fresh empty `[Unreleased]`
   placeholder if any follow-up work is pending.
2. **Given** the v1 release tag, **When** a downstream consumer reads
   the GitHub Release body, **Then** it matches the `[1.0.0] -
   2026-08-07` CHANGELOG section verbatim (no alpha rollback preamble,
   no duplicated entries).

---

### User Story 4 — Install via Claude Code or Pi marketplace against v1.0.0 (Priority: P2)

As a Claude Code or Pi user, I want the marketplace manifest
(`.claude-plugin/marketplace.json`) and the nested plugin manifest
(`plugins/argdown-2/.claude-plugin/plugin.json`) to advertise version
`1.0.0`, and the root Pi `package.json` to advertise the same, so that
`/plugin install argdown-2@argdown-2` and `pi install git:...` resolve
to the stable release instead of a pinned `0.2.0-alpha4`.

**Why this priority**: Marketplaces and Pi package manifests are the
discoverability surface. A v1 cut that leaves the manifests on
`0.2.0-alpha4` makes the stable release invisible to the install
commands.

**Independent Test**: Read the marketplace manifest, the nested plugin
manifest, the root `package.json`, the canonical launcher pin
(`scripts/argdown-2-mcp.version`), and the plugin launcher pin
(`plugins/argdown-2/scripts/argdown-2-mcp.version`). Confirm every
version string is the exact same `1.0.0` value as
`deno.json#version`. Confirm `deno task test` passes
(`src/claude-plugin.test.ts` and `src/pi-package.test.ts` enforce this
parity).

**Acceptance Scenarios**:

1. **Given** the v1 release tag, **When** Claude Code resolves the
   marketplace, **Then** the nested plugin manifest advertises
   `version: "1.0.0"` and the plugin's `scripts/argdown-2-mcp.version`
   reads `1.0.0`.
2. **Given** the v1 release tag, **When** Pi resolves the root
   `package.json`, **Then** `version` reads `1.0.0` and matches
   `deno.json#version`.
3. **Given** all five pinned version strings, **When**
   `deno task test` runs, **Then** the parity assertions in
   `src/claude-plugin.test.ts` and `src/pi-package.test.ts` pass without
   modification.

---

### User Story 5 — Use one CLI / one MCP binary / one library, all at v1 (Priority: P3)

As a consumer who uses more than one distribution channel at once, I
want every shipped artifact (JSR library, the four native MCP
binaries, the Claude Code marketplace plugin, the Pi package, and the
embedded MCP server version string) to report the same `1.0.0` version
on inspection, so that I can confidently audit a single version across
my stack.

**Why this priority**: Version drift between channels is the
distribution failure mode the constitution explicitly calls out
("Verify launcher pin matches deno.json version" in `release.yml`).
Catching drift before the release tag is created is cheaper than
catching it after consumers pin against a mismatched binary.

**Independent Test**: For each distribution channel, read the version
string it advertises (library: JSR metadata; each binary: `--version`
or `initialize` server response; Claude Code plugin: `plugin.json`;
Pi package: `package.json`; embedded MCP: `src/mcp/server.ts`
constant). Confirm every value is the exact string `1.0.0`. Confirm
`package-lock.json` was regenerated to reflect the root
`package.json#version` change.

**Acceptance Scenarios**:

1. **Given** the v1 release tag, **When** each MCP binary is launched
   with `--version` or completes `initialize`, **Then** the reported
   server version is `1.0.0` (matching `src/mcp/server.ts`).
2. **Given** the v1 release tag, **When** `package-lock.json` is
   inspected, **Then** the root package's `version` field reads
   `1.0.0` and matches the new root `package.json`.

---

### Edge Cases

- What happens if a quality gate fails after the version bump but
  before the tag is pushed? → The release PR is held, the version
  bump is reverted (or the PR is amended with a fix), and the cut is
  re-attempted from a green pipeline.
- What happens if the GitHub Release is created but the JSR stable
  publish step fails or "already published"? → `release.yml` treats
  `already published` as success (`release.yml:244-247`); for any
  other JSR error the release is held and re-attempted from a green
  pipeline.
- What happens if a downstream consumer has already cached the
  `0.2.0-alpha4` binary in `XDG_CACHE_HOME`? → The launcher's
  `argdown-2/mcp/<version>/` cache path is keyed by the launcher pin,
  so a `1.0.0` invocation creates a new cache directory and the
  `0.2.0-alpha4` entry is left in place (no forced re-download, but
  the new version lives next to it).
- What happens if the alpha → stable transition happens with a hot
  merge landing additional code? → `release.yml` compares
  `deno.json#version` against `HEAD~1:deno.json` and only triggers the
  stable release if the version string changed; any merge to `main`
  without a version bump publishes a `*-dev.<timestamp>` prerelease
  only (`release.yml:80-93`).
- What happens if a third party has hand-edited an EDN file in their
  consumer tree? → Out of scope for the release cut; the v1 baseline
  spec's UX contracts already forbid hand-editing in
  `README.md`/skill prompts (Constitution §V).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The release cut MUST bump `deno.json#version` from
  `0.2.0-alpha4` to `1.0.0` so that the release workflow's version
  detection (`release.yml:Detect version bump`) flags the change as a
  stable release trigger.
- **FR-002**: The release cut MUST update
  `scripts/argdown-2-mcp.version` to `1.0.0`, satisfying the
  `Verify launcher pin matches deno.json version` gate
  (`release.yml:144-154`) and the parity test in
  `src/claude-plugin.test.ts:80-82`.
- **FR-003**: The release cut MUST update
  `plugins/argdown-2/scripts/argdown-2-mcp.version` to `1.0.0` and
  byte-equivalent its launcher copy `plugins/argdown-2/scripts/argdown-2-mcp`
  to canonical `scripts/argdown-2-mcp`, satisfying the byte-equivalence
  test in `src/claude-plugin.test.ts:85-91`.
- **FR-004**: The release cut MUST update
  `plugins/argdown-2/.claude-plugin/plugin.json#version` to `1.0.0`,
  satisfying the `plugin.json version` parity test in
  `src/claude-plugin.test.ts:43-55`.
- **FR-005**: The release cut MUST update the root `package.json#version`
  to `1.0.0` and regenerate `package-lock.json`, satisfying the
  Pi manifest test in `src/pi-package.test.ts:43-59`.
- **FR-006**: The release cut MUST update `src/mcp/server.ts`'s embedded
  MCP server version constant from `0.2.0-alpha4` to `1.0.0` so the
  `initialize` handshake reports the same version as every other
  distribution channel.
- **FR-007**: The release cut MUST convert the `CHANGELOG.md`
  `[Unreleased]` section into a dated `[1.0.0] - 2026-08-07`
  section, deleting the alpha-rollback preamble (the 7-line blockquote
  that explained why `0.2.0-alpha5` was reverted) so that `[1.0.0]`
  starts with `### Added`; the historical `[0.2.0-alpha4]` link
  reference MUST be preserved at the bottom of the file. The
  `2026-08-07` date MUST be hardcoded at the time the version-bump PR
  is opened and MUST NOT shift on retry — the date represents when
  the v1 cut was initiated, not when `release.yml` last ran.
- **FR-008**: The release cut MUST leave an empty `[Unreleased]`
  section in `CHANGELOG.md` if any follow-up work is pending after the
  cut, so subsequent PRs have a known home for entries.
- **FR-009**: The release cut MUST pass every Deno quality gate on the
  bumped commit: `deno task test`, `deno task lint`, `deno task fmt:check`,
  `deno task check`, `deno task check:npm-allowlist`,
  `deno task check:mcp-deno`, and `deno task publish:dry-run`.
- **FR-010**: The release cut MUST compile the four native MCP binaries
  for `x86_64-apple-darwin`, `aarch64-apple-darwin`,
  `x86_64-unknown-linux-gnu`, and `aarch64-unknown-linux-gnu` via
  `bash scripts/compile-mcp.sh --all`, producing files at
  `dist/mcp-bin/argdown-2-mcp-<target>`.
- **FR-011**: The release cut MUST run the stdio probe
  (`deno task probe:mcp`) against at least the `x86_64-unknown-linux-gnu`
  binary and confirm the 14-tool contract handshake
  (`src/mcp/server.test.ts` parity), per
  `release.yml:Probe Linux MCP binary`.
- **FR-012**: The release cut MUST generate `dist/mcp-bin/sha256sums.txt`
  containing exactly four SHA-256 lines (one per target binary), per
  `release.yml:Generate checksums`.
- **FR-013**: The release cut MUST push the `v1.0.0` git tag and
  publish a GitHub Release titled `argdown-2 v1.0.0` whose body is
  the byte-equal `[1.0.0] - 2026-08-07` CHANGELOG section and whose
  asset bundle is the four binaries plus `sha256sums.txt`, per
  `release.yml:Create GitHub Release (binaries only)`.
- **FR-014**: The release cut MUST publish `1.0.0` to JSR as a stable
  (non-prerelease) version of `@casualtheorics/argdown-2`, treating
  `already published` as success and any other publish error as a
  release blocker, per `release.yml:Publish stable JSR`.
- **FR-015**: The release cut MUST NOT introduce any new functional
  change to `src/`, `pi/`, `plugins/`, or the vendored EDN parser —
  the v1 release is a stability boundary, not a feature delivery. Any
  fixup discovered during the cut MUST land in a separate PR before the
  cut runs.
- **FR-016**: The release cut MUST NOT touch `README.md`. The README
  refresh is deferred to a separate "fresh grfp run" that follows
  this spec; the `0.2.0-alpha4` reference at `README.md:5` stays
  unchanged through the cut and is updated as part of the grfp run.

### Key Entities

- **Release**: A single dated GitHub Release + JSR version + git tag
  carrying the same version string. Attributes: `version` (e.g.
  `1.0.0`), `date` (e.g. `2026-08-07`), `channels` (the four native
  MCP binaries + JSR library + marketplace + Pi package), `notes`
  (the CHANGELOG section), `prerelease` (boolean; `false` for `1.0.0`).
- **Version pin**: A single version string that appears in five places
  — `deno.json#version`, `scripts/argdown-2-mcp.version`,
  `plugins/argdown-2/scripts/argdown-2-mcp.version`,
  `plugins/argdown-2/.claude-plugin/plugin.json#version`, and root
  `package.json#version` — plus a sixth embedded constant in
  `src/mcp/server.ts`. The release cut enforces parity across all six.
- **Native MCP binary**: A `deno compile` artifact for one of four
  target triples (`x86_64-apple-darwin`, `aarch64-apple-darwin`,
  `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`). The
  release cut produces all four, plus a `sha256sums.txt` covering
  each, plus a stdio probe confirmation for at least the Linux build.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the release cut, a clean `deno add
  jsr:@casualtheorics/argdown-2` resolves to version `1.0.0`
  (verified via `jsr.io/@casualtheorics/argdown-2@1.0.0` returning a
  stable-release metadata page).
- **SC-002**: After the release cut, the launcher's existing test
  suite (`scripts/argdown-2-mcp.test.sh`, which exercises the four
  launcher paths: env override, versioned cache, download with
  `sha256sums.txt` verification, and unsupported OS) confirms that a
  fresh invocation on a clean `XDG_CACHE_HOME` downloads the
  `v1.0.0` GitHub Release asset, verifies `sha256sums.txt`, and execs
  the matching target binary. No human-driven post-release smoke test
  is required.
- **SC-003**: After the release cut, the `v1.0.0` GitHub Release
  contains exactly five assets: four named binaries (one per target)
  and `sha256sums.txt`, each downloadable individually and covered
  by `fail_on_unmatched_files` (release.yml:222).
- **SC-004**: After the release cut, the GitHub Release body for
  `v1.0.0` is byte-equal to the `[1.0.0] - 2026-08-07` section
  extracted from `CHANGELOG.md` by the `Extract CHANGELOG notes`
  step (`release.yml:179-196`).
- **SC-005**: After the release cut, every one of the six pinned
  version strings (`deno.json#version`,
  `scripts/argdown-2-mcp.version`,
  `plugins/argdown-2/scripts/argdown-2-mcp.version`,
  `plugins/argdown-2/.claude-plugin/plugin.json#version`,
  `package.json#version`, and `src/mcp/server.ts` embedded constant)
  reads `1.0.0` and `deno task test` passes
  (`src/claude-plugin.test.ts:43-91` and `src/pi-package.test.ts:43-59`).
- **SC-006**: The release cut's PR (or merge commit) runs every Deno
  quality gate green in CI before merge: `deno task test`,
  `deno task lint`, `deno task fmt:check`, `deno task check`,
  `deno task check:npm-allowlist`, `deno task check:mcp-deno`, and
  `deno task publish:dry-run`. The `dry-run-publish` CI job
  succeeds.
- **SC-007**: After the release cut, the stdio probe against the
  Linux binary (`deno run -A scripts/probe-mcp-stdio.ts
  ./dist/mcp-bin/argdown-2-mcp-x86_64-unknown-linux-gnu`) returns
  zero and the probe output lists exactly the 14 tools in the v1
  baseline contract (`src/mcp/server.test.ts` parity).
- **SC-008**: After the release cut, `CHANGELOG.md` contains a
  dated `[1.0.0] - 2026-08-07` section with the content previously
  under `[Unreleased]`, no `[Unreleased]` block (unless follow-up
  entries have been added), and a `[0.2.0-alpha4]` link reference at
  the file footer for historical pinning.

## Assumptions

- The v1 baseline principles documented in
  `.specify/memory/constitution.md` (v1.0.0) and the v1 baseline spec
  at `specs/20260807-v1-baseline/spec.md` are ratified and the
  underlying functionality is already shipping in `0.2.0-alpha4`.
  The release cut assumes every functional requirement in the v1
  baseline spec is currently satisfied; this spec does not re-derive
  them.
- The version bump from `0.2.0-alpha4` to `1.0.0` is a SemVer MAJOR
  jump that the constitution treats as the wire-stability boundary
  (Constitution §II). No prior `0.2.0` stable release exists; the
  four prior tags (`0.1.0-alpha1`, `0.2.0-alpha1` through
  `0.2.0-alpha4`) are all prereleases.
- The release cut assumes the GitHub Actions workflows
  (`.github/workflows/release.yml`) and the launcher scripts
  (`scripts/compile-mcp.sh`, `scripts/argdown-2-mcp`,
  `scripts/probe-mcp-stdio.ts`) are unchanged from their current
  shape — no automation rewrite ships in this cut. Any automation
  change discovered during the cut lands as a separate PR.
- The release cut assumes the GitHub token and JSR OIDC trust
  configuration used by `release.yml` (`id-token: write`,
  `contents: write`) remain valid at the time of cut.
- The release cut assumes the four target triples
  (`x86_64-apple-darwin`, `aarch64-apple-darwin`,
  `x86_64-unknown-linux-gnu`, `aarch64-unknown-linux-gnu`) continue
  to be the supported distribution targets; adding or removing a
  target is out of scope.
- The release cut assumes the README's "Install in Claude Code" /
  "Install in Pi" install commands remain stable; the README is NOT
  refreshed by this cut. A separate "fresh grfp run" handles the
  README update as a follow-up after the cut completes (including
  replacing the `0.2.0-alpha4` reference at `README.md:5`).
- The release cut assumes `package-lock.json` is regenerated as part
  of the same commit as the `package.json#version` bump, not in a
  follow-up — this keeps a single atomic commit per channel.
- The release cut's announcement surface is the cut PR description /
  merge commit message only. No GitHub Discussion, no Discord post,
  no README status badge are required by this cut. The fresh grfp
  run that follows may add a README status badge if the maintainer
  chooses, but doing so is out of scope for this spec.