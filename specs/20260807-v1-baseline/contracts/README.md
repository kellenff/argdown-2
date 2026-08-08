# Contracts: argdown-2 v1 Baseline

**Date**: 2026-08-07
**Branch**: `20260807-v1-baseline`
**Spec**: [spec.md](../spec.md)

> The contracts in this directory are the **user-visible surfaces**
> of `argdown-2` v1.0.0. Each contract is a stable, versioned
> boundary that downstream consumers (library users, CLI users, MCP
> clients, skill authors, distro integrators) depend on. Contracts
> here correspond to functional requirements in the spec.

## Index

| File | Surface | FR anchors |
|---|---|---|
| [library-api.md](./library-api.md) | `load`, `validate`, `solve`, `parseCandidate`, `apply`, `emptyDocument`, public type re-exports | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006 |
| [mcp-tools.md](./mcp-tools.md) | 14-tool builder MCP registry (tool names, params, response shapes) | FR-007, FR-008, FR-010 |
| [cli-surface.md](./cli-surface.md) | `argdown-2` CLI argument parser, subcommands, exit codes, output formats | (no direct FR; cross-references FR-010, FR-014) |
| [launcher.md](./launcher.md) | `bash scripts/argdown-2-mcp` resolution order, refusal semantics, sha256 verify | FR-012 |
| [distribution.md](./distribution.md) | JSR, GitHub Releases, Claude Code marketplace, Pi package channels | FR-011, FR-013 |

## Stability guarantees

Every contract in this directory is **additive**:

- New tools, new fields, new subcommands: **non-breaking**.
- Removed tools, renamed tools, changed response shapes, removed
  fields: **breaking**, requires a major version bump + `CHANGELOG.md`
  migration entry.

These rules are constitution Principle II (Wire Stability) and
Principle V (Builder-as-Authoring, Strict UX Contracts).

## Not covered here

- **Implementation details** (class shapes, internal invariants,
  private state) — covered by source code, not contracts.
- **Solver math** (Dung grounded semantics, bipolar deductive
  reduction, evidential necessary reduction) — covered by
  `src/grounded.ts`, `src/reduce-bipolar.ts`, `src/reduce-evidential.ts`,
  `src/multi-extension.ts`. The contracts here only name the
  semantic boundary (input graph → label/extension output).
- **Snapshot format** for CLI output — covered by
  `src/cli/__snapshots__/`. Stable enough for testing but not
  a versioned contract.

## Audit trail

Each contract below cites the constitutional principle it gates on
and the spec FR(s) it satisfies. The constitution cross-reference
in [spec.md](../spec.md) is the source of truth for the principle
mapping.
