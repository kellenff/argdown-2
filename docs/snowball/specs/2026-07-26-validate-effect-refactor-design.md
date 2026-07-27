# Validate → Effect Migration — Design Spec

**Status:** Draft. Under brainstorming review.
**Date:** 2026-07-26
**Follows:** [`2026-07-25-edn-effect-refactor-design.md`](2026-07-25-edn-effect-refactor-design.md),
[`2026-07-25-effect-pattern.md`](2026-07-25-effect-pattern.md)

## Context

The EDN reader already returns
`Effect.Effect<unknown, EdnError, never>`. Semantic validation in
`src/validate.ts` (~422 LOC) is still a sync accumulator: helpers push
into a mutable `Diagnostic[]` and `validateCandidate` returns
`ValidationResult`. The only production call site is `src/index.ts`
(`validate` / `load`).

`load` today is a hybrid:

```
readEdn (Effect) → unwrap → decodeWire (Result) → validateCandidate (Result)
```

This spec migrates validation to Effect and composes a full
`Effect.gen` load pipeline, while keeping public `ValidationResult` /
`LoadResult` signatures as sync boundaries.

Unlike `readEdn` (wrap a throwing parser → single tagged error),
validation has **13 semantic codes** and returns **all** diagnostics.
Effect 4's `Effect.validate` accumulates failures as
`NonEmptyArray<E>`, which is the right primitive for that behavior.

## Decision

| Decision | Choice | Rationale |
|---|---|---|
| Approach | **B — full Effect rewrite of `validate.ts`** | Makes helpers Effect-native; uses `Effect.validate` for multi-error accumulation. |
| `ValidateError` | `{ _tag: "Semantic"; diagnostics: readonly Diagnostic[] }` | One tagged failure carrying the full array; preserves accumulation + `catchTag`. |
| Error location | `model.ts` (with `EdnError`) | Shared model owns tagged error unions. |
| Schema | Thin-wrap `decodeWire` in `index.ts` only | `schema.ts` stays Result-style; foreshadowed by `SchemaError`. |
| Load composition | `Effect.gen`: `readEdn` → decode wrap → `validateCandidate` | Canonical pipeline; public `load()` unwraps to `LoadResult`. |
| Composed error | `LoadError = EdnError \| SchemaError \| ValidateError` | Clean stage discriminators for future MCP/CLI Effect consumers. |
| Public API | `validate` / `load` still return `ValidationResult` / `LoadResult` | No break for CLI/MCP/tests. |
| Export `loadEffect` | Yes | Lets later stages adopt Effect without another signature flip. |

## Types (`src/model.ts`)

```ts
export type ValidateError = {
  readonly _tag: "Semantic";
  readonly diagnostics: readonly Diagnostic[];
};

export type SchemaError = {
  readonly _tag: "Schema";
  readonly diagnostics: readonly Diagnostic[];
};

export type LoadError = EdnError | SchemaError | ValidateError;
```

`ValidationResult` / `LoadResult` remain as sync boundary types.

## `validate.ts` rewrite (Approach B)

**Exported signature:**

```ts
export function validateCandidate(
  candidate: CandidateDocument,
): Effect.Effect<Document, ValidateError, never>
```

**Internal pattern:**

1. Drop mutable `errors: Diagnostic[]` parameters.
2. Atomic fail → `Effect.fail(diagnostic)` (`Diagnostic` as temporary `E`).
3. Independent element batches → `Effect.validate(items, check)`
   (accumulates `NonEmptyArray<Diagnostic>`).
4. Dependent phases stay sequential in `Effect.gen`:

```
collectEndpoints
  → validateInferenceReferences
  → validateRelationReferences
  → validateInterface
  → validateImports
  → recurse child solvers (Effect.validate over children)
  → brand/build SolverComponent
```

5. Outer collapse via `Effect.mapError`:

```ts
({ _tag: "Semantic" as const, diagnostics })
```

**`validateComponent`** returns
`Effect.Effect<SolverComponent, NonEmptyArray<Diagnostic>, never>`
(or equivalent) so recursion composes.

**Behavior preserved:** same diagnostic `code` / `message` / `path`
values. Existing tests that assert via `load(...).errors[].code` remain
the regression contract.

## `index.ts` pipeline

```ts
function decodeWireEffect(
  value: unknown,
): Effect.Effect<CandidateDocument, SchemaError, never> {
  const decoded = decodeWire(value);
  if (!decoded.ok) {
    return Effect.fail({ _tag: "Schema", diagnostics: decoded.errors });
  }
  return Effect.succeed(decoded.document);
}

export function loadEffect(
  source: string,
): Effect.Effect<Document, LoadError, never> {
  return Effect.gen(function* () {
    const raw = yield* readEdn(source);
    const candidate = yield* decodeWireEffect(raw);
    return yield* validateCandidate(candidate);
  });
}

export function validate(value: unknown): ValidationResult {
  return Effect.runSync(
    Effect.match(
      Effect.gen(function* () {
        const candidate = yield* decodeWireEffect(value);
        return yield* validateCandidate(candidate);
      }),
      {
        onFailure: (err) => ({ ok: false, errors: err.diagnostics }),
        onSuccess: (document) => ({ ok: true, document }),
      },
    ),
  );
}

export function load(source: string): LoadResult {
  return Effect.runSync(
    Effect.match(loadEffect(source), {
      onFailure: (err) => ({
        ok: false,
        errors: err._tag === "RootCount" || err._tag === "ReadError"
          ? [err.diagnostic]
          : err.diagnostics,
      }),
      onSuccess: (document) => ({ ok: true, document }),
    }),
  );
}
```

Re-export `ValidateError`, `SchemaError`, `LoadError` from the package
entrypoint type exports.

## Testing

| Layer | What | How |
|---|---|---|
| Existing `validate.test.ts` / `index.test.ts` | Codes via `load()` | Unchanged — primary regression contract |
| Direct `validateCandidate` (small add) | Effect success / `Semantic` failure | `Effect.runSync(Effect.match(...))` — one happy + one multi-error |
| `loadEffect` (small add) | Composed `LoadError` tags | One edn, one schema, one semantic fail |

No speculative `catchTag` suite.

## Files touched

| File | Change |
|---|---|
| `src/model.ts` | Add `ValidateError`, `SchemaError`, `LoadError` |
| `src/validate.ts` | Full Effect rewrite |
| `src/validate.test.ts` | Optional Effect-direct cases; keep existing tests |
| `src/index.ts` | `loadEffect`, `decodeWireEffect`, Effect `load`/`validate`; type re-exports |
| `src/index.test.ts` | Should pass unchanged |
| `docs/snowball/specs/2026-07-25-effect-pattern.md` | Document `Effect.validate` for multi-error accumulation |
| `CHANGELOG.md` | Changed entry |

## Out of scope

- Migrating `schema.ts` / `decodeWire` to a native Effect API
- Migrating CLI / MCP off `LoadResult`
- Soft-parse still skips semantic validation
- Per-code tagged variants (`DuplicateId`, …)

## Verification

```bash
deno check --frozen src/index.ts src/mcp/cli.ts
deno test -A --frozen --parallel src/
deno lint src/validate.ts src/index.ts src/model.ts
deno fmt --check src/validate.ts src/index.ts src/model.ts
```

Expected: existing validate/index tests pass; typecheck/lint/fmt clean.
