# Contracts: Upgrade Pinned Deno to Latest Stable

**Date**: 2026-08-07
**Spec**: [spec.md](./spec.md)

This feature is a runtime-version bump. It does not add, remove, or
modify any external contract exposed by `argdown-2`. The contracts listed
here are the existing project contracts that the upgrade MUST keep green
end-to-end — the list is a guardrail, not a redesign.

## Library API surface

**Contract.** The published JSR package `@casualtheorics/argdown-2`
exports the public symbols re-exported from `src/index.ts`. Every symbol's
type signature, the namespaced EDN theory tags, the supported relation
kinds, and the solver-tag tuple are spec-frozen per Constitution
Principle II (Wire Stability).

**Invariants under the upgrade.**

- No new exported symbol is added in the same PR (that's a separate
  proposal).
- No exported symbol is renamed, removed, or has its type signature
  changed.
- The namespaced EDN tags (`casualtheorics.argdown2/document`,
  `casualtheorics.argdown2.solver/*`, etc.) and the `SOLVER_TAGS` tuple
  are byte-identical to the pre-bump value.
- `deno task publish:dry-run` exits clean (slow-types check still passes).

**Validation.** `deno task check` covers the type signatures;
`deno task publish:dry-run` covers the JSR slow-types contract;
`deno task test` covers the runtime behavior contract.

## MCP tool surface

**Contract.** The 14-tool MCP registry, the JSON-RPC envelope, the
`{ ok, warnings, diff, path|source }` success shape, the
`{ ok: false, refused: { code, message }, warnings, diff }` refusal shape,
the `{ ok: false, errors }` I/O/load shape, and the atomic-write
semantics (`saveDocumentRefEffect` writes to `.${Date.now()}.argdown-2.tmp`
and `rename`s) are spec-frozen per Constitution Principles IV and V.

**Invariants under the upgrade.**

- The compiled `argdown-2-mcp` binary's tool list (handshake
  `tools/list` response) is identical to the pre-bump value.
- Every tool that accepts a `path` or `source` document ref still
  refuses with `mcp/invalid-ref` when both or neither are provided.
- Path-mode mutations still write to a temp file and rename; no partial
  writes on disk.
- Builder refusal codes (`builder/invalid-id`, `builder/duplicate-id`,
  `builder/missing-id`, `builder/unsupported-relation-kind`,
  `builder/unsupported-solver`, `builder/invalid-projection-bounds`)
  are unchanged.
- I/O error codes (`Read`, `Write`, `Parse`) on the MCP I/O layer are
  unchanged.

**Validation.** `deno task probe:mcp <bin>` runs the stdio handshake and
asserts the 14-tool list; `src/mcp/tools.test.ts` and
`src/mcp/server.test.ts` cover the JSON shapes; the host-target
`argdown-2-mcp` binary compiled from `src/mcp/cli.ts` is the canonical
artifact.

## Launcher contract

**Contract.** `bash scripts/argdown-2-mcp` resolves in this order:
`ARGDOWN2_MCP_BIN` override → versioned `XDG_CACHE_HOME` cache → download
with `sha256sums.txt` verification → `exec`. The launcher test
(`scripts/argdown-2-mcp.test.sh`) covers all four paths including
checksum mismatch and unsupported OS.

**Invariants under the upgrade.** The launcher script is byte-identical
to the pre-bump value (no edits). The Claude Code plugin copy at
`plugins/argdown-2/scripts/argdown-2-mcp` MUST also stay byte-equivalent
(enforced by `src/claude-plugin.test.ts`). The `scripts/argdown-2-mcp.version`
file MUST match `deno.json#version` at release time (enforced by
`release.yml:Verify launcher pin matches deno.json version`).

**Validation.** `scripts/argdown-2-mcp.test.sh`; `src/claude-plugin.test.ts`;
`src/pi-package.test.ts`.

## npm import allowlist

**Contract.** `deno.json#imports` MAY declare only `npm:zod@`,
`npm:effect@`, `npm:@modelcontextprotocol/sdk@` (with or without the
leading `/`). Any other `npm:` specifier fails CI
(`scripts/check-npm-allowlist.sh`, enforced by
`src/npm-allowlist.test.ts`).

**Invariants under the upgrade.** No new `npm:` import is added. The
three existing `npm:` imports are unchanged.

**Validation.** `deno task check:npm-allowlist`.

## CI / Release workflow contract

**Contract.** `.github/workflows/ci.yml` and
`.github/workflows/release.yml` install Deno from
`scripts/deno-version` (no hard-coded secondary version literal anywhere
in the workflow YAML). The Release workflow's "Verify launcher pin
matches deno.json version" step is a contract between `deno.json` and
`scripts/argdown-2-mcp.version`.

**Invariants under the upgrade.** Both workflows' `deno-version-file`
inputs remain `scripts/deno-version`; no workflow file receives a
secondary literal pin. The package-version pin check continues to pass
(because the package version is unchanged in this PR).

**Validation.** Reading both workflow files; the Release workflow's
"Verify launcher pin matches deno.json version" step.