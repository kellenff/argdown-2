# Effect Pattern — argdown-2 Conventions

> **Reference for future Effect migrations.** Established by the
> EDN reader refactor (spec
> `2026-07-25-edn-effect-refactor-design.md`). The Effect-native
> migration (2026-07-26) extended these conventions to builders, MCP
> I/O, and `solve`.

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

## Multi-error validation

When a module must report **all** diagnostics (not fail-fast), prefer:

- `Effect.sync` / success-channel `diagnostics` arrays for phases that
  must continue after soft errors (e.g. build an endpoints map while
  recording duplicate ids).
- `Effect.validate` when every element must be checked and successes
  can be discarded on any failure.
- `Effect.partition` / `Effect.match` when successes must be kept
  alongside failures (e.g. child solvers).

Collapse to a single tagged error at the module boundary:

```ts
Effect.mapError(diagnostics => ({
  _tag: "Semantic" as const,
  diagnostics,
}))
```

See `ValidateError` in `src/model.ts` and `src/validate.ts`.

## Sync boundary

Prefer keeping `Effect` until the outermost edge (CLI, MCP, test).
Unwrap only there with `Effect.runSync(Effect.match(...))` into a
**local** shape defined at that call site — e.g. `LoadReport` in
`src/cli/load.ts`, or a test-only union. Do **not** add new shared
ok/errors `Result` types for Effect modules.

```ts
// CLI boundary (LoadReport)
const result = Effect.runSync(
  Effect.match(load(source), {
    onFailure: (err) => ({ ok: false as const, err }),
    onSuccess: (document) => ({ ok: true as const, document }),
  }),
);
```

> **Note:** `effect@4.0.0-beta` removed the top-level `Either` export
> and `Effect.either` in favor of `Effect.match`. Avoid `Either` in
> new code.

When the consumer is itself an `Effect.gen` pipeline, prefer
`yield* parseCandidate(source)` (or `yield* load(source)`) directly —
no unwrap until the outermost sync boundary.

## Parse compositions

Public parse/load functions compose smaller Effect steps. None of these
add shared ok/errors boundary types — they stay as `Effect` until an
outer edge unwraps.

| Function | Pipeline | Success | Failure |
|----------|----------|---------|---------|
| `parseCandidate(source)` | `readEdn` → `decodeWire` | `CandidateDocument` | `EdnError \| SchemaError` |
| `validate(value)` | `decodeWire` → `validateCandidate` | `Document` | `SchemaError \| ValidateError` |
| `load(source)` | `parseCandidate` → `validateCandidate` | `Document` | `LoadError` |

`parseCandidate` performs wire decode only — it never runs semantic
validation (`validateCandidate`). Full document loading goes through
`load`, which chains parse then validate.

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
- Don't invent a new shared ok/errors boundary type for Effect modules
  — keep the Effect until the outermost sync boundary (CLI, MCP, test)
  and unwrap there into a local shape (`LoadReport` for CLI, or a
  test-only union). The old `ReadResult`, `LoadResult`, `SoftParseResult`,
  `ValidationResult`, `DecodeResult`, and `LoadDocResult` types were
  removed after the schema/Effect refactor.

## Effect-returning builders

Builder functions refuse edits with `Effect.fail(BuilderError)`:

```ts
export function apply(
  doc: CandidateDocument,
  edit: DocumentEdit,
): Effect.Effect<AppliedEdit, BuilderError> { /* ... */ }
```

Successes carry `{ document, warnings, diff }`. Warnings are
metadata, not failures. The tagged union enables
`Effect.catchTag(builderEffect, "Builder", handler)` for downstream
tooling that wants to recover from a refusal.

## Async I/O

For filesystem work, use `Effect.tryPromise`. Map raw errors to a
tagged `McpIoError` so consumers branch with `Effect.catchTag`:

```ts
return Effect.tryPromise({
  try: async () => readFile(ref.path, "utf8"),
  catch: (error) => ({
    _tag: "Read" as const,
    diagnostic: { code: "mcp/io-error", message: String(error) },
  }),
});
```

## MCP Promise adapter

The MCP SDK requires `Promise<McpResult>` handlers. Use one
helper at the outer edge of each tool:

```ts
export function runMcpEffect(
  eff: Effect.Effect<McpResult, never>,
): Promise<McpResult> {
  return Effect.runPromise(eff);
}
```

Internal tool bodies compose Effects with `Effect.gen` and end in
`return yield* runMutation(...)` or short-circuit with
`Effect.succeed(jsonResult(...))` / returning `jsonResult(...)`
from inside `Effect.gen`.
