# EDN Reader — Effect Refactor — Design Spec

**Status:** Draft. Under brainstorming review.
**Date:** 2026-07-25

## Context

`src/edn.ts` is a 37-line module with a single exported function
`readEdn(source: string): ReadResult`. It wraps the synchronous
`edn-parser-js` `ednParseMulti` call in a `try`/`catch`, normalizes any
thrown error to a `Diagnostic`, and returns a discriminated-union
`ReadResult` (`{ ok: true, value } | { ok: false, errors }`). Two failure
modes are surfaced: `edn/root-count` (zero or multiple top-level EDN forms)
and `edn/read-error` (parser threw).

This works, but it's hand-rolled error handling: `try`/`catch` +
manual `ReadResult` construction. It also predates a project-wide move
toward [`effect`](https://effect.website). The `vendor/effect/` checkout
landed in commits `6da20a71f` and `e732ab113` and is ready to be consumed
as a published dependency, but no source files in `src/` import
`effect` yet.

Three things drive this spec:

1. **Effect is becoming the project standard.** Future modules
   (`src/validate.ts`, builder pipelines, loaders) will adopt typed
   errors, `Effect.gen`, and tagged unions. The EDN reader is the
   right first step: small, self-contained, two existing call sites
   easy to migrate.
2. **The pattern established here is the template.** When other
   modules follow, they should copy the signature shape, the tagged
   error union, the `Effect.try` for sync-throwing calls, and the
   sync-boundary handling.
3. **`vendor/effect/` is a vendored reference, not a runtime dep.**
   The published `effect` package is wired via `npm:` in `deno.json`
   (matching how `edn-parser-js` and `zod` are wired). The vendor stays
   for offline reference / AI-doc lookup.

What this refactor changes: the signature of `readEdn`, the error
shape (`EdnError` tagged union), the call sites in `src/index.ts` and
`src/builder/soft-parse.ts`, and the test surface. What it does not
change: the `edn-parser-js` import, the diagnostic codes, the
`ReadResult` type (kept as a boundary type for the two current
consumers), or the file layout.

## Decision

| Decision | Choice | Rationale |
|---|---|---|
| `readEdn` signature | `Effect.Effect<unknown, EdnError, never>` | Canonical Effect. Sets the template for `validate.ts`, builders. |
| Error shape | Tagged union `{ _tag: "RootCount" \| "ReadError", diagnostic: Diagnostic }` | Enables `Effect.catchTag`. Keeps `Diagnostic` shape unchanged. |
| Error type location | `EdnError` exported from `src/model.ts` | Co-located with `Diagnostic`, `ReadResult`. Pattern: each module owns its own union, reuses `Diagnostic` inside. |
| `Effect` wiring | `"effect": "npm:effect@^4.0.0-beta.101"` in `deno.json` | Decouples from `vendor/effect/`. Vendor stays as reference. |
| Sync boundary | Caller owns `Effect.runSync(Effect.match(...))` | No helper module — two call sites is the right count to inline the unwrap. `Effect.match` folds an `Effect<A, E>` into `Effect<UnionType, never>`; `Effect.runSync` then yields the union value safely. |
| Scope | `src/edn.ts`, `src/edn.test.ts`, `src/index.ts`, `src/builder/soft-parse.ts`, `src/model.ts`, `deno.json` + a pattern note | Establishes the convention end-to-end without leaving the codebase mid-migration. |
| `ReadResult` | Kept in `src/model.ts` for now | Boundary type until consumers migrate to `Effect.gen` pipelines. |
| Pattern note | `docs/snowball/specs/2026-07-25-effect-pattern.md` | Convention reference for future modules. |

## Type & module surface

### `src/model.ts` — new exported type

```ts
export type EdnError =
  | { readonly _tag: "RootCount"; readonly diagnostic: Diagnostic }
  | { readonly _tag: "ReadError"; readonly diagnostic: Diagnostic };
```

Added next to `Diagnostic` (line 59) and `ReadResult` (line 217).
`Diagnostic` is unchanged.

### `src/edn.ts` — refactored

```ts
import { Effect } from "effect";
import { ednParseMulti } from "edn-parser-js";
import type { Diagnostic, EdnError } from "./model.js";

const ROOT_COUNT: Diagnostic = {
  code: "edn/root-count",
  message: "Expected exactly one top-level EDN value",
};

function toDiagnostic(error: unknown): Diagnostic {
  return {
    code: "edn/read-error",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function readEdn(
  source: string,
): Effect.Effect<unknown, EdnError, never> {
  return Effect.gen(function* () {
    const forms = yield* Effect.try({
      try: () => ednParseMulti(source),
      catch: (error) =>
        ({ _tag: "ReadError", diagnostic: toDiagnostic(error) }) as const,
    });
    if (forms.length !== 1 || forms[0] === undefined) {
      return yield* Effect.fail(
        { _tag: "RootCount", diagnostic: ROOT_COUNT } as const,
      );
    }
    return forms[0];
  });
}
```

What is removed: the `rootCountFailure()` and `readFailure()` helpers
that built a full `ReadResult` (no longer needed — the tagged union
replaces them). `toDiagnostic()` survives because the inner `Diagnostic`
is still constructed the same way.

### `deno.json` — new import

```diff
  "imports": {
    "edn-parser-js": "./vendor/edn-parser-js/lib/index.js",
+   "effect": "npm:effect@^4.0.0-beta.101",
    "zod": "npm:zod@4.4.3",
```

Lock file (`deno.lock`) updates automatically on first run.

## Error handling model

The tagged-error pattern at the heart of this refactor:

- `_tag` is what Effect's `catchTag` discriminates on. Without it,
  callers inspect `diagnostic.code === "edn/root-count"` themselves —
  which works but doesn't compose with Effect combinators.
- Wrapping `Diagnostic` in a tagged union preserves the existing
  diagnostic shape (`code`, `message`, optional `path`). Validation,
  builder, and the MCP layer already speak `Diagnostic` — we're not
  replacing `Diagnostic`, we're wrapping it for Effect routing.
- `readonly` everywhere keeps the types pure (matches the rest of
  `model.ts`).

Combinators this enables:

| Operation | Use case |
|---|---|
| `Effect.catchTag(readEdn(src), "RootCount", handler)` | Recover from a root-count error (e.g., retry after stripping comments) |
| `Effect.catchTag(readEdn(src), "ReadError", handler)` | Surface the parser error with extra context |
| `Effect.matchEffect(readEdn(src), { onFailure, onSuccess })` | Branch on success/failure for the load pipeline |
| `Effect.either(readEdn(src))` → `Either.match` | Convert to `ReadResult` at sync boundaries without throwing |

Convention for future modules (`validate.ts`, `BuilderError`, etc.):
each module owns its own tagged error union that includes its
`Diagnostic` (e.g., `ValidateError = { _tag: ..., diagnostic: ... }`).
When composition is needed, downstream layers use `Effect.flatMap` and
either widen the error type or use `Effect.mapError` to remap.

## Data flow

```
source: string
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ Effect.gen(function* () { ... })                             │
│                                                              │
│   ┌──────────────────────────────────────────────┐           │
│   │ Effect.try({                                 │           │
│   │   try:  () => ednParseMulti(source),         │  ← sync   │
│   │   catch: (e) => ReadError{ _tag, diagnostic }│           │
│   │ })                                           │           │
│   └──────────────────────────────────────────────┘           │
│          │                                                   │
│          ▼                                                   │
│       forms: unknown[]   (synchronous, deterministic)        │
│          │                                                   │
│          ├─ length !== 1  ─► Effect.fail(RootCount)          │
│          ├─ forms[0] undef ─► Effect.fail(RootCount)         │
│          └─ ok             ─► return forms[0]                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
Effect<unknown, EdnError, never>
```

`Effect.try` (not `tryPromise`, not `sync`) is the right tool: a sync
function that throws, wrapped as an Effect with a failure channel.
`Effect.gen` (not `pipe` + helpers) because the two-step logic
(parser → root-count assertion) reads naturally as a generator.

| Input | Outcome | `_tag` | `diagnostic.code` |
|---|---|---|---|
| `""` | `Effect.fail(RootCount)` | `"RootCount"` | `"edn/root-count"` |
| `"1 2"` | `Effect.fail(RootCount)` | `"RootCount"` | `"edn/root-count"` |
| `"[1 2"` | `Effect.fail(ReadError)` | `"ReadError"` | `"edn/read-error"` |
| `"{:id :x :orphan}"` | `Effect.fail(ReadError)` | `"ReadError"` | `"edn/read-error"` |
| `"#casualtheorics.argdown2.solver/grounded ..."` | `Effect.succeed(value)` | — | — |

## Consumer migration

Both call sites currently do `const read = readEdn(source)` and read
it as a `ReadResult`. After the refactor, each picks its own unwrapper.

Note: `effect@4.0.0-beta` removed the top-level `Either` export and
`Effect.either` in favor of `Effect.match` + `Effect.runSyncExit`. The
idiomatic pattern for a sync boundary is `Effect.match` (which folds
`Effect<A, E>` into `Effect<UnionType, never>`) followed by
`Effect.runSync`. `Effect.runSync` on a `Effect<_, never>` is safe.

### `src/index.ts`

```ts
import { Effect } from "effect";
import { readEdn } from "./edn.js";

const result = Effect.runSync(
  Effect.match(readEdn(source), {
    onFailure: (err) => ({ ok: false as const, errors: [err.diagnostic] }),
    onSuccess: (value) => ({ ok: true as const, value }),
  }),
);
return result;
```

### `src/builder/soft-parse.ts`

Same pattern — `Effect.match` + `Effect.runSync` to recover the
`SoftParseResult` shape that downstream code expects.

### Why `Effect.match` (not `Effect.runSyncExit`)

`Effect.runSyncExit` returns an `Exit<A, E>` whose failure carries a
`Cause<E>` — more than we need for a sync failure (no defects, no
interruptions in this code path). `Effect.match` lets us fold the
`Effect<A, E>` directly into a value of our choosing — typically the
existing `ReadResult` shape — in one expression.

### Future migration (out of scope for this spec)

`src/index.ts` will eventually become an `Effect.gen` pipeline that
`yield* readEdn(source)` directly, composing with validate /
builder Effects. That's a follow-on refactor; this spec just unblocks
it.

## Testing strategy

### Two-level testing

| Layer | What it asserts | Tooling |
|---|---|---|
| **`readEdn` direct** | `Effect.match` returns `{ ok: true, value }` for valid, `{ ok: false, error }` for invalid; `error._tag` and `error.diagnostic` match the table | `Effect.runSync(Effect.match(...))` |
| **Consumers** (`index.ts`, `soft-parse.ts`) | Existing `ReadResult` / `SoftParseResult` shape is preserved after the unwrap | No new tests — existing tests already cover this |

### `src/edn.test.ts` — updated shape

```ts
import { Effect } from "effect";
import { readEdn } from "./edn.js";

function runRead(source: string) {
  return Effect.runSync(
    Effect.match(readEdn(source), {
      onFailure: (err) => ({ ok: false as const, error: err }),
      onSuccess: (value) => ({ ok: true as const, value }),
    }),
  );
}

it("preserves namespaced tags, keyword ids, maps, sets, and vectors", () => {
  const result = runRead(
    "#casualtheorics.argdown2.solver/grounded [...]",
  );
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value).toEqual({ tag: { ... }, value: [...] });
});

for (const [name, source] of [...error cases...] as const) {
  it(`returns ReadError for ${name}`, () => {
    const result = runRead(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe("ReadError");
    expect(result.error.diagnostic.code).toBe("edn/read-error");
  });
}

for (const [name, source] of [...root-count cases...] as const) {
  it(`returns RootCount for ${name}`, () => {
    const result = runRead(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error._tag).toBe("RootCount");
    expect(result.error.diagnostic).toEqual({
      code: "edn/root-count",
      message: "Expected exactly one top-level EDN value",
    });
  });
}
```

### What we do NOT add

- No `it.effect` blocks, no `TestClock` / `TestRuntime`. The parser
  is a sync pure function over a string; one either-branch per
  failure mode is enough.
- No `Effect.catchTag` tests yet — those belong to whichever future
  module first uses the tag discriminators. Documented in the pattern
  note as the recommended approach.

### Coverage preserved

| Existing case | Coverage after refactor |
|---|---|
| Preserves namespaced tags / keywords / maps / sets / vectors | ✅ Same assertion, different unwrap |
| Unbalanced collection, unterminated string, odd arity, orphan tag, numeric token, trailing delimiter | ✅ Now asserts `Left(_tag === "ReadError", diagnostic.code === "edn/read-error")` |
| Zero roots, multiple roots | ✅ Now asserts `Left(_tag === "RootCount", diagnostic matches ROOT_COUNT)` |

## Files touched

| File | Change |
|---|---|
| `deno.json` | Add `"effect": "npm:effect@^4.0.0-beta.101"` to imports |
| `src/model.ts` | Export `EdnError` (tagged union) next to `Diagnostic` |
| `src/edn.ts` | Refactor `readEdn` to return `Effect.Effect<unknown, EdnError, never>`; remove `rootCountFailure` / `readFailure` helpers |
| `src/edn.test.ts` | Update tests to use `Effect.runSync(Effect.either(...))` + `Either.match`; assert on `_tag` and `diagnostic` |
| `src/index.ts` | Replace `const read = readEdn(source)` with `Either.match` form preserving `ReadResult` shape |
| `src/builder/soft-parse.ts` | Same migration pattern as `index.ts` |
| `docs/snowball/specs/2026-07-25-effect-pattern.md` | New: convention reference for future modules |

## Out of scope (deferred)

- Migrating `src/validate.ts`, builder loaders, MCP layer to Effect —
  follow-on refactors.
- Removing `ReadResult` from `model.ts` — kept as a boundary type
  until consumers migrate.
- `Effect.catchTag` tests — first added when a consumer actually uses
  the tag discriminators.
- `Effect.gen` pipeline rewrite of `index.ts` — explicitly the *next*
  step after this lands, not part of this spec.

## Verification

After implementation:

1. `deno fmt --check` — formatting
2. `deno lint` — no new warnings (existing rules stay silent on
   `vendor/**`)
3. `deno check --frozen src/index.ts src/mcp/cli.ts` — types pass
4. `deno test -A --frozen --parallel src/` — all existing tests pass
   with the updated `edn.test.ts`; consumer tests unchanged
5. Grep confirms no remaining `try {` / `catch` around the parser
   call in `src/edn.ts` (the old hand-rolled error path is gone)