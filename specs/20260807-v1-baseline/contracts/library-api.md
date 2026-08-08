# Library API Contract

**Date**: 2026-08-07
**Branch**: `20260807-v1-baseline`
**Spec anchor**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006
**Constitution anchor**: Principle I (Pipeline Purity), Principle II (Wire Stability)

## Surface

The public library API exported from `jsr:@casualtheorics/argdown-2`.
Consumers import these functions and types; they form the canonical
TypeScript surface of the library.

## Functions

### `load(source: string): Effect.Effect<Document, LoadError, never>`

Parse EDN source, decode, and validate a complete `Document`.

- **Input**: A string of EDN source text.
- **Output**: An `Effect` that:
  - **Succeeds** with a `Document` on well-formed input.
  - **Fails** with one of `EdnError | SchemaError | ValidateError`.
- **Throws**: Never.
- **Partial documents**: Never produced on failure (constitution
  Principle I).

```ts
import { Effect } from "effect";
import { load } from "jsr:@casualtheorics/argdown-2";

const result = Effect.runSync(
  Effect.match(load(ednSource), {
    onFailure: (err) => ({ ok: false as const, errors: err }),
    onSuccess: (doc) => ({ ok: true as const, document: doc }),
  }),
);
```

### `validate(value: unknown): Effect.Effect<Document, SchemaError | ValidateError, never>`

Run schema decode and cross-reference validation on a pre-parsed
value (e.g. one produced by `edn-parser-js` directly).

- **Input**: A JavaScript value (typically the output of an
  EDN parser).
- **Output**: An `Effect` that:
  - **Succeeds** with a `Document` on a well-typed, semantically
    valid value.
  - **Fails** with `SchemaError` (root tag mismatch, field type
    mismatch) or `ValidateError` (cross-reference break, unsupported
    relation kind, endpoint out of scope).

```ts
import { Effect } from "effect";
import { validate } from "jsr:@casualtheorics/argdown-2";

const candidate = JSON.parse(ednSource); // pre-parsed EDN value
const result = Effect.runSync(Effect.match(validate(candidate), { ... }));
```

### `solve(document: Document): Effect.Effect<ComponentSolveResult, SolveError>`

Evaluate a document bottom-up and return the per-component result.

- **Input**: A `Document` (typically from `load`).
- **Output**: An `Effect` that:
  - **Succeeds** with a `ComponentSolveResult` (per-component
    `native`, `aggregate`, `boundary`, `children`, `warnings`).
  - **Fails** with `SolveError` (which is `never` in v1 by design —
    the alias reserves the failure channel without committing to
    typed failures).
- **Partial results**: Never produced on failure.

```ts
import { Effect } from "effect";
import { solve } from "jsr:@casualtheorics/argdown-2";

const result = Effect.runSync(solve(document));
// result.native, result.aggregate, result.boundary, ...
```

### `parseCandidate(source: string): Effect.Effect<CandidateDocument, ParseCandidateError, never>`

Wire decode only (no semantic validation). Useful when callers want
to inspect a parsed value before deciding to validate or reject.

- **Input**: A string of EDN source.
- **Output**: An `Effect` that:
  - **Succeeds** with a `CandidateDocument` (post-`decodeWire`).
  - **Fails** with `ParseCandidateError` (`EdnError`).

### `apply(edit: AppliedEdit, document: Document): Effect.Effect<AppliedEdit, BuilderError, never>`

Apply a builder edit to a document. Refusals surface as typed
`BuilderCode` values.

- **Input**: A current `Document` and an `AppliedEdit` (the
  builder's request shape).
- **Output**: An `Effect` that:
  - **Succeeds** with the new `AppliedEdit` carrying the
    updated `Document` and any `warnings`.
  - **Fails** with `BuilderError` carrying a `BuilderCode`:
    - `builder/invalid-id`
    - `builder/duplicate-id`
    - `builder/missing-id`
    - `builder/unsupported-relation-kind`
    - `builder/unsupported-solver`
    - `builder/invalid-projection-bounds`
- **Silent omissions**: None — the builder refuses loud.

### `emptyDocument(opts?: EmptyDocumentOptions): Document`

Construct a fresh empty document.

- **Input**: Optional solver tag (defaults to `grounded`).
- **Output**: A `Document` with the canonical empty template.
- **Throws**: Never (pure constructor).
- **Side effects**: None.

## Public type re-exports

The following types are re-exported from `jsr:@casualtheorics/argdown-2`
and form the canonical type surface:

- `AggregateResult`
- `Argument`
- `CandidateDocument`
- `CandidateSolverComponent`
- `ComponentSolveResult`
- `Confidence`
- `Diagnostic`
- `Document`
- `DungFramework`
- `EdnError`
- `EntityId`
- `ExtensionNativeResult`
- `GroundedDocument`
- `IdentityAggregate`
- `Inference`
- `InferenceId`
- `Label`
- `LabelNativeResult`
- `LoadError`
- `MultiSolveResult`
- `ParseCandidateError`
- `Relation`
- `SchemaError`
- `SolveError`
- `SolverComponent`
- `SolverInterface`
- `SolverTag`
- `SolveResult`
- `Statement`
- `TheoryElement`
- `ThresholdProjection`
- `ValidateError`
- `BuilderCode`
- `BuilderError`

## Constants

The following constants are re-exported and are part of the wire
contract (constitution Principle II):

- `AGGREGATE_IDENTITY_TAG`
- `BIPOLAR_SOLVER_TAG`
- `COMPLETE_SOLVER_TAG`
- `DOCUMENT_TAG`
- `EVIDENTIAL_SOLVER_TAG`
- `EXTENSION_PROPORTION_OBSERVER_TAG`
- `GROUNDED_SOLVER_TAG`
- `PREFERRED_SOLVER_TAG`
- `PROJECTION_THRESHOLD_TAG`
- `SOLVER_TAGS` (canonical exhaustive registry; additive only)
- `STABLE_SOLVER_TAG`
- `supportedRelationKinds(tag: SolverTag): ReadonlySet<RelationKind>`

## Effect-failure channel matrix

| Caller | Failure tag | When |
|---|---|---|
| `load` | `EdnError.RootCount` | Root count ≠ 1 |
| `load` | `EdnError.ReadError` | EDN parse failure |
| `load` / `validate` | `SchemaError` | Root tag mismatch, field type mismatch |
| `load` / `validate` | `ValidateError` | Cross-reference break, unsupported relation kind, endpoint out of scope |
| `solve` | `SolveError` | (none in v1 — reserved alias) |
| `apply` | `BuilderError.invalidId` | ID fails EDN-keyword syntax |
| `apply` | `BuilderError.duplicateId` | ID already present in parent scope |
| `apply` | `BuilderError.missingId` | Ref points to non-existent ID |
| `apply` | `BuilderError.unsupportedRelationKind` | Relation not consumed by solver |
| `apply` | `BuilderError.unsupportedSolver` | Solver tag not in `SOLVER_TAGS` |
| `apply` | `BuilderError.invalidProjectionBounds` | `:threshold` not in `[0, 1]` |

## Stability

- Function signatures: **additive** (new optional params OK;
  new return fields OK if non-breaking).
- Type re-exports: **additive** (new types OK; removing a type is
  breaking).
- Constants (`SOLVER_TAGS` etc.): **additive** (new entries OK;
  removing or renaming an entry is breaking — constitution Principle II).
- Failure channels: **additive** (new failure tags OK; changing the
  semantics of an existing tag is breaking).
- `SolveError = never` is **reserved**: a future version may give
  it structure without breaking consumers who handle `never`.

## Anti-patterns

- **Catching thrown exceptions from these functions**: there are none
  to catch. All failures are in the `Effect` channel.
- **Assuming `solve` returns labels**: it returns `ComponentSolveResult`
  whose `.native.kind` is `'labels' | 'extensions'` depending on solver.
- **Hand-editing EDN** to bypass the builder: refused at validation
  with `ValidateError` (constitution Principle V).
