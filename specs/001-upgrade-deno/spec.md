# Feature Specification: Upgrade Pinned Deno to Latest Stable

**Feature Branch**: `[001-upgrade-deno]`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "upgrade to the latest deno version"

> This spec covers moving the project from its current pinned Deno release to
> the latest stable Deno release on the supported distribution channels. The
> host CLI invocations, the CI pipeline, and the native MCP binary compilation
> path must all agree on the new pinned version.

## Clarifications

### Session 2026-08-07

- Q: Does this Deno upgrade PR require a `CHANGELOG.md` entry under `[Unreleased]`? → A: No — runtime upgrades are housekeeping, not user-visible.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Day-to-day development uses a current Deno (Priority: P1)

As a contributor running the project locally, I want `deno task test`,
`deno task lint`, `deno task fmt:check`, `deno task check`, and
`deno task check:mcp-deno` to run against the same Deno release that the
project currently advertises, so that I do not silently fall behind and miss
patches, language features, or V8/TypeScript improvements that affect this
codebase.

**Why this priority**: Without an honest, current pin, every contributor's
local results drift away from what CI runs, and stale-tooling bugs surface
in production-shaped environments rather than in development.

**Independent Test**: Install the latest stable Deno on a clean machine, run
the full task suite, and confirm every gate matches the project's current
expected behavior.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** a contributor follows the README
   install instructions for Deno, **Then** the version they install matches
   the version the project pins, and `deno task test` passes without
   "version mismatch" errors.
2. **Given** the project documents a pinned Deno version, **When** a new
   stable Deno release is published upstream, **Then** there is an explicit,
   tracked decision to upgrade or hold the pin (this feature implements the
   "upgrade" path).

---

### User Story 2 - CI and release pipelines agree with the local pin (Priority: P1)

As a maintainer who trusts the CI pipeline to gate releases, I want the
GitHub Actions workflows that install Deno (CI and Release) to consume the
exact same version pin that the local scripts and the constitution document,
so that a green CI run is meaningful and reproducible.

**Why this priority**: If CI installs a different Deno than the docs/pin,
local "all green" runs no longer predict remote runs, and release artifacts
could be compiled against an unvetted runtime.

**Independent Test**: Read the CI and Release workflow files and verify
both workflows resolve to the same version string the project pins, with no
hard-coded secondary version pins elsewhere in the workflow.

**Acceptance Scenarios**:

1. **Given** the project's pinned Deno version, **When** the CI workflow
   runs, **Then** it installs exactly that version via the shared version
   file rather than a hard-coded literal.
2. **Given** the project's pinned Deno version, **When** the Release
   workflow compiles the native MCP binary and probes it, **Then** the
   installed Deno matches the same pin.

---

### User Story 3 - Native MCP binary still ships from the new pin (Priority: P2)

As a consumer of the published `argdown-2-mcp` stdio binary, I want the
release artifacts to be compiled with a supported Deno release and to
continue to pass the stdio probe on Linux, so that downstream Claude Code
and Pi installs behave identically after the upgrade as before.

**Why this priority**: The shipped artifact is the product. A pin upgrade
that breaks the host-target compile or the stdio probe is a release blocker
even if every other gate passes.

**Independent Test**: Compile the host-target binary, run the stdio probe
against it, and verify all 14 MCP tools still register and respond.

**Acceptance Scenarios**:

1. **Given** the new pinned Deno version, **When** `deno task compile:mcp`
   runs on the host, **Then** the compiled binary executes successfully and
   matches the prior artifact shape (entry point, flags, runtime behavior).
2. **Given** the new pinned Deno version, **When** `deno task probe:mcp
   <bin>` runs against the compiled binary, **Then** the probe reports a
   healthy handshake with all 14 MCP tools available.

---

### Edge Cases

- What happens when the latest stable Deno release deprecates a runtime
  flag or API that `scripts/compile-mcp.sh`, `scripts/check-mcp-deno.sh`,
  or the `src/mcp/cli.ts` entry currently relies on?
- What happens when the new release changes TypeScript or V8 defaults in a
  way that the typecheck or the solver/bench fixtures produce different
  output (CI red on otherwise-identical code)?
- What happens when upstream changes the deno.lock format or the JSR
  publish protocol and `deno task publish:dry-run` (or `deno publish`)
  refuses to run with the same flags as before?
- What happens when the bundled `@modelcontextprotocol/sdk` from npm, the
  vendored `edn-parser-js`, or the vendored Effect source under `vendor/`
  is incompatible with the new Deno V8/Node-compat surface?
- What happens when the new Deno release breaks an existing test that
  relied on prior default behavior of `sanitizeOps` / `sanitizeResources`
  (already worked around in `src/pi-package.test.ts` for one specific case)?
- What happens if a stale local Deno is left installed and is incompatible
  with the project pin (today, `scripts/compile-mcp.sh` and
  `scripts/check-mcp-deno.sh` refuse to run with a mismatched binary)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST pin a single, current stable Deno release in
  `scripts/deno-version`, and that pin MUST be the latest stable Deno
  release at the time this feature is implemented.
- **FR-002**: All tools that gate on "is the right Deno installed"
  (`scripts/compile-mcp.sh`, `scripts/check-mcp-deno.sh`) MUST continue to
  refuse to run when the on-disk `deno` does not match `scripts/deno-version`.
- **FR-003**: The CI workflow (`.github/workflows/ci.yml`) MUST install Deno
  from `scripts/deno-version` and MUST NOT hard-code a secondary version
  literal.
- **FR-004**: The Release workflow (`.github/workflows/release.yml`) MUST
  install Deno from `scripts/deno-version` and MUST NOT hard-code a
  secondary version literal.
- **FR-005**: Every documented Deno reference in the project (README,
  AGENTS.md, constitution, the inline comment in `src/pi-package.test.ts`
  that names a specific Deno version) MUST either be removed, generalized,
  or updated so it does not contradict the new pin. `CHANGELOG.md` is
  intentionally excluded — runtime pin bumps are housekeeping and do not
  warrant an `[Unreleased]` entry under the constitution's CHANGELOG
  policy.
- **FR-006**: The new pin MUST be applied atomically: one PR that bumps
  `scripts/deno-version` and updates every co-located literal in the same
  change, so CI cannot pass against an inconsistent state.
- **FR-007**: `deno.lock` MUST be regenerated against the new pin, and any
  resolver or compatibility warnings surfaced by `deno check --frozen` MUST
  be resolved before the PR is mergeable.
- **FR-008**: The full quality gate suite documented in the constitution
  (`deno task test`, `lint`, `fmt:check`, `check`, `check:mcp-deno`,
  `compile:mcp`, `probe:mcp`, `check:npm-allowlist`, `publish:dry-run`)
  MUST pass on the new pin without any test or snapshot being skipped,
  deleted, or weakened to accommodate the upgrade.
- **FR-009**: The JSR slow-types check (`deno task publish:dry-run`) MUST
  remain clean, since the project publishes a `*-dev.{utcTimestamp}`
  prerelease on every merge to `main`.
- **FR-010**: If the upgrade requires any code, dependency, or fixture
  change to keep the gates green, that change MUST be included in the same
  PR (no "follow-up TODO" for what is essentially a runtime-compatibility
  fix). If a follow-up is unavoidable, it MUST be tracked as a `TODO()`
  with a clear owner and a concrete next step, per the constitution's
  amendment procedure.

### Key Entities

- **Deno pin**: The single line in `scripts/deno-version` that names the
  supported Deno release. Every other runtime reference in the repo MUST
  trace back to this file (no duplicated literals).
- **Quality gate**: One of the `deno task` invocations listed in the
  constitution's "Day-to-day tasks" table. Each gate is the contract that
  the upgrade MUST keep green.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the upgrade, `deno --version` on a clean install using
  only the documented instructions reports the same version string that
  appears in `scripts/deno-version`, with zero drift between local, CI,
  and Release.
- **SC-002**: All nine documented gates (`test`, `lint`, `fmt:check`,
  `check`, `check:mcp-deno`, `compile:mcp`, `probe:mcp`,
  `check:npm-allowlist`, `publish:dry-run`) pass on the new pin in a
  single CI run on every supported host target.
- **SC-003**: The host-target `argdown-2-mcp` binary compiled against the
  new pin still serves the 14 MCP tools and passes the stdio probe
  (handshake + tool list), so downstream Claude Code and Pi installs
  remain functional.
- **SC-004**: No code, dependency, or fixture in the project is weakened
  (skipped test, deleted snapshot, muted lint rule, removed assertion) in
  order to make the upgrade pass.
- **SC-005**: The JSR `*-dev.{utcTimestamp}` prerelease that fires on
  merge to `main` still publishes successfully against the new pin.

## Assumptions

- The latest stable Deno release at the time of this work is acceptable to
  pin (no hold required for a known upstream regression). If the latest
  stable release is known-broken, pin the most recent known-good stable
  release and document why.
- The upgrade is treated as a single coordinated PR rather than a rolling
  set of small bumps; the constitution's "one PR per non-negotiable
  change" precedent applies because the pin is a non-negotiable runtime
  contract.
- No new runtime feature, API, or CLI flag introduced by the new Deno is
  required to complete this feature; only version metadata and any
  compatibility shims the new release forces.
- The vendored `edn-parser-js` and the vendored Effect source under
  `vendor/` are compatible with the new Deno's Node-compat surface; if
  not, this PR also updates them.
- The npm allowlist (`npm:zod`, `npm:effect`, `npm:@modelcontextprotocol/sdk`)
  is not affected by the upgrade; any new npm import required to keep the
  gates green is a separate proposal.
- The CI host targets (x86_64-apple-darwin, aarch64-apple-darwin,
  x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu) all support the
  new pin; if upstream drops a target, that target's binary is removed
  from the release matrix in the same PR.