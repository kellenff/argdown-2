# Medium review findings — design

Address two medium findings from the first-class solver components review.

## 1. Reject solver-unsupported relation kinds at validation

**Problem.** Validation currently checks relation *endpoints* but not relation
*kinds*. A `support` or `undercut` under grounded / multi-extension passes
`validate` and is later dropped by reduction with a warning. That violates the
first-class design rule that unsupported semantic combinations fail before
solving.

**Change.** Each solver declares the relation kinds it consumes:

| Solver family | Supported kinds |
| --- | --- |
| grounded, preferred, stable, complete | `attack`, `contradiction` |
| bipolar, evidential | `attack`, `contradiction`, `support` |

`undercut` is unsupported by every current solver. Validation emits
`semantic/unsupported-relation-kind` and fails the document.

Reducer-level omission warnings remain as a defensive path for directly
constructed (unvalidated) `SolverComponent` values in unit tests. Validated
documents no longer reach that path for unsupported kinds.

**Fixture impact.** Grounded fixtures that currently carry ornamental `support`
edges (censorship parity, medium-censorship, large-stress, small-relations)
must drop those edges or switch to a solver that consumes `support`. Labels for
censorship parity are pure-attack and stay identical after removing support.

Builder `add_relation` may refuse early when the target component's solver
rejects the kind (`builder/unsupported-relation-kind`), matching validate.

## 2. Nested component construction via builder / MCP

**Problem.** Nested solvers are load/validate/solve/write only. `DocumentEdit`
and MCP tools mutate `doc.root.elements` exclusively, so agents cannot build
component trees through the tools.

**Change.** Scope mutations with optional `parentId` (defaults to the document
root id). Add three edits / MCP tools:

- `add_solver` — insert an empty child solver under `parentId`
- `set_import` — set a threshold projection for an immediate child
- `remove_import` — drop a parent import key

Existing mutations (`add_statement`, `add_argument`, `add_inference`,
`add_relation`, `remove_*`, `update_statement`) accept `parentId` and apply
inside that component's local scope. ID uniqueness, ref resolution, and
interface bootstrap/repair remain local to the target component.

Constraints already enforced by validation still apply: only grounded parents
may contain children; multi-extension children under grounded require an import
projection; import keys must name immediate children.

## Out of scope

- Composite parents other than grounded
- Native `undercut` reduction
- Multi-input aggregates / additional observers
