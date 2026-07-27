# Effect-Native Migration — Design Spec

**Status:** Draft. Under brainstorming review.
**Date:** 2026-07-26
**Predecessor:** `docs/snowball/specs/2026-07-25-edn-effect-refactor-design.md`
and the validate/parseCandidate/multi-error follow-on commits.

## Context

The first wave of the Effect migration is complete:

- `readEdn`, `decodeWire`, and `parseCandidate` return Effects
- public `load` and `validate` compose those Effects with `Effect.gen`
- CLI and MCP sync boundaries unwrap with `Effect.runSync(Effect.match(...))`
- legacy `LoadResult`, `softParse`, and the dedicated `Result` helper
  are removed
- a pattern note documents the convention

What remains is a thinner but still meaningful surface that mixes three
programming models: synchronous pure functions, ad-hoc result unions
(`{ ok: true, ... } | { ok: false, errors }`), and `Promise`-based
asynchronous orchestration. The mix lives in three areas:

1. The public library API still exposes one synchronous function:
   `solve(document): ComponentSolveResult` (no failure channel,
   because the solver is currently pure).
2. The builder layer (`src/builder/apply.ts` and friends) still
   refuses edits by returning a discriminated union, so every
   mutation site manually inspects `.ok`.
3. The MCP layer (`src/mcp/io.ts`, `src/mcp/tools.ts`) is built on
   `await` + `try`/`catch` + `Promise<{ ok, ... }>` returns. The 14
   MCP tool handlers all share the same try-then-await-then-await
   pattern, repeated 14 times.

This spec completes the migration so the library exposes one Effect
surface, the builder refuses via `Effect.fail`, and the MCP layer
composes Effects with a single `Effect.runPromise` adapter at the
outer edge. The CLI, MCP server SDK, and Pi extension stay
Promise-based only at their required boundary callbacks.

What this spec changes:

- public `solve` becomes an `Effect`
- `apply`, `applyMutation`, and their callers become Effect-based
- `mcp/io.ts` becomes Effect-based file I/O
- `mcp/tools.ts` composes Effects and uses one Promise adapter
- `mcp/server.ts` and `pi/extensions/argdown-2-mcp.ts` keep their
  host-required Promise signatures but invoke Effect-based helpers
- legacy result-union helpers (`ApplyResult`, ad-hoc
  `{ ok: true; ref }` / `{ ok: false; errors }`) are removed from
  public exports and replaced with Effect-returning equivalents
- test helpers, the existing `ReadResult` boundary type, and CLI
  command modules are updated to use Effects end to end

What this spec does **not** change:

- the wire format (EDN) or the JSON MCP response shapes
- the diagnostic codes or their human-readable messages
- solver algorithms (still pure, just wrapped in `Effect.sync`)
- the EDN parser or schema decoder
- the published `pi` package or `argdown-2-mcp` launcher

## Decision

| Decision | Choice | Rationale |
|---|---|---|
| Public `solve` shape | `Effect<ComponentSolveResult, SolveError>` (with `SolveError` empty for v1) | One programming model across the library; lets future solver features (warnings-as-failures, etc.) compose naturally. |
| `load` error union | Keep `LoadError = EdnError \| SchemaError \| ValidateError` | Already established by the prior refactor. |
| Builder refusal | Replaces `{ ok: true, document, ... } \| { ok: false, refused }` with `Effect<{ document, warnings, diff }, BuilderError>`; warnings remain on the success value | Removes manual `.ok` checks; lets mutation workflows use `Effect.gen`. |
| `mcp/io.ts` shape | Functions return `Effect<A, McpIoError>`; `readFile` uses `Effect.tryPromise` | One error channel for all persistence failures. |
| `mcp/tools.ts` | Each tool builds an `Effect<McpResult, never>` composed with `Effect.gen`; refused edits branch with `Effect.flatMap` and `Effect.catchTag` | Removes the 14× repeated try-then-await-then-await pattern. |
| SDK adapter | A single `runMcpEffect(eff)` helper converts `Effect<McpResult, never>` → `Promise<McpResult>` via `Effect.runPromise` | MCP SDK requires `Promise` handlers; the conversion is one line per tool. |
| Pure solver | Wrapped with `Effect.sync`; no failure channel today | Preserves deterministic semantics; leaves room for typed failures later. |
| Error scope at MCP boundary | Refused edits → structured non-error JSON (preserves current `ok: false, refused` shape); fatal errors → `isError: true` with `mcp/io-error` or `LoadError` | Maintains the current MCP protocol contract. |
| `ReadResult` boundary type | Removed from exports; consumers use `Effect.match` | Already deferred; this is the cleanup step. |
| Pattern note | Update `docs/snowball/specs/2026-07-25-effect-pattern.md` to cover MCP orchestration, builder refusal, and async I/O | Single source of truth. |

## Public API surface

### Library exports

```ts
// src/index.ts
export function parseCandidate(
  source: string,
): Effect.Effect<CandidateDocument, ParseCandidateError, never>;

export function validate(
  value: unknown,
): Effect.Effect<Document, SchemaError | ValidateError, never>;

export function load(
  source: string,
): Effect.Effect<Document, LoadError, never>;

export function solve(
  document: Document,
): Effect.Effect<ComponentSolveResult, never>;

export function applyMutation(
  document: CandidateDocument,
  edit: DocumentEdit,
): Effect.Effect<ApplyResult, BuilderError, never>;
```

- `LoadError`, `ParseCandidateError`, `SchemaError`, `ValidateError`,
  and `EdnError` are unchanged from the prior refactor
- `BuilderError` is a new tagged union exported from
  `src/builder/types.ts`
- `ApplyResult` keeps the same name but its shape changes:
  - on success: `{ ok: true, document: CandidateDocument, warnings: readonly BuilderWarning[], diff: readonly EditDiff[] }`
  - on refusal: `Effect.fail(BuilderError)` carries the same payload
    that was previously embedded in `{ ok: false, refused }`

### Adapter boundaries

- `runMcpEffect(eff: Effect<McpResult, never>): Promise<McpResult>` —
  the single bridge for SDK-required Promise handlers
- `runCliEffect(eff, options): Promise<number>` — for CLI subcommands
  that need filesystem I/O; for purely synchronous commands the
  current direct call is fine
- `pi/extensions/argdown-2-mcp.ts` — its `Promise<void>`-returning
  callbacks invoke the Effect-based helpers via `Effect.runPromise`;
  the extension’s public surface is unchanged

## Module-by-module change set

### `src/model.ts`

Add `SolveError` (empty for v1, leaves room for typed failures):

```ts
export type SolveError = never;
```

### `src/builder/types.ts`

Add the new `BuilderError` shape:

```ts
export type BuilderError = {
  readonly _tag: "Builder";
  readonly code: BuilderCode;
  readonly message: string;
  readonly path: ReadonlyArray<string | number>;
  readonly warnings: readonly BuilderWarning[];
};
```

`BuilderCode` enumerates the existing builder refusal codes. The
shape matches what was previously embedded in
`{ ok: false, refused }` so JSON MCP responses stay byte-equivalent.

### `src/builder/apply.ts`

Replace the union return with an `Effect`:

```ts
export function apply(
  document: CandidateDocument,
  edit: DocumentEdit,
): Effect.Effect<
  { document: CandidateDocument; warnings: readonly BuilderWarning[]; diff: readonly EditDiff[] },
  BuilderError
> {
  return Effect.gen(function* () {
    const candidate = update(document, edit);
    if (!candidate.ok) {
      return yield* Effect.fail({
        _tag: "Builder" as const,
        code: candidate.code,
        message: candidate.message,
        path: candidate.path,
        warnings: candidate.warnings,
      } as const);
    }
    return {
      document: candidate.document,
      warnings: candidate.warnings,
      diff: candidate.diff,
    };
  });
}
```

### `src/mcp/io.ts`

Convert all file operations to `Effect.tryPromise` and unify
errors:

```ts
export function readDocumentSource(
  ref: DocumentRef,
): Effect.Effect<DocumentSource, McpIoError> { /* ... */ }

export function saveDocumentRef(
  ref: DocumentRef,
  document: CandidateDocument,
): Effect.Effect<SaveResult, McpIoError> { /* ... */ }

export function createDocumentRef(
  ref: DocumentRef,
  solver: SolverTag,
  documentId: string,
  rootId: string,
): Effect.Effect<CreateResult, McpIoError> { /* ... */ }
```

`DocumentSource` is a tagged union
`{ _tag: "Path"; path: string; source: string } | { _tag: "Text"; source: string }`
so callers don’t branch on `"path" in ref` at every site. The
`Path` variant also carries the original path so error messages
can report it.

`McpIoError` is a tagged union:

```ts
export type McpIoError =
  | { readonly _tag: "Read"; readonly diagnostic: Diagnostic }
  | { readonly _tag: "Write"; readonly diagnostic: Diagnostic }
  | { readonly _tag: "Parse"; readonly diagnostic: Diagnostic };
```

`parseDocumentSource` (parse + validate) composes `readDocumentSource` →
`parseCandidate` → `validateCandidate`, mapping non-IO errors into
`McpIoError._tag: "Parse"`.

### `src/mcp/tools.ts`

Each tool becomes an `Effect` workflow. The repetitive
await-then-await-then-await pattern collapses into one `Effect.gen`
per tool:

```ts
export function runAddStatement(
  args: AddStatementInput,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const ref = normalizeStatementDocRef(args);
    if (!ref.ok) {
      return jsonResult({ ok: false, errors: ref.errors }, true);
    }
    const edit: DocumentEdit = { /* ... */ };
    return yield* runMutation(ref.ref, edit);
  });
}
```

`runMutation` is the shared core for the seven mutation tools
(`addStatement`, `updateStatement`, `addArgument`, `addInference`,
`addRelation`, `addSolver`, `setImport`, `removeImport`):

```ts
function runMutation(
  ref: DocumentRef,
  edit: DocumentEdit,
): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const loaded = yield* loadDocumentSource(ref);
    const applied = yield* apply(loaded.document, edit);
    const saved = yield* saveDocumentRef(ref, applied.document);
    return jsonResult({
      ok: true,
      warnings: applied.warnings,
      diff: applied.diff,
      ...savedToBody(saved),
    });
  });
}
```

`runValidate` and `runSolve` become a single composable flow
reading a source and running the appropriate Effect:

```ts
export function runValidate(args: DocRefInput): Effect.Effect<McpResult, never> {
  return Effect.gen(function* () {
    const source = yield* readSourceOrError(args);
    if (!source.ok) return source.result;
    return yield* Effect.match(validate(JSON.parse(source.value)), {
      onFailure: (err) => jsonResult({ ok: false, errors: [...err.diagnostics] }),
      onSuccess: () => jsonResult({ ok: true }),
    });
  });
}
```

Note: today `runValidate` calls `load(source)` which does
parse + validate. The new `runValidate` switches to `decodeWire`
+ `validate` since `runValidate` is used with `source: string`
input that is already a parseable EDN document. (Behavior
preserved — see Data flow for the exact input contract.)

The exported `runX` functions keep their `Promise<McpResult>`
signatures for SDK compatibility, but each is a one-liner:

```ts
export const runAddStatement = (
  args: AddStatementInput,
): Promise<McpResult> => runMcpEffect(runAddStatementEffect(args));
```

where `runMcpEffect` is the single adapter. The `runX` functions
move from a file of 600+ lines to a thin delegation layer.

### `src/mcp/server.ts`

No public shape change. The `server.tool(name, schema, async (args) => runX(args))`
registration stays; the `async` body is unchanged because the
Promise adapter is already in `runX`.

### `src/mcp/io.ts` and `mcp/tools.ts` test surface

`src/mcp/io.test.ts` is new and covers:

- `readDocumentSource` on a path
- `readDocumentSource` on text
- filesystem read failure (write a path that does not exist, expect
  `McpIoError._tag: "Read"`)
- atomic write success
- atomic write rename failure
- `createDocumentRef` path/text branches
- `parseDocumentSource` parse failure → `McpIoError._tag: "Parse"`
- `parseDocumentSource` semantic failure → `McpIoError._tag: "Parse"`

`src/mcp/tools.test.ts` is updated to:

- remove the per-tool `await` dance
- assert on the JSON body shape (the existing snapshots stay
  valid because the protocol contract is unchanged)

### `src/cli/solve.ts`, `src/cli/load.ts`, `src/cli/input.ts`

- `cli/load.ts` becomes an `Effect.runSync(Effect.match(...))` of
  `load(source)`, matching the convention already used
- `cli/solve.ts` runs `Effect.runSync(load(...))` then
  `Effect.runSync(solve(document))` to compute the result, then
  formats via the existing pure formatters
- `cli/input.ts` stays async (filesystem I/O), unchanged
- the `cli.test.ts` files keep their current shape; they assert on
  the formatted output

### `src/test-support.ts`, `src/cli/load.ts`, `src/edn.test.ts`,
`src/builder/parse-candidate.test.ts`

These were already updated to use `Effect.match` + `Effect.runSync`
in the prior refactor. No further changes.

### `docs/snowball/specs/2026-07-25-effect-pattern.md`

Append (or rewrite) to cover:

- Effect-returning builder functions
- `Effect.tryPromise` for filesystem I/O
- the `runMcpEffect` adapter
- `Effect.suspend` for the cyclic-style tools that need to build
  a value before declaring the Effect body

## Data flow

### Load → validate → solve (MCP `solve` tool)

```
DocRefInput
    │
    ▼
runSolveEffect(args)
    │
    ▼
readSourceOrError(args)        ─── Effect<{ ok, value } | { ok, result: McpResult }, never>
    │                              (normalizes doc ref, reads filesystem if path,
    │                               short-circuits to McpResult on invalid input)
    ▼
load(source)                    ─── Effect<Document, LoadError, never>
    │
    ▼
solve(document)                 ─── Effect<ComponentSolveResult, never>
    │
    ▼
format(result, ...)             ─── pure
    │
    ▼
jsonResult({ ok: true, result })  ─── McpResult
```

### MCP mutation (`runAddStatement` and friends)

```
DocRefInput & AddStatementArgs
    │
    ▼
runAddStatementEffect(args)
    │
    ▼
normalizeStatementDocRef(args)  ─── pure: { ok, ref, statementText? } | { ok, errors }
    │  short-circuits to McpResult on error
    ▼
runMutation(ref, edit)
    │
    ▼
loadDocumentSource(ref)         ─── Effect<DocumentSource, McpIoError>
    │   ┌─ ref.path    → Effect.tryPromise(readFile) → McpIoError.Read
    │   └─ ref.text    → Effect.succeed
    ▼
parseDocumentSource(source)     ─── Effect<CandidateDocument, McpIoError>
    │   parseCandidate → validateCandidate
    │   any non-IO error becomes McpIoError.Parse
    ▼
apply(document, edit)           ─── Effect<{ document, warnings, diff }, BuilderError>
    │  builder refusal: Effect.fail(BuilderError) → returned as McpResult with refused payload
    ▼
saveDocumentRef(ref, document)  ─── Effect<SaveResult, McpIoError>
    │   ┌─ ref.text    → Effect.succeed({ text })
    │   └─ ref.path    → Effect.tryPromise(write tmp + rename)
    ▼
jsonResult({ ok: true, warnings, diff, path|text })
```

### CLI `solve` subcommand

```
argv  ──► parseArgs(opts)       (optique, pure)
       ──► Effect.runSync(load(source))        ──► Document
       ──► Effect.runSync(solve(document))     ──► ComponentSolveResult
       ──► format(result, format, textLookup)  (pure)
       ──► writeStdout(text)
```

The CLI is `Effect.runSync` for both `load` and `solve` because both
have no failure channel once we strip out the public-Result shape
(`load` is allowed to fail, and CLI handles the failure with
`Effect.match`-based unwrap, mirroring the existing `cli/load.ts`
pattern).

## Error handling model

| Operation | Channel | Reason |
|---|---|---|
| EDN parse | `EdnError` | already established |
| Schema decode | `SchemaError` | already established |
| Semantic validate | `ValidateError` | already established |
| Apply refusal | `BuilderError` | new — replaces ad-hoc union |
| Filesystem read | `McpIoError.Read` | new — replaces raw `try`/`catch` |
| Filesystem write | `McpIoError.Write` | new — replaces raw `try`/`catch` |
| Parse failure inside `mcp/io.ts` | `McpIoError.Parse` | new — wraps `LoadError` |
| Solve (v1) | `never` | pure; room for typed failures later |

Combinators used:

- `Effect.try` for synchronous third-party calls (EDN parser,
  schema)
- `Effect.tryPromise` for filesystem
- `Effect.fail` for expected domain refusals
- `Effect.catchTag` for tag-discriminated recovery (e.g. mapping
  `BuilderError` to the structured MCP response)
- `Effect.match` to fold into either a success JSON or an error
  JSON at the MCP boundary
- `Effect.sync` for pure solver
- `Effect.die` is not introduced anywhere; any current
  silent-throw paths become `Effect.fail`

## Testing strategy

### Updated tests

| Test file | Change |
|---|---|
| `src/edn.test.ts` | unchanged (prior refactor) |
| `src/builder/parse-candidate.test.ts` | unchanged (prior refactor) |
| `src/builder/apply.test.ts` (new or extended) | assert `Effect.fail(BuilderError)` for each refused edit; assert `Effect.succeed` carries warnings + diff |
| `src/mcp/io.test.ts` (new) | filesystem read/write/rename success and failure; `parseDocumentSource` error mapping |
| `src/mcp/tools.test.ts` | remove `await` boilerplate; assert JSON body matches existing snapshots (no contract change) |
| `src/mcp/server.test.ts` | unchanged in shape (tests SDK integration); updated if handler signatures change |
| `src/multi-extension.test.ts`, `src/first-class-components.test.ts` | use `Effect.runSync(load(...))` then `Effect.runSync(solve(...))` |
| `src/solvers.test.ts` | use `Effect.runSync` for `load` and `solve` |
| `src/cli/load.ts` and CLI command tests | use `Effect.runSync(Effect.match(load(...), ...))` pattern |
| `src/test-support.ts` | `runLoad` returns `{ ok: true, document } \| { ok: false, errors }` by running `Effect.match(load(...))` |

### New tests

- `BuilderError` is composed via `Effect.catchTag` in the mutation
  helpers (one test in `mcp/tools.test.ts`)
- `runMutation` short-circuits on `Effect.fail(BuilderError)` and
  renders the refused shape (one test per mutation tool, via
  parameterised cases)
- atomic write failure (rename to a non-existent directory) maps
  to `McpIoError.Write`
- `readDocumentSource` on a missing file maps to `McpIoError.Read`

### Coverage preserved

- all existing snapshot tests in `mcp/tools.test.ts` stay green
- all CLI exit-code tests stay green
- all solver unit tests stay green (semantics unchanged)
- EDN canonical-representation and parsing tests stay green

## Files touched

| File | Change |
|---|---|
| `src/model.ts` | Add `SolveError` (empty for v1) |
| `src/builder/types.ts` | Add `BuilderError` and `BuilderCode` |
| `src/builder/apply.ts` | `apply` returns `Effect<...>` instead of `ApplyResult` |
| `src/builder/apply.test.ts` | Update to Effect assertions |
| `src/mcp/io.ts` | Convert file ops to `Effect.tryPromise`; add `McpIoError` |
| `src/mcp/io.test.ts` | New: filesystem + parse error mapping |
| `src/mcp/tools.ts` | Refactor 14 tools into composable Effects; add `runMcpEffect` adapter; add `runMutation` shared core |
| `src/mcp/tools.test.ts` | Update to call `runXEffect` and assert on JSON body |
| `src/mcp/server.ts` | No public shape change |
| `src/index.ts` | `solve` returns `Effect<ComponentSolveResult, never>`; `applyMutation` exported |
| `src/solvers.test.ts` | Use `Effect.runSync(solve(...))` |
| `src/multi-extension.test.ts` | Use `Effect.runSync(solve(...))` |
| `src/first-class-components.test.ts` | Use `Effect.runSync(solve(...))` |
| `src/test-support.ts` | `runLoad` via `Effect.match` |
| `src/cli/load.ts` | Use `Effect.match` + `Effect.runSync` (already there) |
| `src/cli/solve.ts` | Use `Effect.runSync` for `load` and `solve` |
| `src/cli/snapshots.test.ts` | Update if exit-code or output shape changes (should not) |
| `docs/snowball/specs/2026-07-25-effect-pattern.md` | Update with Effect-native builder, MCP adapter, I/O sections |
| `README.md` | Update API examples to use `Effect.runSync(solve(...))` |
| `CHANGELOG.md` | Note the breaking `solve` shape change |

## Out of scope (deferred)

- Removing the `vendor/effect/` checkout (it remains a reference;
  matching the prior refactor’s decision)
- Re-platforming MCP tool schemas to Effect Schema
- A typed `SolveError` (left as `never` for v1; the `SolveError`
  alias exists so the API can be widened without a breaking change)
- Migrating `pi/extensions/argdown-2-mcp.ts` to Effect internally
  (it remains Promise-based because its host API requires it; it
  uses the Effect-based helpers via `Effect.runPromise`)

## Verification

After implementation:

1. `deno fmt --check` — formatting
2. `deno lint` — no new warnings
3. `deno check --frozen src/index.ts src/mcp/cli.ts` — types pass
4. `deno test -A --frozen --parallel src/` — all tests pass
5. `deno task probe:mcp` (or the equivalent stdio smoke flow) — MCP
   server still answers `create_document` → `add_statement` →
   `add_relation` → `solve` correctly
6. `deno task compile:mcp && deno task check:mcp-deno` — the
   shipped binary path still type-checks and launches
7. Grep confirms no remaining `try {`/`catch` around file I/O in
   `src/mcp/io.ts` and no remaining `{ ok: true, ref }` / `{ ok:
   false, errors }` unions in `src/mcp/tools.ts`
8. `pi/extensions/argdown-2-mcp.ts` still compiles and its
   integration tests still pass (it uses the Effect helpers via
   the Promise adapter)
