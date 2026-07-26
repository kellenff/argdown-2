# Delete Unused `ReadResult` — Design Spec

**Status:** Draft. Under brainstorming review.
**Date:** 2026-07-26
**Follows:** [`2026-07-25-edn-effect-refactor-design.md`](2026-07-25-edn-effect-refactor-design.md)

## Context

The EDN reader Effect refactor
([`2026-07-25-edn-effect-refactor-design.md`](2026-07-25-edn-effect-refactor-design.md))
changed `readEdn` to return `Effect.Effect<unknown, EdnError, never>`.
The two consumers (`src/index.ts`, `src/builder/soft-parse.ts`) unwrap
via `Effect.match` + `Effect.runSync` into `LoadResult` /
`SoftParseResult`. The old `ReadResult` type was explicitly deferred:

> Removing `ReadResult` from `model.ts` — kept as a boundary type
> until all consumers migrate.

All consumers have migrated. A repo-wide search shows `ReadResult` is
defined only in `src/model.ts` and mentioned only in docs/CHANGELOG —
it is **not** re-exported from `src/index.ts`, so deleting it is a
private cleanup with no public API break.

## Decision

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Delete type + update docs | Completes the deferred cleanup; keeps pattern note accurate. |
| Public API | Unchanged | `ReadResult` was never re-exported from `src/index.ts`. |
| Boundary types kept | `LoadResult`, `ValidationResult`, `SoftParseResult` | Still used by public/`softParse` surfaces. |

## Changes

### `src/model.ts`

Delete:

```ts
export type ReadResult =
  | { ok: true; value: unknown }
  | { ok: false; errors: readonly Diagnostic[] };
```

Leave `ValidationResult` and `LoadResult` untouched.

### `docs/snowball/specs/2026-07-25-effect-pattern.md`

Replace the stale "Don't" bullet:

```markdown
- Don't expose `ReadResult` from new modules — let the call site
  unwrap. `ReadResult` stays as a boundary type until all consumers
  migrate.
```

with:

```markdown
- Don't invent a new ok/errors boundary type for Effect modules —
  unwrap with `Effect.match` + `Effect.runSync` into the call site's
  existing result type (`LoadResult`, `SoftParseResult`, etc.), or
  keep the Effect until the outermost sync boundary. The old
  `ReadResult` type was removed after the EDN reader migration.
```

### `CHANGELOG.md`

Under `## [Unreleased] > ### Removed`, add:

```markdown
- `ReadResult` type removed from `src/model.ts`. It was an internal
  boundary type for the pre-Effect `readEdn` signature and is unused
  after the EDN reader Effect refactor. Not a public API break —
  `ReadResult` was never re-exported from the package entrypoint.
```

## Out of scope

- Renaming or consolidating `LoadResult` / `ValidationResult` /
  `SoftParseResult`.
- Migrating those boundary types to Effect (follow-on refactors).
- Editing historical design/plan docs that mention `ReadResult` as
  prior art.

## Verification

```bash
rg "ReadResult" src/
deno check --frozen src/index.ts src/mcp/cli.ts
deno test -A --frozen --parallel src/
deno lint src/model.ts
```

Expected: no `ReadResult` matches under `src/`; check/test/lint PASS.
