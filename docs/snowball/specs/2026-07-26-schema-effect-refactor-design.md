# Schema → Effect + Unified Parse Pipelines — Design Spec

**Status:** Approved for planning.
**Date:** 2026-07-26
**Follows:** [`2026-07-26-validate-effect-refactor-design.md`](2026-07-26-validate-effect-refactor-design.md),
[`2026-07-25-effect-pattern.md`](2026-07-25-effect-pattern.md)

## Context

`validateCandidate` and `readEdn` already return Effects. Schema decode
still returns a private Result:

```
readEdn (Effect) → decodeWire (Result) → validateCandidate (Effect)
```

`index.ts` hides that with a thin `decodeWireEffect` wrapper — the
abstraction the previous migration explicitly deferred. Soft-parse is a
second copy of the first two stages (`readEdn` → `decodeWire`) behind
`SoftParseResult`. Public `load` / `validate` still unwrap to
`LoadResult` / `ValidationResult`.

This spec finishes the lineage: **Approach B for `schema.ts`**, delete
the Result↔Effect shim, and unify parse surfaces as **Effect
compositions of shared steps** (no parallel Result APIs).

## Decision

| Decision | Choice | Rationale |
|---|---|---|
| Approach | **B — full Effect rewrite of `schema.ts`** | Avoid Result↔Effect indirection; same rationale as validate. |
| `decodeWire` | `Effect.Effect<CandidateDocument, SchemaError, never>` | `SchemaError` already exists; delete private `DecodeResult`. |
| Soft-parse | Rename to **`parseCandidate`**; returns Effect | Stops at candidate; type-level distinction vs `Document`. |
| Soft-parse file | `src/builder/soft-parse.ts` → `src/builder/parse-candidate.ts` | Match the new name. |
| Pipelines | Three compositions (below) | Same steps, different length; no duplicated decode logic. |
| Public Result types | **Delete** `LoadResult`, `ValidationResult`, `SoftParseResult` | Effect is the API; unwrap only at outermost sync edges. |
| `load` / `validate` | Return Effects (drop `loadEffect` name) | Consistent with `parseCandidate` / `decodeWire`. |
| Soft-parse validate-free | Preserved | `parseCandidate` never calls `validateCandidate`. |
| Behavior | Same diagnostic codes / messages / paths | Existing assertions remain the regression contract. |

## Pipelines

```
parseCandidate(source)  = readEdn → decodeWire
  Effect<CandidateDocument, EdnError | SchemaError, never>

validate(value)         = decodeWire → validateCandidate
  Effect<Document, SchemaError | ValidateError, never>

load(source)            = parseCandidate → validateCandidate
  Effect<Document, LoadError, never>
```

Optional alias (not required as a public type, but useful in docs):

```ts
type ParseCandidateError = EdnError | SchemaError;
```

`LoadError` remains `EdnError | SchemaError | ValidateError`.

## `schema.ts` rewrite (Approach B)

**Exported signature:**

```ts
export function decodeWire(
  value: unknown,
): Effect.Effect<CandidateDocument, SchemaError, never>
```

**Internal pattern** (mirror validate where it fits):

1. Delete private `DecodeResult` and Result returns.
2. Early structural gates (invalid EDN value, duplicate map/set keys,
   missing document tag) → `Effect.fail({ _tag: "Schema", diagnostics })`.
3. Field/element decode helpers that today push into `Diagnostic[]` and
   continue → prefer `Effect.sync` returning diagnostics on the success
   channel where accumulate-then-fail is required, or `Effect.fail` for
   hard stops — **preserve current control flow** (do not invent new
   fail-fast vs accumulate behavior).
4. Collapse non-empty diagnostic arrays to `SchemaError` at the
   `decodeWire` boundary (and at any helper that today returns
   `{ ok: false, errors }`).

**Behavior preserved:** same `schema/*` and related codes
(`schema/invalid-edn-value`, `duplicate-map-key`, `duplicate-set-value`,
`missing-document-tag`, `expected-map`, `missing-required`,
`invalid-field`, `edn/unsupported-tag`, …).

## Public API (`src/index.ts` + builder)

```ts
export function parseCandidate(
  source: string,
): Effect.Effect<CandidateDocument, EdnError | SchemaError, never> {
  return Effect.gen(function* () {
    const raw = yield* readEdn(source);
    return yield* decodeWire(raw);
  });
}

export function validate(
  value: unknown,
): Effect.Effect<Document, SchemaError | ValidateError, never> {
  return Effect.gen(function* () {
    const candidate = yield* decodeWire(value);
    return yield* validateCandidate(candidate);
  });
}

export function load(
  source: string,
): Effect.Effect<Document, LoadError, never> {
  return Effect.gen(function* () {
    const candidate = yield* parseCandidate(source);
    return yield* validateCandidate(candidate);
  });
}
```

- Remove `decodeWireEffect` and `loadEffect`.
- Re-export `parseCandidate` from the package entry (or from
  `builder/parse-candidate.ts` and re-export in `index.ts` — prefer
  defining composition next to its peers in `index.ts` **or** in
  `parse-candidate.ts` with `load` importing it; pick one home in the
  plan and stick to it).
- Delete `LoadResult` / `ValidationResult` from `model.ts`.
- Delete `SoftParseResult` with the soft-parse rename.

**Recommended home:** `parseCandidate` lives in
`src/builder/parse-candidate.ts`; `load` / `validate` in `index.ts`
import it (builder must not import validate). Alternative: all three in
`index.ts` and builder re-exports `parseCandidate` — acceptable if it
avoids a circular import; the plan must verify the import graph.

## Sync boundaries (call sites)

Outermost edges unwrap with `Effect.runSync(Effect.match(...))` into
**local** shapes that already exist, not shared Result types:

| Call site | Today | After |
|---|---|---|
| `src/cli/load.ts` | `load` → `LoadResult` → `LoadReport` | `Effect.match(load(...))` → `LoadReport` |
| `src/mcp/io.ts` | `softParse` → `SoftParseResult` → `LoadDocResult` | `Effect.match(parseCandidate(...))` → `LoadDocResult` |
| `src/mcp/tools.ts` | `load(...).ok` | `Effect.runSync(Effect.match(load(...), …))` |
| Tests | `.ok` / `.errors` / `.document` | `Effect.runSync(Effect.match(...))` or small local test helpers |

Diagnostics extraction for `LoadError`:

```ts
err._tag === "RootCount" || err._tag === "ReadError"
  ? [err.diagnostic]
  : err.diagnostics
```

(same mapping `load` used when it returned `LoadResult`).

## Testing

| Layer | What | How |
|---|---|---|
| Existing schema / validate / index / soft-parse / MCP / CLI tests | Behavior + codes | Update call sites to Effect.match; assertions unchanged in spirit |
| Direct `decodeWire` | Effect success / `Schema` failure | `Effect.runSync(Effect.match(...))` — happy + multi-error |
| `parseCandidate` | Stops before semantic validate | Candidate success; EDN/schema failures; no ValidateError |
| `load` | Full `LoadError` tags | One edn, one schema, one semantic (can reuse/adapt prior `loadEffect` cases) |

## Files touched

| File | Change |
|---|---|
| `src/schema.ts` | Approach B Effect rewrite; delete `DecodeResult` |
| `src/schema.test.ts` | Effect-direct assertions |
| `src/model.ts` | Delete `LoadResult`, `ValidationResult` |
| `src/index.ts` | Effect `load` / `validate`; remove shim; re-exports |
| `src/builder/soft-parse.ts` | Replace with `parse-candidate.ts` (`parseCandidate`) |
| `src/builder/soft-parse.test.ts` | Rename/update for `parseCandidate` |
| `src/mcp/io.ts`, `src/mcp/tools.ts` | Consume Effects |
| `src/cli/load.ts` | Unwrap `load` Effect into `LoadReport` |
| Tests using `load` / `validate` / `softParse` | Effect.match at edges |
| `docs/snowball/specs/2026-07-25-effect-pattern.md` | Drop Result-boundary guidance; document compositions |
| `CHANGELOG.md` | Changed entry |

## Out of scope

- Changing schema/semantic diagnostic codes or messages
- Builder edit / apply semantics
- Solve path
- Per-code tagged schema error variants
- Introducing Effect `Option` for parse (parse remains fallible on the error channel)

## Verification

```bash
deno check --frozen src/index.ts src/mcp/cli.ts src/cli/main.ts
deno test -A --frozen --parallel src/
deno lint src/schema.ts src/index.ts src/model.ts src/builder/parse-candidate.ts src/cli/load.ts src/mcp/io.ts
deno fmt --check src/schema.ts src/index.ts src/model.ts src/builder/parse-candidate.ts
```

Expected: suite green; typecheck/lint/fmt clean; no remaining
`SoftParseResult` / `LoadResult` / `ValidationResult` / `DecodeResult`
/ `loadEffect` / `decodeWireEffect` / `softParse` references in `src/`.
