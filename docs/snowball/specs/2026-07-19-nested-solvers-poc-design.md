# Nested Solvers POC Design

**Date:** 2026-07-19
**Status:** POC
**Scope:** Allow depth-1 nesting of identical solver tags inside a parent solver
vector. Surface schema, ID-scoping, path, and result-shape rough edges before
mixed-semantics composition or combined tags.

## 1. Context

The EDN canonical design deliberately deferred multiple solver roots in one
document. After grounded, bipolar, evidential, preferred, stable, and complete
landed as sibling roots, the next composition question is nesting. This POC
nests **same-semantics** solvers only, with hard simplifications so the
pipeline can be exercised without solving the full composition problem.

## 2. Goals

- Accept a solver-tagged vector as a child of a parent solver vector when the
  child tag equals the parent tag.
- Validate and solve each nest as an independent subgraph.
- Return nested solve results alongside the parent result.
- Keep reducers and builder largely unchanged (skip nests; no nest-authoring
  MCP tools).

## 3. Non-goals / hard POC rules

- Mismatched nested tags (e.g. bipolar under grounded).
- Depth greater than 1 (solver inside a nest) — rejects with
  `schema/nested-solver-depth` (no nesting cycles / deeper trees).
- Cross semantic-root references — each root has its own ID map; parent cannot
  see nest IDs and nests cannot see parent or sibling IDs.
- Composition root above solvers, ASPIC+, combined tags (`preferred-bipolar`).
- New MCP builder ops for creating nests.

## 4. Wire shape

```edn
#casualtheorics.argdown2.solver/grounded
[
  #casualtheorics.argdown2.argdown/statement {:id :parent-claim}

  #casualtheorics.argdown2.solver/grounded
  [
    #casualtheorics.argdown2.argdown/statement {:id :a}
    #casualtheorics.argdown2.argdown/statement {:id :b}
    #casualtheorics.argdown2.argdown/attack {:from :a :to :b}
  ]
]
```

Works for any existing root tag. Nested bodies are flat theory vectors only.

## 5. Model

```ts
type CandidateNestedSolver = {
  kind: "nested-solver";
  document: CandidateDocument; // same solver; theory-only elements
};

type NestedSolver = {
  kind: "nested-solver";
  document: GroundedDocument;
};
```

Parent `elements` remain a documentary vector (theory + nests interleaved) so
diagnostic paths keep original indices. A validated nest never contains another
`nested-solver`.

## 6. Decode / validate / write

- Decode: known `SOLVER_TAGS` inside a root vector become nests. Root decode
  allows nesting (`allowNesting: true`); nest decode does not.
- Mismatch → `schema/nested-solver-mismatch`. Depth > 1 →
  `schema/nested-solver-depth`.
- Validate: independent ID maps per root. Cross-root refs surface as
  `semantic/missing-reference`. Nest diagnostics prefix the nest vector index.
- `writeEdn` emits nested solver tags and round-trips through load.

## 7. Solve

Reducers ignore `nested-solver` entries. `solve()` labels/extensions the parent
theory elements, then solves each depth-1 nest. Both `SolveResult` and
`MultiSolveResult` gain `nested: readonly (...)[]` (always present; empty when
none). Nest results always have `nested: []`.

## 8. Future work

- Mixed-semantics nesting and/or a composition root above solvers.
- Depth > 1 trees and explicit cross-root reference rules.
- Combined multi-extension × reduction tags (`preferred-bipolar`, etc.).
- Builder/MCP nest-authoring tools.
