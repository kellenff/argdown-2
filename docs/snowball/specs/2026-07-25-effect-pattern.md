# Effect Pattern — argdown-2 Conventions

> **Reference for future Effect migrations.** Established by the
> EDN reader refactor (spec
> `2026-07-25-edn-effect-refactor-design.md`).

## Public API

Return `Effect.Effect<A, E, never>` from any function whose work is
synchronous, throws, and has typed failure modes. `R` is `never` unless
the function genuinely needs a service from the environment.

```ts
export function readEdn(
  source: string,
): Effect.Effect<unknown, EdnError, never> {
  // ...
}
```

## Errors

Each module owns its own tagged error union. Every variant carries the
existing `Diagnostic` shape so downstream consumers (validation, MCP,
builder) keep working unchanged.

```ts
export type EdnError =
  | { readonly _tag: "RootCount"; readonly diagnostic: Diagnostic }
  | { readonly _tag: "ReadError"; readonly diagnostic: Diagnostic };
```

Pattern:
- `_tag` is PascalCase, used for `Effect.catchTag` discriminators.
- Every variant carries a `diagnostic: Diagnostic` (never a raw
  string).
- `readonly` everywhere.

## Wrapping sync-throwing code

Use `Effect.gen` + `Effect.try` for synchronous functions that throw.
Do **not** use `Effect.tryPromise` (async) or `Effect.sync` (no
failure channel).

```ts
return Effect.gen(function* () {
  const forms = yield* Effect.try({
    try: () => ednParseMulti(source),
    catch: (error) =>
      ({ _tag: "ReadError", diagnostic: toDiagnostic(error) }) as const,
  });
  // ...
});
```

## Sync boundary

Callers that need a synchronous return value use
`Effect.runSync(Effect.match(...))`. `Effect.match` folds an
`Effect<A, E>` into `Effect<UnionType, never>` (the result has no
failure channel), so a subsequent `Effect.runSync` is guaranteed safe.
The typical pattern preserves the call-site's existing boundary
discriminated union (e.g., `LoadResult`, `SoftParseResult`):

```ts
return Effect.runSync(
  Effect.match(readEdn(source), {
    onFailure: (err) => ({ ok: false, errors: [err.diagnostic] }),
    onSuccess: (value) => validate(value),
  }),
);
```

> **Note:** `effect@4.0.0-beta` removed the top-level `Either` export
> and `Effect.either` in favor of `Effect.match`. Avoid `Either` in
> new code.

When the consumer is itself an `Effect.gen` pipeline, prefer
`yield* readEdn(source)` directly — no unwrap until the outermost
sync boundary.

## Composition

When downstream modules need to combine errors, compose with
`Effect.flatMap` and remap with `Effect.mapError`:

```ts
const validated = readEdn(source).pipe(
  Effect.flatMap(validate),
  Effect.mapError((e) => wrapWithStage("validate", e)),
);
```

## Testing

For sync pure functions, run tests via
`Effect.runSync(Effect.match(fn(input), { onFailure, onSuccess }))`
and assert on the resulting tagged union. One test per tag variant;
prefer focused per-field assertions over a single `toMatchObject`.

`Effect.catchTag` tests belong to the first consumer that uses the
tag discriminators — don't add them speculatively.

## Don't

- Don't throw from inside an `Effect.gen` body — use `Effect.fail`.
- Don't construct `Effect.try` with a `catch` that swallows the
  error — always surface as a typed failure.
- Don't invent a new ok/errors boundary type for Effect modules —
  unwrap with `Effect.match` + `Effect.runSync` into the call site's
  existing result type (`LoadResult`, `SoftParseResult`, etc.), or
  keep the Effect until the outermost sync boundary. The old
  `ReadResult` type was removed after the EDN reader migration.
