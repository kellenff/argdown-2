# Data Model: argdown-2 v1 Baseline

**Date**: 2026-08-07
**Branch**: `20260807-v1-baseline`
**Spec**: [spec.md](./spec.md)

> This document describes the **user-visible entities** that flow
> through the `argdown-2` pipeline (`load` → `validate` → `solve`)
> and the builder surface (`apply`, `emptyDocument`). Field names
> match the public TypeScript types in `src/model.ts` and
> `src/builder/types.ts`; this document does not duplicate
> implementation details (no method signatures, no internal
> invariants, no private state).

## Entity Relationship Overview

```text
Document
  └─ :root ─────────► SolverComponent (root)
                       ├─ :id (unique within parent)
                       ├─ :interface (Aggregate → Confidence)
                       ├─ :imports? ─► ThresholdProjection per child SolverComponent
                       └─ :elements ─┬─ TheoryElement
                       │             ├─ Statement
                       │             ├─ Argument
                       │             │  └─ Inference (premises → conclusion)
                       │             └─ Relation (attack | support | contradiction | undercut)
                       ├─ :children ─► SolverComponent[] (nested)
                       └─ :result ─► ComponentSolveResult (native / aggregate / boundary / children / warnings)
```

## Entities

### Document

The outermost unit of authorship. Tagged
`#casualtheorics.argdown2/document`.

| Field | Type | Purpose |
|---|---|---|
| `:id` | EDN keyword | Unique identifier for the document. |
| `:root` | SolverComponent | The identified root solver; evaluation starts here. |

**Validation rules**:
- Exactly one `:root` is required.
- Root `:id` is reserved and must not collide with any other element
  within the document (per FR-001/FR-002 schema decode).
- A malformed document fails `load` with `SchemaError` (root tag
  mismatch) or `ValidateError` (cross-reference break).

### SolverComponent

A typed component consumed by one of six solver roots. Tagged
`#casualtheorics.argdown2.solver/<name>` where `<name>` ∈
`{grounded, bipolar, evidential, preferred, stable, complete}`.

| Field | Type | Purpose |
|---|---|---|
| `:id` | EDN keyword | Unique within parent; referenceable as a relation endpoint. |
| `:interface` | Aggregate | Defines how this component's boundary is consumed by its parent. |
| `:imports` (optional) | Map<childId, ThresholdProjection> | Per-child confidence projection; absent means identity. |
| `:elements` | Vector<TheoryElement> | Local statements / arguments / inferences / relations. |
| `:children` (computed) | Map<childId, ComponentSolveResult> | Bottom-up evaluation results (populated by `solve`). |

**Solver semantics**:
- `grounded`: pure-attack labels; supports `attack`, `contradiction`;
  rejects `support`.
- `bipolar`: grounded labels with deductive support reduction
  (`B → sup:A→B → A`); supports `attack`, `contradiction`, `support`.
- `evidential`: grounded labels with necessary support reduction
  (`A → nec:A→B → B`); supports `attack`, `contradiction`, `support`.
- `preferred`: pure-attack extensions; supports `attack`,
  `contradiction`; rejects `support`.
- `stable`: pure-attack extensions; supports `attack`,
  `contradiction`; rejects `support`.
- `complete`: pure-attack extensions; supports `attack`,
  `contradiction`; rejects `support`.

**State transitions**:
1. Authored via builder (`apply` mutates `Document.root.elements`).
2. Validated via `load` (cross-ref + solver/relation compatibility).
3. Solved via `solve` (bottom-up; child results populate `:children`).
4. Consumed via boundary projection (`boundary` field) by parent.

### TheoryElement

A member of a solver component's `:elements` vector. One of:

| Subtype | Tag | Purpose |
|---|---|---|
| Statement | `#casualtheorics.argdown2.argdown/statement` | A node that can be attacked/supported. |
| Argument | `#casualtheorics.argdown2.argdown/argument` | A named container for inferences; first-class relation endpoint. |
| Inference | `#casualtheorics.argdown2.argdown/inference` | Links statement premises to a statement conclusion. |
| Support | `#casualtheorics.argdown2.argdown/support` | Directed support relation; consumed by bipolar/evidential only. |
| Attack | `#casualtheorics.argdown2.argdown/attack` | Directed Dung attack. |
| Contradiction | `#casualtheorics.argdown2.argdown/contradiction` | Bidirectional attack (attacks in both directions). |
| Undercut | `#casualtheorics.argdown2.argdown/undercut` | Targets an inference or relation; rejected by every current solver. |

**Validation rules**:
- IDs are unique within one solver component across all subtypes.
- Relation endpoints resolve to existing IDs in scope (component-local
  or imported via `:imports`).
- `undercut` is refused by the builder and fails validation.

### Aggregate

Defines how a child component's boundary is consumed by its parent.
Tagged `casualtheorics.argdown2.aggregate/*`.

| Subtype | Tag | Semantics |
|---|---|---|
| Identity | `#casualtheorics.argdown2.aggregate/identity` | Passes boundary through unchanged. |

The identity aggregate is the only aggregate currently defined.
Additional aggregates may be added additively (per constitution
Principle II).

### ThresholdProjection

A parent-side projection over a child boundary. Tagged
`#casualtheorics.argdown2.projection/threshold`. Used by
`set_import` / `remove_import` MCP tools.

| Field | Type | Purpose |
|---|---|---|
| `:ref` | EDN keyword | Child component `:id` being projected. |
| `:threshold` | Number in `[0, 1]` | Confidence floor; `IN → 1`, `OUT → 0`, `UNDEC → nil`. |

**Validation rules**:
- `:threshold` MUST be in `[0, 1]`; out-of-range fails with
  `builder/invalid-projection-bounds`.
- `:ref` MUST resolve to an immediate child solver component.

### Boundary

A per-solver typed confidence projection. Populated by `solve`.

| Solver | Boundary shape |
|---|---|
| `grounded` | `Map<EntityId, 0 \| 1 \| null>` (`IN → 1`, `OUT → 0`, `UNDEC → null`). |
| `bipolar` | Same as grounded (deductive labels). |
| `evidential` | Same as grounded (necessary labels). |
| `preferred` / `stable` / `complete` | Set<Set<EntityId>> (extension enumeration). |

### NativeResult

The solver-specific computation result inside `ComponentSolveResult.native`.

| Solver family | `kind` | `values` |
|---|---|---|
| Grounded-family (`grounded`, `bipolar`, `evidential`) | `'labels'` | `Map<EntityId, Label>` where `Label = 'in' \| 'out' \| 'undec'`. |
| Multi-extension family (`preferred`, `stable`, `complete`) | `'extensions'` | `Set<Set<EntityId>>` (non-empty for solvable frameworks). |

### ComponentSolveResult

The full per-component solve result. Populated by `solve`.

| Field | Type | Purpose |
|---|---|---|
| `native` | NativeResult | Solver-specific computation (the primary result). |
| `aggregate` | NativeResult | Parent's view (identity aggregate currently). |
| `boundary` | Boundary | Typed confidence projection for parents. |
| `children` | Map<childId, ComponentSolveResult> | Per-child evaluation results. |
| `warnings` | Array<Diagnostic> | Non-fatal diagnostics (cycles, self-attacks, orphans). |

### Tagged failure channels

Every failure channel in the pipeline is a tagged union member. These
are **user-visible contracts** (per FR-001, FR-002, FR-003):

| Channel | Triggered by | Carries |
|---|---|---|
| `EdnError` (`RootCount` \| `ReadError`) | Malformed EDN | `Diagnostic` with semantic path. |
| `SchemaError` | Root tag mismatch; field type mismatch | `Diagnostic`. |
| `ValidateError` | Cross-reference break; unsupported relation kind; endpoint out of scope | `Diagnostic` with `semantic/*` code. |
| `BuilderError` | Builder refusal | `BuilderCode` (`builder/invalid-id`, `builder/duplicate-id`, `builder/missing-id`, `builder/unsupported-relation-kind`, `builder/unsupported-solver`, `builder/invalid-projection-bounds`). |
| `McpIoError` (`Read` \| `Write` \| `Parse`) | MCP filesystem / wire I/O failure | `Diagnostic`. |
| `SolveError` | (none in v1 — reserved alias) | `never`. |

### Diagnostic

A position-tagged error descriptor attached to most failure channels.

| Field | Type | Purpose |
|---|---|---|
| `code` | string | Stable machine-readable code (e.g. `semantic/unsupported-relation-kind`). |
| `message` | string | Human-readable explanation. |
| `path` | Array<string\|number> | Semantic path into the document tree (e.g. `[:elements, 3, ':to']`). |

## Entity lifecycle summary

```
1. Authoring  ──► Document (via builder MCP tools / apply)
2. Persistence ──► .edn file on disk (atomic temp + rename)
3. Loading    ──► Document (via load / parseCandidate + validate)
4. Solving    ──► ComponentSolveResult (via solve, bottom-up)
5. Projection ──► Boundary (parent view, via :imports + :interface)
6. Reporting  ──► Native result to caller (library / CLI / MCP)
```

Each transition is a v1 release gate:

| Transition | Gate (FR) | Failure channel |
|---|---|---|
| Authoring → Persistence | FR-008, FR-009 | `BuilderError`, atomic write guarantees |
| Persistence → Loading | FR-001, FR-002 | `EdnError`, `SchemaError`, `ValidateError` |
| Loading → Solving | FR-003, FR-004 | (none in v1; `SolveError = never`) |
| Solving → Projection | (component-eval semantics) | `warnings` (non-fatal) |
| Projection → Reporting | (CLI / MCP / library) | typed response shape (FR-010) |

## Identity rules

- IDs are EDN keywords.
- IDs are unique within one solver component across all element
  subtypes and immediate child solver components.
- Sibling components may reuse local IDs (no cross-component ID
  collision check).
- Root `:id` is unique within the document.
- Hand-written EDN that violates these rules is refused by validation
  with `ValidateError`, never silently corrected.

## Notes for downstream consumers

- The library never produces a partial document on failure (constitution
  Principle I).
- All entities are immutable from the consumer's perspective; mutations
  flow through the builder (`apply`) which returns a new `Document`.
- `Boundary` is the only entity a parent ever sees from a child;
  internal `:elements` are private to the component.
- Solver choice is per-component and read from the EDN root tag;
  there is no `--semantics` CLI flag.
