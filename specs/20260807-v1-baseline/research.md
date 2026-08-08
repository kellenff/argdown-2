# Research: argdown-2 v1 Baseline

**Date**: 2026-08-07
**Branch**: `20260807-v1-baseline`
**Spec**: [spec.md](./spec.md)

> **No NEEDS CLARIFICATION markers** exist in the spec; this research
> file documents the **decision trail** that the spec already implies,
> plus an **FR-by-FR coverage audit** confirming each requirement is
> already implemented in the current `0.2.0-alpha4` codebase. Any FR
> not satisfied is recorded as a v1 release blocker at the end.

## Decisions

### D1. Spec framing: hybrid (journey + footer table)

- **Decision**: User stories are written as journeys (one per
  constitutional principle or section); a Constitution Cross-Reference
  appendix maps every FR to its principle and story.
- **Rationale**: Pure journey form hides the principle→FR audit
  trail; pure principle form buries the user-facing story. The
  hybrid gives both audiences what they need without duplication.
- **Alternatives considered**:
  - *Journey only*: rejected — auditors cannot trace a story back
    to a principle without re-reading the constitution.
  - *Principle only*: rejected — agents and downstream consumers
    cannot find their use case without a journey narrative.

### D2. Baseline vs prospective spec

- **Decision**: This spec is a **baseline** (target state for v1.0.0),
  not a retrospective of `0.2.0-alpha4`. Any FR not currently
  satisfied is a v1 release blocker.
- **Rationale**: The project is pre-1.0; aligning the spec with the
  current featureset means declaring what v1 must look like, then
  measuring the gap. A retrospective spec would have no release
  gating power.
- **Alternatives considered**:
  - *Retrospective spec*: rejected — provides no release gate.
  - *Forward-only roadmap*: rejected — would not exercise the
    current featureset to verify it works.

### D3. No `[NEEDS CLARIFICATION]` markers

- **Decision**: Zero clarification markers in the spec. All open
  questions (tag stability, solver set, distribution channels, test
  discipline) are resolved by `.specify/memory/constitution.md` v1.0.0.
- **Rationale**: The constitution already pins the answers; the spec
  cites the constitution's commitments via the cross-reference
  appendix. Adding clarification markers would duplicate the
  constitution's authority.
- **Alternatives considered**:
  - *Three clarification questions*: rejected — the constitution is
    the source of truth; asking the user to re-clarify already-pinned
    decisions is friction without value.

### D4. Six solver set is exhaustive for v1

- **Decision**: The spec enumerates exactly six solver roots
  (`grounded`, `bipolar`, `evidential`, `preferred`, `stable`,
  `complete`) and treats `undercut` and ASPIC+ as out of scope.
- **Rationale**: `src/model.ts` exports these six as the `SOLVER_TAGS`
  tuple; adding more would require a new `SOLVER_TAGS` entry plus a
  CHANGELOG addition (per constitution FR-006). `undercut` is
  intentionally rejected by every current solver; ASPIC+ full
  evidential is a separate research effort.
- **Alternatives considered**:
  - *Add ASPIC+ as a v1 requirement*: rejected — out of scope per
    constitution's "Distribution Channels" and current
    `src/grounded.ts` limitations.
  - *Add undercut support*: rejected — no current solver consumes
    undercut; introducing it would require a new solver.

### D5. Test discipline is a v1 release gate (US8 = P2 but required)

- **Decision**: Test discipline (FR-016, FR-017) is in the spec as a
  P2 story but is still a v1 release gate.
- **Rationale**: The constitution's Principle III says every public
  function must have positive + negative + parity tests. A spec
  omission would let future PRs weaken this without flagging. P2
  reflects "internal discipline" but the FR is still load-bearing.
- **Alternatives considered**:
  - *Move test discipline to constitution-only*: rejected — would
    hide the requirement from spec-level audits.

### D6. Distribution channels enumerated explicitly

- **Decision**: Four channels: JSR, GitHub Releases (4 host triples),
  Claude Code marketplace, Pi package. No PyPI, no npm, no Homebrew.
- **Rationale**: FR-011 mirrors constitution's Technology Constraints
  & Distribution section. Adding a new channel requires a
  constitution amendment.
- **Alternatives considered**:
  - *Add npm package*: rejected — Deno-first project; npm would
    require duplicating the package surface.
  - *Add Homebrew tap*: rejected — bash launcher already covers
    macOS; no additional surface value.

### D7. Hand-edit-EDN ban preserved verbatim

- **Decision**: The "never hand-edit EDN" rule is preserved across
  README, plugin docs, Pi skill prompts, and this spec (Assumptions).
- **Rationale**: Constitution Principle V makes this a non-negotiable
  UX contract; relaxing it would silently bypass `repairInterface`
  and refusal checks.

### D8. `sanitizeOps: false` workaround preserved

- **Decision**: The `sanitizeOps: false` block in
  `src/pi-package.test.ts:109-131` is preserved verbatim.
- **Rationale**: The `001-upgrade-deno` upgrade (Deno 2.4.5 → 2.9.2)
  verified the workaround is still load-bearing on 2.9.2
  (`research.md` item 10 in that branch). Removing it would re-introduce
  a flaky bridge test.

## FR-by-FR Coverage Audit

| FR | Source location | Status | Notes |
|---|---|---|---|
| FR-001 `load(source)` returns `Effect<Document, LoadError, never>` | `src/index.ts:78-85`, `src/builder/parse-candidate.ts`, `src/validate.ts` | ✅ Implemented | `LoadError = EdnError \| SchemaError \| ValidateError` per `src/model.ts`. |
| FR-002 `validate(value)` returns `Effect<Document, SchemaError \| ValidateError, never>` | `src/index.ts:69-76` | ✅ Implemented | Composes `decodeWire` → `validateCandidate`. |
| FR-003 `solve(document)` returns `Effect<ComponentSolveResult, SolveError>`; `SolveError = never` | `src/index.ts:87-91`, `src/model.ts` | ✅ Implemented | `SolveError = never` alias reserved per constitution. |
| FR-004 Six solver roots; `supportedRelationKinds(tag)` | `src/model.ts:SOLVER_TAGS`, `src/model.ts:supportedRelationKinds` | ✅ Implemented | All six tags exported; function declared. |
| FR-005 Namespaced tag families spec-frozen | `src/model.ts` (constants) + `CHANGELOG.md` | ✅ Implemented | Constitution Principle II binds this. |
| FR-006 `SOLVER_TAGS` canonical exhaustive registry | `src/model.ts:SOLVER_TAGS` | ✅ Implemented | Tuple of 6 strings; additive only. |
| FR-007 14 MCP tool names | `src/mcp/tools.ts` | ✅ Implemented | All 14 names declared in `TOOL_NAMES`. |
| FR-008 `path`/`source` ref contract | `src/mcp/tools.ts`, `src/mcp/io.ts` | ✅ Implemented | `mcp/invalid-ref` refused for both/neither. |
| FR-009 Atomic temp + rename | `src/mcp/io.ts:saveDocumentRefEffect` | ✅ Implemented | Writes `.${Date.now()}.argdown-2.tmp` then renames. |
| FR-010 Response shape contract | `src/mcp/tools.ts` | ✅ Implemented | `{ ok, warnings, diff, path\|source }` / `{ ok: false, refused, ... }` / `{ ok: false, errors }`. |
| FR-011 Distribution channels | `deno.json` (JSR), `.github/workflows/release.yml` (binaries), `.claude-plugin/marketplace.json` (Claude Code), `package.json` (Pi) | ✅ Implemented | All four channels present. |
| FR-012 Launcher resolution order | `scripts/argdown-2-mcp` | ✅ Implemented | `ARGDOWN2_MCP_BIN` → `XDG_CACHE_HOME` → download + sha256 → `exec`. |
| FR-013 Direct compile, no bundler | `scripts/compile-mcp.sh`, `deno.json#compile:mcp` task | ✅ Implemented | Compiles `src/mcp/cli.ts` directly; no esbuild/tsdown. |
| FR-014 All `deno task` invocations exit `0` | `deno.json#tasks` | ✅ Implemented | 13 tasks defined; CI runs the full set. |
| FR-015 npm allowlist | `scripts/check-npm-allowlist.sh`, `src/npm-allowlist.test.ts` | ✅ Implemented | Three packages allowed; CI gate. |
| FR-016 Eight bench fixtures | `src/bench.fixtures/` | ✅ Implemented | `small-minimal`, `small-relations`, `small-argument`, `medium-censorship`, `heavy-attacks`, `deep-arguments`, `large-stress`, `mixed-semantics`. |
| FR-017 Positive + negative + parity tests | `src/*.test.ts` | ✅ Implemented | Per-function coverage enforced by review (no coverage gate, but per-PR review checks). |

**Coverage result**: 17/17 FRs implemented. No v1 release blockers
recorded in this research pass.

> ⚠️ **Caveat**: Coverage confirmation is a static source-tree audit,
> not a runtime test run. The actual gate that proves each FR is
> `quickstart.md` Step N — a one-line deno task invocation per SC.

## Reference: constitution cross-reference

The full FR → constitution principle mapping lives in `spec.md`'s
**Constitution Cross-Reference** appendix and is the source of truth
for compliance review. This research file does not duplicate that table.

## Out-of-scope confirmations

- **No GUI / web service** — confirmed by constitution header
  ("The shipped artifact is the `argdown-2-mcp` stdio binary").
- **No custom parser beyond EDN** — confirmed by constitution
  ("The custom parser, AST, and visitor split from 0.1.0 is no longer
  present in 0.2.0").
- **No `--semantics` CLI flag** — confirmed by constitution Principle V
  ("There is no `--semantics` CLI flag. Solver choice is read from
  each component's tag").
- **Windows launcher** — out of scope; bash-only launcher design.
- **ASPIC+ / CLS 2013 full evidential** — out of scope per constitution
  header.

## Open follow-ups (not blockers)

These are **not** v1 release blockers but are recorded for future
consideration:

1. **Coverage metric gate**: FR-017 is verified by review, not by an
   automated coverage tool. A future PR could add a per-function
   coverage gate (e.g. `c8`/`vitest`/`deno coverage`) without
   weakening any existing test.
2. **Launcher test expansion**: `scripts/argdown-2-mcp.test.sh` covers
   all four resolution paths. A future PR could add a test that
   verifies the launcher's stdout does not leak the cached binary path
   (currently implicit).
3. **`mixed-semantics` fixture**: doubles as the CLI snapshot driver;
   if a non-CLI consumer adds a new output format, the fixture must
   gain a sibling.

## Summary

- 8 design decisions logged (D1–D8).
- 17/17 FRs covered by the current `0.2.0-alpha4` codebase.
- 0 NEEDS CLARIFICATION markers.
- 0 v1 release blockers.
- 3 open follow-ups (none blocking).

Ready for Phase 1 design artifacts: `data-model.md`, `contracts/`,
`quickstart.md`.
